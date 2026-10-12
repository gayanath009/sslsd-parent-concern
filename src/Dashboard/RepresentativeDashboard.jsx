import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../SupabaseClient';
import { useUser } from '../context/UserContext';
import './RepresentativeDashboard.css';

function RepresentativeDashboard() {
    const navigate = useNavigate();
    const { email, name, userId, setEmail, setName, setRole, setUserId } = useUser();
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState(1);
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedComplaint, setSelectedComplaint] = useState(null);
    const [responseText, setResponseText] = useState('');
    const [showForwardModal, setShowForwardModal] = useState(false);
    const [showReplyModal, setShowReplyModal] = useState(false);
    const [showReadMoreModal, setShowReadMoreModal] = useState(false);
    const [showCommentsModal, setShowCommentsModal] = useState(false);
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);
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
                            .from('appusers')
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
        const stats = {
            assigned: data.filter(c => c.stat_code === 1).length,
            open: data.filter(c => c.stat_code === 2 || c.stat_code === 9 || c.stat_code === 4 || c.stat_code === 6).length,
            forwarded: data.filter(c => c.stat_code === 3).length,
            closed: data.filter(c => c.stat_code === 7 || c.stat_code === 5).length,
            total: data.length
        };
        setStats(stats);
    };



    const handleViewComments = async (complaint) => {
        setSelectedComplaint(complaint);
        setShowCommentsModal(true);
        setLoadingComments(true);
        setComments([]);

        try {
            const { data, error } = await supabase
                .from('comment')
                .select('*, appusers(name, role)')
                .eq('complaint_id', complaint.complaint_id)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Error fetching comments:', error);
                alert('Failed to load comments');
            } else {
                setComments(data || []);
            }
        } catch (err) {
            console.error('Unexpected error:', err);
        } finally {
            setLoadingComments(false);
        }
    };

    const replyToParent = async (complaintId) => {
        if (!responseText.trim()) {
            alert('Please enter a reply message');
            return;
        }

        const isConfirmed = window.confirm('Are you sure you want to keep open the concern?');
        if (!isConfirmed) return;

        try {
            // Insert comment into comment table
            const { error } = await supabase
                .from('comment')
                .insert({
                    complaint_id: complaintId,
                    user_id: userId,
                    comment_text: responseText,
                    //visible_to: 'parent',
                    created_at: new Date().toISOString()
                });

            if (error) {
                //console.error('Error adding reply:', error);
                alert(' ❌ Failed to send reply to parent');
            } else {
                // Update complaint status to '2'
                // Using RPC to bypass RLS policies
                const { error: updateError } = await supabase
                    .rpc('update_complaint_status', {
                        p_complaint_id: complaintId,
                        p_stat_code: 2
                    });

                if (updateError) {
                    console.error('❌ Error updating status:', updateError);
                    alert('Reply added, but failed to update status: ' + updateError.message);
                } else {
                    alert('✅ Reply sent to parent successfully!');
                    setResponseText('');
                    setShowReplyModal(false);
                    fetchComplaints();
                }
            }
        } catch (err) {
            alert('❌ An unexpected error occurred', err);
            console.error('Unexpected error:', err);

        }
    };

    const closeComplaint = async (complaintId) => {
        if (!responseText.trim()) {
            alert('Please enter a reply message');
            return;
        }

        const isConfirmed = window.confirm('Are you sure you want to close the concern?');
        if (!isConfirmed) return;

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
                alert(' ❌ Failed to send reply to parent');
            } else {
                // Update complaint status to 7 (Closed)
                const { error: updateError } = await supabase
                    .rpc('update_complaint_status', {
                        p_complaint_id: complaintId,
                        p_stat_code: 7
                    });

                if (updateError) {
                    console.error('❌ Error updating status:', updateError);
                    alert('Reply added, but failed to update status: ' + updateError.message);
                } else {
                    alert('✅ Complaint closed successfully!');
                    setResponseText('');
                    setShowReplyModal(false);
                    fetchComplaints();
                }
            }
        } catch (err) {
            alert('❌ An unexpected error occurred', err);
            console.error('Unexpected error:', err);
        }
    };

    const forwardToPrincipal = async (complaintId, priority, comment) => {
        if (!comment?.trim()) {

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
                alert('❌ Failed to add comment');
                return;
            }


            // Update complaint status to '3'
            // Using RPC to bypass RLS policies
            const { error: updateError } = await supabase
                .rpc('update_complaint_status', {
                    p_priority: priority,
                    p_complaint_id: complaintId,
                    //p_cmplt_with_userid: userId,
                    p_stat_code: 3 //Forwarded to Principal
                });

            if (updateError) {
                console.error('Error updating complaint:', updateError);
                alert('Failed to forward to principal');
            } else {
                alert('✅ Complaint forwarded to principal successfully!');
                setSelectedComplaint(null);
                fetchComplaints();
            }
        } catch (error) {
            console.error('Unexpected error:', error);
            alert('❌ An unexpected error occurred');
        }
    };

    const filteredComplaints = complaints.filter(complaint => {
        const matchesFilter =
            filter === 'all' ||
            (filter === 1 && complaint.stat_code === 1) ||
            (filter === 'open' && (complaint.stat_code === 2 || complaint.stat_code === 9 || complaint.stat_code === 4 || complaint.stat_code === 6)) ||
            ((filter === 7 || filter === 'closed') && (complaint.stat_code === 7 || complaint.stat_code === 5)) ||
            (filter === 3 && complaint.stat_code === 3) ||
            complaint.stat_code === filter;

        const cleanSearch = searchTerm.trim().replace(/^#/, '');
        const matchesSearch =
            (cleanSearch && complaint.complaint_id?.toString().includes(cleanSearch)) ||
            complaint.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            complaint.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            complaint.user?.name?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesPriority =
            priorityFilter === 'all' ||
            complaint.priority === priorityFilter;

        return matchesFilter && matchesSearch && matchesPriority;
    });

    const getStatusText = (statCode) => {
        switch (statCode) {
            case 1:
                return 'Initiated By Parent';
            case 2:
            case 9:
            case 4:
            case 6:
                return 'Open';
            case 3:
                return 'Forwarded to Principal';
            case 5:
                return 'Closed';
            case 7:
                return 'Closed By PR';
            default:
                return statCode ? String(statCode) : '';
        }
    };

    const handleExport = async () => {
        if (filteredComplaints.length === 0) {
            alert('No concerns found to export.');
            return;
        }

        setLoading(true);
        try {
            const exportData = [];
            let runningNo = 1;

            for (const complaint of filteredComplaints) {
                const { data: comments } = await supabase
                    .from('comment')
                    .select('*, appusers(name)')
                    .eq('complaint_id', complaint.complaint_id)
                    .order('created_at', { ascending: true });

                const baseData = {
                    'No': runningNo++,
                    'Complaint Number': complaint.complaint_id,
                    'Title': complaint.title || '',
                    'Description': complaint.description || '',
                    'Parent Name': complaint.user?.name || 'Anonymous',
                    'Parent Contact Number': complaint.contact_number || '',
                    'Student Number': complaint.student_no || '',
                    'Student Name': complaint.student_name || '',
                    'Grade': complaint.grade || '',
                    'Section': complaint.section || '',
                    'Priority': complaint.priority || '',
                    'Type': complaint.type || '',
                    'Status': getStatusText(complaint.stat_code),
                    'Complaint Created Datetime': formatDate(complaint.created_at)
                };

                if (comments && comments.length > 0) {
                    comments.forEach((comment, index) => {
                        exportData.push({
                            'No': index === 0 ? baseData['No'] : '',
                            'Complaint Number': index === 0 ? baseData['Complaint Number'] : '',
                            'Title': index === 0 ? baseData['Title'] : '',
                            'Description': index === 0 ? baseData['Description'] : '',
                            'Parent Name': index === 0 ? baseData['Parent Name'] : '',
                            'Parent Contact Number': index === 0 ? baseData['Parent Contact Number'] : '',
                            'Student Number': index === 0 ? baseData['Student Number'] : '',
                            'Student Name': index === 0 ? baseData['Student Name'] : '',
                            'Grade': index === 0 ? baseData['Grade'] : '',
                            'Section': index === 0 ? baseData['Section'] : '',
                            'Priority': index === 0 ? baseData['Priority'] : '',
                            'Type': index === 0 ? baseData['Type'] : '',
                            'Status': index === 0 ? baseData['Status'] : '',
                            'Complaint Created Datetime': index === 0 ? baseData['Complaint Created Datetime'] : '',
                            'Action Taken': comment.comment_text || '',
                            'Action By': comment.appusers?.name || 'Unknown',
                            'Action Datetime': formatDate(comment.created_at)
                        });
                    });
                } else {
                    exportData.push({
                        ...baseData,
                        'Action Taken': '',
                        'Action By': '',
                        'Action Datetime': ''
                    });
                }

                // Add a blank row space between complaints
                exportData.push({});
            }

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Concerns");
            XLSX.writeFile(wb, "Concerns_Export.xlsx");
        } catch (error) {
            console.error('Error exporting data:', error);
            alert('Failed to export data');
        } finally {
            setLoading(false);
        }
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

    const getStatusBadge = (statCode) => {
        switch (statCode) {
            case 1:
                return <span className="badge status-badge" style={{ backgroundColor: '#219ebc' }}>Initiated By Parent</span>;
            case 2:
            case 9:
                return <span className="badge status-badge" style={{ backgroundColor: '#E5BA41' }}>Open</span>;
            case 3:
                return <span className="badge status-badge" style={{ backgroundColor: '#C47BE4' }}>Forwarded to Principal</span>;
            // case 4:
            // case 6:
            //     return <span className="badge status-badge" style={{ backgroundColor: '#E5BA41' }}>Open</span>;
            //case 5:
            case 4:
            case 6:
                return <span className="badge status-badge" style={{ backgroundColor: '#E5BA41' }}>Open</span>;
            case 5:
                return <span className="badge status-badge" style={{ backgroundColor: '#007E6E' }}>Closed</span>;
            case 7:
                return <span className="badge status-badge" style={{ backgroundColor: '#007E6E' }}>Closed By PR</span>;


            default:
                return null;
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
                    <div className="col-md-6 col-lg-3">
                        <div
                            className={`stat-card stat-assigned ${filter === 1 ? 'border border-primary border-3 shadow' : ''}`}
                            onClick={() => setFilter(1)}
                            style={{ cursor: 'pointer' }}
                            title="Click to view New concerns"
                        >
                            <div className="stat-icon">📋</div>
                            <div className="stat-details">
                                <h3>{stats.assigned}</h3>
                                <p>New</p>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-6 col-lg-3">
                        <div
                            className={`stat-card stat-reviewed ${filter === 'open' ? 'border border-primary border-3 shadow' : ''}`}
                            onClick={() => setFilter('open')}
                            style={{ cursor: 'pointer' }}
                            title="Click to view Open concerns"
                        >
                            <div className="stat-icon">📂</div>
                            <div className="stat-details">
                                <h3>{stats.open}</h3>
                                <p>Open</p>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-6 col-lg-3">
                        <div
                            className={`stat-card stat-reviewed ${(filter === 7 || filter === 'closed') ? 'border border-primary border-3 shadow' : ''}`}
                            onClick={() => setFilter('closed')}
                            style={{ cursor: 'pointer' }}
                            title="Click to view Closed concerns"
                        >
                            <div className="stat-icon">✅</div>
                            <div className="stat-details">
                                <h3>{stats.closed}</h3>
                                <p>Closed</p>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-6 col-lg-3">
                        <div
                            className={`stat-card stat-forwarded ${filter === 3 ? 'border border-primary border-3 shadow' : ''}`}
                            onClick={() => setFilter(3)}
                            style={{ cursor: 'pointer' }}
                            title="Click to view Forwarded concerns"
                        >
                            <div className="stat-icon">▶️</div>
                            <div className="stat-details">
                                <h3>{stats.forwarded}</h3>
                                <p>Forwarded</p>
                            </div>
                        </div>
                    </div>



                </div>

                {/* Filters and Search */}
                <div className="card filter-card mb-4">
                    <div className="card-body">
                        <div className="row align-items-center">
                            <div className="col-lg-5 col-md-12 mb-3 mb-lg-0">
                                <div className="btn-group w-100" role="group">
                                    <button
                                        className={`btn w-100 ${filter === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setFilter('all')}
                                    >
                                        All
                                    </button>
                                    <button
                                        className={`btn w-100 ${filter === 1 ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setFilter(1)}
                                    >
                                        New
                                    </button>
                                    <button
                                        className={`btn w-100 ${filter === 'open' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setFilter('open')}
                                    >
                                        Open
                                    </button>
                                    <button
                                        className={`btn w-100 ${(filter === 7 || filter === 'closed') ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setFilter('closed')}
                                    >
                                        Closed
                                    </button>
                                    <button
                                        className={`btn w-100 ${filter === 3 ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setFilter(3)}
                                    >
                                        Forwarded
                                    </button>
                                </div>
                            </div>
                            <div className="col-lg-2 col-md-4 mb-3 mb-lg-0">
                                <select
                                    className="form-select"
                                    value={priorityFilter}
                                    onChange={(e) => setPriorityFilter(e.target.value)}
                                >
                                    <option value="all">All Priorities</option>
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="urgent">Urgent</option>
                                </select>
                            </div>
                            <div className="col-lg-3 col-md-5 mb-3 mb-lg-0">
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="🔍 Search concerns..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="col-lg-2 col-md-3">
                                <button className="btn btn-primary w-100" onClick={handleExport}>
                                    📊 Export
                                </button>
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
                                    <h5>No concerns found</h5>
                                    <p className="text-muted">Try adjusting your filters or search term</p>
                                </div>
                            ) : (
                                filteredComplaints.map((complaint) => {
                                    const isParentReplied = complaint.stat_code === 9;
                                    return (
                                        <div
                                            key={complaint.complaint_id}
                                            className={`complaint-card card mb-3 ${selectedComplaint?.complaint_id === complaint.complaint_id ? 'selected' : ''} ${isParentReplied ? 'highlight-parent-reply' : ''}`}
                                            onClick={() => setSelectedComplaint(complaint)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <div className="card-body">
                                                <div className="d-flex align-items-start gap-3">
                                                    {/* First Column: Concern Number */}
                                                    <div className="d-flex flex-column align-items-center justify-content-center px-3 py-2 rounded bg-light border text-center flex-shrink-0" style={{ minWidth: '95px' }}>
                                                        <span className="text-muted text-uppercase" style={{ fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.5px' }}>Concern #</span>
                                                        <span className="fw-bold fs-6 text-primary">#{complaint.complaint_id}</span>
                                                    </div>

                                                    <div className="flex-grow-1">
                                                        <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
                                                            <div className="flex-grow-1">
                                                                <div className="d-flex align-items-center gap-2 mb-1">
                                                                    <h5 className="complaint-title mb-0">{complaint.title}</h5>
                                                                    {isParentReplied && (
                                                                        <span className="badge bg-warning text-dark fw-bold" style={{ fontSize: '0.72rem' }}>
                                                                            ⚠️ Parent Replied
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="complaint-meta mb-0">
                                                                    <strong>From:</strong> {complaint.user?.name || 'Unknown'} ({complaint.user?.email || 'N/A'})
                                                                    <br />
                                                                    <strong>Submitted:</strong> {formatDate(complaint.created_at)}
                                                                </p>
                                                            </div>
                                                            <div className="d-flex gap-2 flex-wrap">
                                                                {getStatusBadge(complaint.stat_code)}
                                                                {(complaint.stat_code === 2 || complaint.stat_code === 4 || complaint.stat_code === 5 || complaint.stat_code === 6 || complaint.stat_code === 7 || complaint.stat_code === 9) && (
                                                                    <button
                                                                        className="btn btn-sm text-white"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleViewComments(complaint);
                                                                        }}
                                                                        style={{ backgroundColor: '#4488ff' }}
                                                                    >
                                                                        View Response
                                                                    </button>
                                                                )}

                                                                {(complaint.stat_code === 1 || complaint.stat_code === 2 || complaint.stat_code === 9) && complaint.user_id && (
                                                                    <button
                                                                        className="btn btn-sm text-white"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedComplaint(complaint);
                                                                            setShowReplyModal(true);
                                                                        }}
                                                                        style={{ backgroundColor: '#6f42c1' }}
                                                                    >
                                                                        Reply to Parent
                                                                    </button>
                                                                )}

                                                                {(complaint.stat_code === 1 || complaint.stat_code === 9) && (
                                                                    <button
                                                                        className="btn btn-sm text-white"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedComplaint(complaint);
                                                                            setShowForwardModal(true);
                                                                        }}
                                                                        style={{ backgroundColor: '#344386' }}
                                                                    >
                                                                        Forward to Principal
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <p className="complaint-description mb-0">{complaint.description.substring(0, 150)}... <span className="text-primary ms-2" style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={(e) => { e.stopPropagation(); setSelectedComplaint(complaint); setShowReadMoreModal(true); }}>More</span></p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
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
                                        <label className="form-label fw-bold">Concern: {selectedComplaint.title}</label>
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
                                        <label className="form-label fw-bold">Concern : {selectedComplaint.title}</label>
                                    </div>

                                    <div className="mb-3">
                                        <label htmlFor="replyText" className="form-label fw-bold">
                                            Response Message <span className="text-danger">*</span>
                                        </label>
                                        <textarea
                                            id="replyText"
                                            className="form-control"
                                            rows="5"
                                            placeholder="Type your response to the parent..."
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
                                        className="btn text-dark fw-bold"
                                        style={{ backgroundColor: '#f0c808' }}
                                        onClick={() => replyToParent(selectedComplaint.complaint_id)}
                                    >
                                        � Keep Open
                                    </button>
                                    <button
                                        className="btn text-white fw-bold"
                                        style={{ backgroundColor: '#28a745' }}
                                        onClick={() => closeComplaint(selectedComplaint.complaint_id)}
                                    >
                                        ✅ Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Read More Modal */}
                    {showReadMoreModal && selectedComplaint && (
                        <div className="modal-overlay" onClick={() => setShowReadMoreModal(false)}>
                            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h5 style={{ color: 'white' }}>Concern Details</h5>
                                    <button
                                        className="btn-close"
                                        onClick={() => setShowReadMoreModal(false)}
                                    >X</button>
                                </div>
                                <div className="modal-body">
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">Concern #:</label>
                                        <p className="form-control-static fw-bold text-primary">#{selectedComplaint.complaint_id}</p>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">From:</label>
                                        <p className="form-control-static">{selectedComplaint.user?.name || 'Unknown'} ({selectedComplaint.user?.email || 'N/A'})</p>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">Contact:</label>
                                        <p className="form-control-static">{selectedComplaint.contact_number || 'Unknown'}</p>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">Type:</label>
                                        <p className="form-control-static">{selectedComplaint.type}</p>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">Student Name:</label>
                                        <p className="form-control-static">{selectedComplaint.student_name}</p>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">Student Number:</label>
                                        <p className="form-control-static">{selectedComplaint.student_no}</p>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">Priority:</label>
                                        <p className="form-control-static">
                                            {selectedComplaint.priority ? (
                                                <span className={`badge ${getPriorityBadgeClass(selectedComplaint.priority)}`}>
                                                    {selectedComplaint.priority.toUpperCase()}
                                                </span>
                                            ) : 'N/A'}
                                        </p>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">Title:</label>
                                        <p className="form-control-static">{selectedComplaint.title}</p>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">Description:</label>
                                        <div
                                            className="p-3 border rounded bg-light"
                                            style={{ maxHeight: '300px', overflowY: 'auto' }}
                                        >
                                            {selectedComplaint.description}
                                        </div>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setShowReadMoreModal(false)}
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Comments Modal */}
                    {showCommentsModal && (
                        <div className="modal-overlay" onClick={() => setShowCommentsModal(false)}>
                            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h5 style={{ color: 'white' }}>Response History</h5>
                                    <button
                                        className="btn-close"
                                        onClick={() => setShowCommentsModal(false)}
                                    >X</button>
                                </div>
                                <div className="modal-body">
                                    {loadingComments ? (
                                        <div className="text-center p-3">
                                            <div className="spinner-border text-primary spinner-border-sm" role="status">
                                                <span className="visually-hidden">Loading...</span>
                                            </div>
                                        </div>
                                    ) : comments.length > 0 ? (
                                        <ul className="list-group list-group-flush">
                                            {comments.map((comment) => {
                                                const isParentReply = (selectedComplaint.stat_code === 2 || selectedComplaint.stat_code === 7 || selectedComplaint.stat_code === 9) && comment.visible_to === 'PA';
                                                return (
                                                    <li key={comment.comment_id} className="list-group-item" style={{ backgroundColor: isParentReply ? '#fff3cd' : 'transparent' }}>
                                                        <div className="d-flex justify-content-between">
                                                            <div>
                                                                <strong className="mb-1">{comment.appusers?.name || 'Unknown'}</strong>
                                                                {isParentReply && (
                                                                    <span className="badge bg-warning text-dark ms-2">Parent Reply</span>
                                                                )}
                                                            </div>
                                                            <small className="text-muted">
                                                                {new Date(comment.created_at).toLocaleString()}
                                                            </small>
                                                        </div>
                                                        <div className="mb-3">
                                                            <div
                                                                className={`p-3 border rounded ${isParentReply ? 'bg-white' : 'bg-light'}`}
                                                                style={{ maxHeight: '300px', overflowY: 'auto' }}
                                                            >
                                                                {comment.comment_text}
                                                            </div>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    ) : (
                                        <p className="text-muted text-center my-3">No responses found.</p>
                                    )}
                                </div>
                                <div className="modal-footer">
                                    <button className="btn btn-secondary" onClick={() => setShowCommentsModal(false)}>Close</button>
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
