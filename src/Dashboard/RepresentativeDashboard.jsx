import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../SupabaseClient';
import { useUser } from '../context/UserContext';
import './RepresentativeDashboard.css';

function RepresentativeDashboard() {
    const navigate = useNavigate();
    const { email, name, userId, setEmail, setName, setRole, setUserId } = useUser();
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('new');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedComplaint, setSelectedComplaint] = useState(null);
    const [responseText, setResponseText] = useState('');
    const [showForwardModal, setShowForwardModal] = useState(false);
    const [showReplyModal, setShowReplyModal] = useState(false);
    const [forwardPriority, setForwardPriority] = useState('');
    const [forwardComment, setForwardComment] = useState('');
    const [stats, setStats] = useState({
        assigned: 0,
        reviewed: 0,
        forwarded: 0,
        open: 0,
        closed: 0,
        total: 0
    });

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setEmail('');
        setName('');
        setRole('');
        setUserId(null);
        navigate('/login');
    };

    useEffect(() => {
        fetchComplaints();
    }, [userId]);

    const fetchComplaints = async () => {
        setLoading(true);
        try {
            // Fetch complaints without foreign key relationship
            let query = supabase
                .from('complaint')
                .select('*')
                .order('created_at', { ascending: false });

            // Fetch complaints assigned to this representative
            if (filter === 'new') {
                query = query.eq('cmplt_with_userid', userId);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Error fetching complaints:', error);
                setLoading(false);
                return;
            }

            // Fetch user data for each complaint
            const complaintsWithUsers = await Promise.all(
                (data || []).map(async (complaint) => {
                    if (complaint.user_id) {
                        const { data: userData, error: userError } = await supabase
                            .from('user')
                            .select('name, email')
                            .eq('user_id', complaint.user_id)
                            .single();

                        if (!userError && userData) {
                            return { ...complaint, user: userData };
                        }
                    }
                    return { ...complaint, user: null };
                })
            );

            console.log('complaintsWithUsers', complaintsWithUsers);

            setComplaints(complaintsWithUsers);
            calculateStats(complaintsWithUsers);
        } catch (error) {
            console.error('Unexpected error:', error);
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (data) => {
        const assignedComplaints = data.filter(c => c.cmplt_with_userid === userId);
        const stats = {
            assigned: assignedComplaints.filter(c => c.status === 'new').length,
            reviewed: assignedComplaints.filter(c => c.status === 'reviewed').length,
            forwarded: assignedComplaints.filter(c => c.status === 'forwarded').length,
            open: assignedComplaints.filter(c => c.status === 'open').length,
            closed: assignedComplaints.filter(c => c.status === 'closed').length,
            total: data.length
        };
        setStats(stats);
    };

    const updateComplaintStatus = async (complaintId, newStatus) => {
        try {
            const { error } = await supabase
                .from('complaint')
                .update({ status: newStatus })
                .eq('complaint_id', complaintId);

            if (error) {
                console.error('Error updating status:', error);
                alert('Failed to update status');
            } else {
                alert('Status updated successfully');
                fetchComplaints();
                setSelectedComplaint(null);
            }
        } catch (error) {
            console.error('Unexpected error:', error);
        }
    };

    const replyToParent = async (complaintId) => {
        if (!responseText.trim()) {
            alert('Please enter a reply message');
            return;
        }

        try {
            // Insert comment into comment table
            const { error } = await supabase
                .from('comment')
                .insert({
                    complaint_id: complaintId,
                    user_id: userId,
                    comment_text: responseText,
                    visible_to: 'parent',
                    created_at: new Date().toISOString()
                });

            if (error) {
                console.error('Error adding reply:', error);
                alert('Failed to send reply to parent');
            } else {
                alert('Reply sent to parent successfully!');
                setResponseText('');
                setShowReplyModal(false);

                // Update complaint status to 'reviewed'
                await supabase
                    .from('complaint')
                    .update({ status: 'reviewed' })
                    .eq('complaint_id', complaintId);

                fetchComplaints();
            }
        } catch (error) {
            console.error('Unexpected error:', error);
            alert('An unexpected error occurred');
        }
    };

    const forwardToPrincipal = async (complaintId, priority, comment) => {
        if (!comment?.trim()) { // Optional comment check handled in UI/Logic
            // If we want comment to be optional, we can remove this check or make it conditional.
            // Given user request is vague on comment, keeping it required for now as per my previous logic,
            // but I will ensure the UI sends 'Forwarded via badge' if empty or handles it.
            // Actually, the new modal has comment field.
        }

        // Revised validation to allow empty comment if needed, but keeping strict for better clear communication
        if (!comment || !comment.trim()) {
            alert('Please enter a comment for the principal');
            return;
        }

        if (!priority) {
            alert('Please select a priority level');
            return;
        }

        try {
            // Insert comment into comment table
            const { error: commentError } = await supabase
                .from('comment')
                .insert({
                    complaint_id: complaintId,
                    user_id: userId,
                    comment_text: comment,
                    visible_to: 'principal',
                    created_at: new Date().toISOString()
                });

            if (commentError) {
                console.error('Error adding comment:', commentError);
                alert('Failed to add comment');
                return;
            }

            // Update complaint status to 'forwarded' and set priority
            const { error: updateError } = await supabase
                .from('complaint')
                .update({
                    status: 'forwarded',
                    priority: priority
                })
                .eq('complaint_id', complaintId);

            if (updateError) {
                console.error('Error updating complaint:', updateError);
                alert('Failed to forward to principal');
            } else {
                alert('Complaint forwarded to principal successfully!');
                setSelectedComplaint(null);
                fetchComplaints();
            }
        } catch (error) {
            console.error('Unexpected error:', error);
            alert('An unexpected error occurred');
        }
    };

    const filteredComplaints = complaints.filter(complaint => {
        const matchesFilter =
            filter === 'all' ||
            (filter === 'assigned' && complaint.cmplt_with_userid === userId) ||
            complaint.status === filter;

        const matchesSearch =
            complaint.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            complaint.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            complaint.user?.name?.toLowerCase().includes(searchTerm.toLowerCase());

        return matchesFilter && matchesSearch;
    });

    const getPriorityBadgeClass = (priority) => {
        switch (priority) {
            case 'urgent': return 'badge-urgent';
            case 'high': return 'badge-high';
            case 'medium': return 'badge-medium';
            case 'low': return 'badge-low';
            default: return 'badge-default';
        }
    };

    const getStatusBadgeClass = (status) => {
        switch (status) {
            case 'new': return 'badge-new';
            case 'reviewed': return 'badge-reviewed';
            case 'forwarded': return 'badge-forwarded';
            case 'open': return 'badge-open';
            case 'closed': return 'badge-closed';
            default: return 'badge-default';
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                </div>
            </div>
        );
    }

    return (
        <div className='representative-dashboard-container'>
            {/* Navigation Bar */}
            <nav className="navbar navbar-expand-lg navbar-dark bg-gradient">
                <div className="container-fluid">
                    <span className="navbar-brand mb-0 h1">🧑 Representative Dashboard</span>
                    <div className="d-flex align-items-center gap-3">
                        <span className="text-white">Welcome, {name}</span>
                        <button onClick={handleLogout} className='btn btn-outline-light logout-btn'>
                            Logout
                        </button>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <div className="container-fluid py-4">
                {/* Statistics Cards */}
                <div className="row g-4 mb-4">
                    <div className="col-md-6 col-lg-4">
                        <div className="stat-card stat-assigned">
                            <div className="stat-icon">📋</div>
                            <div className="stat-details">
                                <h3>{stats.assigned}</h3>
                                <p>New</p>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-6 col-lg-4">
                        <div className="stat-card stat-reviewed">
                            <div className="stat-icon">👁️</div>
                            <div className="stat-details">
                                <h3>{stats.reviewed}</h3>
                                <p>Reviewed</p>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-6 col-lg-4">
                        <div className="stat-card stat-forwarded">
                            <div className="stat-icon">▶️</div>
                            <div className="stat-details">
                                <h3>{stats.forwarded}</h3>
                                <p>Forwarded</p>
                            </div>
                        </div>
                    </div>


                    {/* <div className="col-md-6 col-lg-3">
                        <div className="stat-card stat-open">
                            <div className="stat-icon">📂</div>
                            <div className="stat-details">
                                <h3>{stats.open}</h3>
                                <p>Open</p>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-6 col-lg-3">
                        <div className="stat-card stat-closed">
                            <div className="stat-icon">✅</div>
                            <div className="stat-details">
                                <h3>{stats.closed}</h3>
                                <p>Closed</p>
                            </div>
                        </div>
                    </div> */}
                </div>

                {/* Filters and Search */}
                <div className="card filter-card mb-4">
                    <div className="card-body">
                        <div className="row align-items-center">
                            <div className="col-md-6 mb-3 mb-md-0">
                                <div className="btn-group" role="group">
                                    {/* <button
                                        className={`btn ${filter === 'new' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setFilter('new')}
                                    >
                                        New
                                    </button> */}
                                    <button
                                        className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setFilter('all')}
                                    >
                                        All
                                    </button>
                                    <button
                                        className={`btn ${filter === 'new' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setFilter('new')}
                                    >
                                        New
                                    </button>
                                    <button
                                        className={`btn ${filter === 'reviewed' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setFilter('reviewed')}
                                    >
                                        Reviewed
                                    </button>

                                    <button
                                        className={`btn ${filter === 'forwarded' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setFilter('forwarded')}
                                    >
                                        Forwarded
                                    </button>

                                    {/* <button
                                        className={`btn ${filter === 'open' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setFilter('open')}
                                    >
                                        Open
                                    </button>
                                    <button
                                        className={`btn ${filter === 'closed' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setFilter('closed')}
                                    >
                                        Closed
                                    </button> */}
                                </div>
                            </div>
                            <div className="col-md-6">
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="🔍 Search complaints..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Complaints List */}
                <div className="row">
                    <div className='col-lg-12'>
                        <div className="complaints-list">
                            {filteredComplaints.length === 0 ? (
                                <div className="card text-center p-5">
                                    <h5>No complaints found</h5>
                                    <p className="text-muted">Try adjusting your filters or search term</p>
                                </div>
                            ) : (
                                filteredComplaints.map((complaint) => (
                                    <div
                                        key={complaint.complaint_id}
                                        className={`complaint-card card mb-3 ${selectedComplaint?.complaint_id === complaint.complaint_id ? 'selected' : ''}`}
                                        onClick={() => setSelectedComplaint(complaint)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div className="card-body">
                                            <div className="d-flex justify-content-between align-items-start mb-3">
                                                <div className="flex-grow-1">
                                                    <h5 className="complaint-title">{complaint.title}</h5>
                                                    <p className="complaint-meta">
                                                        <strong>From:</strong> {complaint.user?.name || 'Unknown'} ({complaint.user?.email || 'N/A'})
                                                        <br />
                                                        <strong>Submitted:</strong> {formatDate(complaint.created_at)}
                                                    </p>
                                                </div>
                                                <div className="d-flex gap-2 flex-wrap">

                                                    {complaint.status === 'new' && (

                                                        <div className="d-flex gap-2 flex-wrap">

                                                            {complaint.user_id && (
                                                                <span
                                                                    className="badge badge-payment cursor-pointer"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedComplaint(complaint);
                                                                        setShowReplyModal(true);
                                                                    }}
                                                                    style={{ cursor: 'pointer' }}
                                                                >
                                                                    Reply to Parent
                                                                </span>
                                                            )}


                                                            <span
                                                                className="badge badge-mine cursor-pointer"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedComplaint(complaint);
                                                                    setShowForwardModal(true);
                                                                }}
                                                                style={{ cursor: 'pointer' }}
                                                            >
                                                                Forward to Principal
                                                            </span>
                                                        </div>
                                                    )}

                                                </div>
                                            </div>
                                            <p className="complaint-description">{complaint.description.substring(0, 150)}...</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>


                    {/* Forward to Principal Modal */}
                    {showForwardModal && selectedComplaint && (
                        <div className="modal-overlay" onClick={() => setShowForwardModal(false)}>
                            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h5 style={{ color: 'white' }}>Forward to Principal</h5>
                                    <button
                                        className="btn-close"
                                        onClick={() => setShowForwardModal(false)}
                                    >X</button>
                                </div>
                                <div className="modal-body">
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">Complaint: {selectedComplaint.title}</label>
                                    </div>

                                    <div className="mb-3">
                                        <label htmlFor="forwardPriority" className="form-label fw-bold">
                                            Priority <span className="text-danger">*</span>
                                        </label>
                                        <select
                                            id="forwardPriority"
                                            className="form-select"
                                            value={forwardPriority}
                                            onChange={(e) => setForwardPriority(e.target.value)}
                                        >
                                            <option value="">Select Priority</option>
                                            <option value="low">🟢 Low</option>
                                            <option value="medium">🟡 Medium</option>
                                            <option value="high">🟠 High</option>
                                            <option value="urgent">🔴 Urgent</option>
                                        </select>
                                    </div>

                                    <div className="mb-3">
                                        <label htmlFor="forwardComment" className="form-label fw-bold">
                                            Comment for Principal <span className="text-danger">*</span>
                                        </label>
                                        <textarea
                                            id="forwardComment"
                                            className="form-control"
                                            rows="5"
                                            placeholder="Add your comment or notes for the principal..."
                                            value={forwardComment}
                                            onChange={(e) => setForwardComment(e.target.value)}
                                        ></textarea>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => {
                                            setShowForwardModal(false);
                                            setForwardPriority('');
                                            setForwardComment('');
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className="btn btn-success"
                                        onClick={() => {
                                            forwardToPrincipal(
                                                selectedComplaint.complaint_id,
                                                forwardPriority,
                                                forwardComment
                                            );
                                            setShowForwardModal(false);
                                            setForwardPriority('');
                                            setForwardComment('');
                                        }}
                                    >
                                        ➡️ Forward to Principal
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Reply to Parent Modal */}
                    {showReplyModal && selectedComplaint && (
                        <div className="modal-overlay" onClick={() => setShowReplyModal(false)}>
                            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h5 style={{ color: 'white' }}>Reply to Parent</h5>
                                    <button
                                        className="btn-close"
                                        onClick={() => setShowReplyModal(false)}
                                    >X</button>
                                </div>
                                <div className="modal-body">
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">Complaint: {selectedComplaint.title}</label>
                                    </div>

                                    <div className="mb-3">
                                        <label htmlFor="replyText" className="form-label fw-bold">
                                            Reply Message <span className="text-danger">*</span>
                                        </label>
                                        <textarea
                                            id="replyText"
                                            className="form-control"
                                            rows="5"
                                            placeholder="Type your reply to the parent..."
                                            value={responseText}
                                            onChange={(e) => setResponseText(e.target.value)}
                                        ></textarea>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => {
                                            setShowReplyModal(false);
                                            setResponseText('');
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className="btn btn-success"
                                        onClick={() => replyToParent(selectedComplaint.complaint_id)}
                                    >
                                        📧 Send Reply
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default RepresentativeDashboard;
