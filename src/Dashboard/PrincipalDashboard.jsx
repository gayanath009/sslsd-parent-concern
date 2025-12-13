import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../SupabaseClient';
import { useUser } from '../context/UserContext';
import './PrincipalDashboard.css';

function PrincipalDashboard() {
    const navigate = useNavigate();
    const { email, name, userId, setEmail, setName, setRole, setUserId } = useUser();
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedComplaint, setSelectedComplaint] = useState(null);
    const [responseText, setResponseText] = useState('');
    const [showResponseModal, setShowResponseModal] = useState(false);
    const [stats, setStats] = useState({
        //total: 0,
        new: 0,
        open: 0,
        closed: 0,
        //urgent: 0
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
    }, []);

    const fetchComplaints = async () => {
        setLoading(true);
        try {
            // Fetch complaints without foreign key relationship
            const { data, error } = await supabase
                .from('complaint')
                .select('*')
                .order('created_at', { ascending: false });

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

            setComplaints(complaintsWithUsers);
            calculateStats(complaintsWithUsers);
        } catch (error) {
            console.error('Unexpected error:', error);
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (data) => {
        const stats = {
            //total: data.length,
            new: data.filter(c => c.status === 'forwarded').length,
            open: data.filter(c => c.status === 'open').length,
            closed: data.filter(c => c.status === 'closed').length

        };
        setStats(stats);
    };

    const handleRespond = (complaint) => {
        setSelectedComplaint(complaint);
        setResponseText('');
        setShowResponseModal(true);
    };

    const submitResponse = async (action) => {
        if (!responseText.trim()) {
            alert('Please enter a comment');
            return;
        }

        try {
            // Insert comment
            const { error: commentError } = await supabase
                .from('comment')
                .insert({
                    complaint_id: selectedComplaint.complaint_id,
                    user_id: userId,
                    comment_text: responseText,
                    visible_to: 'parent',
                    created_at: new Date().toISOString()
                });

            if (commentError) {
                console.error('Error adding comment:', commentError);
                alert('Failed to add comment');
                return;
            }

            // Update status
            const newStatus = action === 'keep_open' ? 'open' : 'closed';
            const { error: updateError } = await supabase
                .from('complaint')
                .update({ status: newStatus })
                .eq('complaint_id', selectedComplaint.complaint_id);

            if (updateError) {
                console.error('Error updating status:', updateError);
                alert('Failed to update status');
            } else {
                alert(`Complaint ${newStatus === 'open' ? 'kept open' : 'closed'} successfully`);
                setShowResponseModal(false);
                setResponseText('');
                setSelectedComplaint(null);
                fetchComplaints();
            }
        } catch (error) {
            console.error('Unexpected error:', error);
            alert('An unexpected error occurred');
        }
    };

    const assignToRepresentative = async (complaintId, representativeId) => {
        try {
            const { error } = await supabase
                .from('complaint')
                .update({
                    cmplt_with_userid: representativeId,
                    status: 'in_progress'
                })
                .eq('complaint_id', complaintId);

            if (error) {
                console.error('Error assigning complaint:', error);
                alert('Failed to assign complaint');
            } else {
                alert('Complaint assigned successfully');
                fetchComplaints();
            }
        } catch (error) {
            console.error('Unexpected error:', error);
        }
    };

    const filteredComplaints = complaints.filter(complaint => {
        const matchesFilter = filter === 'all' || complaint.status === filter;
        const matchesSearch =
            complaint.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            complaint.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            complaint.user?.name?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const handleExport = () => {
        const dataToExport = filteredComplaints.map(c => ({
            'Complaint ID': c.complaint_id,
            'Title': c.title,
            'Description': c.description,
            'Status': c.status,
            'Priority': c.priority || 'N/A',
            'Date': formatDate(c.created_at),
            'Parent Name': c.user?.name || 'Anonymous',
            'Parent Email': c.user?.email || 'N/A'
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Complaints");
        XLSX.writeFile(wb, "Complaints.xlsx");
    };

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
        <div className='principal-dashboard-container'>
            {/* Navigation Bar */}
            <nav className="navbar navbar-expand-lg navbar-dark bg-gradient">
                <div className="container-fluid">
                    <span className="navbar-brand mb-0 h1">👩‍🏫 Principal Dashboard</span>
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
                        <div className="stat-card stat-new">
                            <div className="stat-icon">🆕</div>
                            <div className="stat-details">
                                <h3>{stats.new}</h3>
                                <p>New</p>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-6 col-lg-4">
                        <div className="stat-card stat-open">
                            <div className="stat-icon">📂</div>
                            <div className="stat-details">
                                <h3>{stats.open}</h3>
                                <p>Open</p>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-6 col-lg-4">
                        <div className="stat-card stat-closed">
                            <div className="stat-icon">✅</div>
                            <div className="stat-details">
                                <h3>{stats.closed}</h3>
                                <p>Closed</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filters and Search */}
                <div className="card filter-card mb-4">
                    <div className="card-body">
                        <div className="row align-items-center">
                            <div className="col-md-4 mb-3 mb-md-0">
                                <div className="btn-group" role="group">
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
                                    </button>
                                </div>
                            </div>
                            <div className="col-md-7">
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="🔍 Search complaints..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="col-md-1">
                                <button className="btn btn-primary w-100" onClick={handleExport}>
                                    📊 Export
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Complaints List */}
                <div className="complaints-list">
                    {filteredComplaints.length === 0 ? (
                        <div className="card text-center p-5">
                            <h4>No complaints found</h4>
                            <p className="text-muted">Try adjusting your filters or search term</p>
                        </div>
                    ) : (
                        filteredComplaints.map((complaint) => (
                            <div key={complaint.complaint_id} className="complaint-card card mb-3">
                                <div className="card-body">
                                    <div className="row">
                                        <div className="col-lg-10">
                                            <div className="d-flex align-items-start gap-3 mb-3">
                                                <div className="flex-grow-1">
                                                    <h5 className="complaint-title">{complaint.title}</h5>
                                                    <p className="complaint-meta">
                                                        <strong>From:</strong> {complaint.user?.name || 'Unknown'} ({complaint.user?.email || 'N/A'})
                                                        <br />
                                                        <strong>Submitted:</strong> {formatDate(complaint.created_at)}
                                                    </p>
                                                </div>
                                                <div className="d-flex gap-2">
                                                    <span className={`badge ${getPriorityBadgeClass(complaint.priority)}`}>
                                                        {complaint.priority || 'N/A'}
                                                    </span>

                                                </div>
                                            </div>
                                            <p className="complaint-description">{complaint.description}</p>
                                        </div>
                                        <div className="col-lg-2">
                                            <div className="action-buttons">
                                                <button
                                                    className="btn btn-sm btn-primary w-100 mb-5"
                                                    onClick={() => handleRespond(complaint)}
                                                >
                                                    Respond
                                                </button>

                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Response Modal */}
            {showResponseModal && selectedComplaint && (
                <div className="modal-overlay" onClick={() => setShowResponseModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h5 style={{ color: 'white' }}>Respond to Complaint</h5>
                            <button
                                className="btn-close"
                                onClick={() => setShowResponseModal(false)}
                            >X</button>
                        </div>
                        <div className="modal-body">
                            <div className="mb-3">
                                <label className="form-label fw-bold">Complaint: {selectedComplaint.title}</label>
                            </div>
                            <div className="mb-3">
                                <label htmlFor="responseText" className="form-label fw-bold">
                                    Comment <span className="text-danger">*</span>
                                </label>
                                <textarea
                                    id="responseText"
                                    className="form-control"
                                    rows="5"
                                    placeholder="Enter your comment..."
                                    value={responseText}
                                    onChange={(e) => setResponseText(e.target.value)}
                                ></textarea>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-warning"
                                onClick={() => submitResponse('keep_open')}
                            >
                                Keep Open
                            </button>
                            <button
                                className="btn btn-success"
                                onClick={() => submitResponse('close')}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default PrincipalDashboard;
