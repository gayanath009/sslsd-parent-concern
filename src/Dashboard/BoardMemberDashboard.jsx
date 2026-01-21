import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../SupabaseClient';
import { useUser } from '../context/UserContext';
import './BoardMemberDashboard.css';

function BoardMemberDashboard() {
    const navigate = useNavigate();
    const { email, name, userId, setEmail, setName, setRole, setUserId } = useUser();
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState(3);
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedComplaint, setSelectedComplaint] = useState(null);
    const [showReadMoreModal, setShowReadMoreModal] = useState(false);
    const [showCommentsModal, setShowCommentsModal] = useState(false);
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [stats, setStats] = useState({
        new: 0,
        responded: 0,
        open: 0,
        closed: 0,
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
            const { data, error } = await supabase
                .from('complaint')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching complaints:', error);
                setLoading(false);
                return;
            }

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
            new: data.filter(c => c.stat_code === 3).length,
            responded: data.filter(c => c.stat_code === 2).length,
            open: data.filter(c => c.stat_code === 4 || c.stat_code === 6).length,
            closed: data.filter(c => c.stat_code === 5).length
        };
        setStats(stats);
    };

    const handleViewComments = async (complaint) => {
        setSelectedComplaint(complaint);
        setLoadingComments(true);
        setShowCommentsModal(true);
        setComments([]);

        try {
            const { data, error } = await supabase
                .from('comment')
                .select('*, appusers(name, role)')
                .eq('complaint_id', complaint.complaint_id)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('❌ Error fetching comments:', error);
            } else {
                setComments(data || []);
            }
        } catch (err) {
            console.error("❌ Error fetching comments:", err);
        } finally {
            setLoadingComments(false);
        }
    };

    const filteredComplaints = complaints.filter(complaint => {
        const matchesFilter = filter === 'all' ? true :
            (filter === 4 ? (complaint.stat_code === 4 || complaint.stat_code === 6) : complaint.stat_code === filter);
        const matchesSearch =
            complaint.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            complaint.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            complaint.user?.name?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesPriority =
            priorityFilter === 'all' ||
            complaint.priority === priorityFilter;

        return matchesFilter && matchesSearch && matchesPriority;
    });

    const handleExport = async () => {
        setLoading(true);
        try {
            const exportData = [];
            let runningNo = 1;

            for (const complaint of filteredComplaints) {
                const { data: comments, error } = await supabase
                    .from('comment')
                    .select('*, appusers(name)')
                    .eq('complaint_id', complaint.complaint_id)
                    .order('created_at', { ascending: true });

                const baseData = {
                    'No': runningNo++,
                    //'Concern ID': complaint.complaint_id,
                    'Title': complaint.title,
                    'Description': complaint.description,
                    'Parent Name': complaint.user?.name || 'Anonymous',
                    'Parent Contact Number': complaint.contact_number || '',
                    'Student Number': complaint.student_no || '',
                    'Student Name': complaint.student_name || '',
                    'Grade': complaint.grade || '',
                    'Section': complaint.section || '',
                    'Priority': complaint.priority || '',
                    'Type': complaint.type || '',
                    'Status': complaint.status_typ?.display || complaint.stat_code || '',
                    'Complaint Created Datetime': formatDate(complaint.created_at)
                };

                if (comments && comments.length > 0) {
                    comments.forEach((comment, index) => {
                        exportData.push({
                            'No': index === 0 ? baseData['No'] : '',
                            //'Concern ID': index === 0 ? baseData['Concern ID'] : '',
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
                            'Action Taken': comment.comment_text,
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
                return <span className="badge status-badge" style={{ backgroundColor: '#75B06F' }}>Responded by Parent Representative</span>;
            case 3:
                return <span className="badge status-badge" style={{ backgroundColor: '#C47BE4' }}>With Principal</span>;
            case 4:
            case 6:
                return <span className="badge status-badge" style={{ backgroundColor: '#E5BA41' }}>Open</span>;
            case 5:
                return <span className="badge status-badge" style={{ backgroundColor: '#007E6E' }}>Closed</span>;
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
        <div className='board-member-dashboard-container'>
            {/* Navigation Bar */}
            <nav className="navbar navbar-expand-lg navbar-dark bg-gradient">
                <div className="container-fluid">
                    <span className="navbar-brand mb-0 h1">👥 Board Member Dashboard</span>
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
                                <p>With Principal</p>
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
                            <div className="col-md-5 mb-3 mb-md-0">
                                <div className="btn-group w-100" role="group">
                                    <button
                                        className={`btn w-100 ${filter === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setFilter('all')}
                                    >
                                        All
                                    </button>
                                    <button
                                        className={`btn w-100 ${filter === 2 ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setFilter(2)}
                                    >
                                        Responded By PA
                                    </button>
                                    <button
                                        className={`btn w-100 ${filter === 3 ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setFilter(3)}
                                    >
                                        With Principal
                                    </button>

                                    <button
                                        className={`btn w-100 ${filter === 4 ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setFilter(4)}
                                    >
                                        Open
                                    </button>
                                    <button
                                        className={`btn w-100 ${filter === 5 ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setFilter(5)}
                                    >
                                        Closed
                                    </button>
                                </div>
                            </div>
                            <div className="col-md-2 mb-3 mb-md-0">
                                <select
                                    className="form-select"
                                    value={priorityFilter}
                                    onChange={(e) => setPriorityFilter(e.target.value)}
                                >
                                    <option value="all">Priority: All</option>
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="urgent">Urgent</option>
                                </select>
                            </div>
                            <div className="col-md-3">
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="🔍 Search complaints..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="col-md-2">
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
                                                    {getStatusBadge(complaint.stat_code)}
                                                    {complaint.stat_code != 1 && complaint.stat_code != 2 && (
                                                        <span className={`badge ${getPriorityBadgeClass(complaint.priority)}`}>
                                                            {complaint.priority || 'N/A'}
                                                        </span>
                                                    )}

                                                </div>
                                            </div>
                                            <p className="complaint-description">
                                                {complaint.description.length > 150
                                                    ? complaint.description.substring(0, 150) + '...'
                                                    : complaint.description}
                                                {complaint.description.length > 150 && (
                                                    <span
                                                        className="text-primary ms-2"
                                                        style={{ cursor: 'pointer', textDecoration: 'underline' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedComplaint(complaint);
                                                            setShowReadMoreModal(true);
                                                        }}
                                                    >
                                                        More
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                        <div className="col-lg-2">
                                            <div className="action-buttons">
                                                {(complaint.stat_code === 2 || complaint.stat_code === 4 || complaint.stat_code === 5 || complaint.stat_code === 6) && (
                                                    <button
                                                        className={`btn btn-sm w-100 mb-2 text-white`}
                                                        style={{ backgroundColor: '#6f42c1' }}
                                                        onClick={() => handleViewComments(complaint)}
                                                    >
                                                        View Response
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Read More Modal */}
            {showReadMoreModal && selectedComplaint && (
                <div className="modal-overlay" onClick={() => setShowReadMoreModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h5 style={{ color: 'white' }}>Complaint Details</h5>
                            <button
                                className="btn-close"
                                onClick={() => setShowReadMoreModal(false)}
                            >X</button>
                        </div>
                        <div className="modal-body">
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
                                        const isParentReply = selectedComplaint.stat_code === 6 && comment.appusers?.role === 'parent';
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
    );
}

export default BoardMemberDashboard;
