import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../SupabaseClient';
import { useUser } from '../context/UserContext';
import './ComplaintsList.css';

function ComplaintsList() {
    const navigate = useNavigate();
    const { email, name, userId } = useUser();
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [selectedComplaint, setSelectedComplaint] = useState(null);
    const [stats, setStats] = useState({
        total: 0,
        new: 0,
        inProgress: 0,
        resolved: 0
    });

    useEffect(() => {
        fetchComplaints();
    }, [userId]);

    const fetchComplaints = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('complaint')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching complaints:', error);
            } else {
                setComplaints(data || []);
                calculateStats(data || []);
            }
        } catch (error) {
            console.error('Unexpected error:', error);
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (data) => {
        const stats = {
            total: data.length,
            new: data.filter(c => c.status === 'new').length,
            inProgress: data.filter(c => c.status === 'in_progress').length,
            resolved: data.filter(c => c.status === 'resolved').length
        };
        setStats(stats);
    };

    const handleBack = () => {
        navigate('/dashboard');
    };

    const handleNewComplaint = () => {
        navigate('/complaints');
    };

    const filteredComplaints = complaints.filter(complaint => {
        if (filter === 'all') return true;
        return complaint.status === filter;
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
            case 'in_progress': return 'badge-progress';
            case 'resolved': return 'badge-resolved';
            default: return 'badge-default';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'new': return '🆕';
            case 'in_progress': return '⏳';
            case 'resolved': return '✅';
            default: return '📋';
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
        <div className='complaints-list-container'>
            {/* Navigation Bar */}
            <nav className="navbar navbar-expand-lg navbar-dark bg-gradient">
                <div className="container-fluid">
                    <span className="navbar-brand mb-0 h1">📋 My Complaints</span>
                    <div className="d-flex gap-2">
                        <button onClick={handleNewComplaint} className='btn btn-outline-light new-btn'>
                            ➕ New Complaint
                        </button>
                        <button onClick={handleBack} className='btn btn-outline-light back-btn'>
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <div className="container-fluid py-4">
                {/* Welcome Section */}
                <div className="welcome-section mb-4">
                    <h2>Welcome back, {name}! 👋</h2>
                    <p className="text-muted">Here's an overview of all your submitted complaints</p>
                </div>

                {/* Statistics Cards */}
                <div className="row g-4 mb-4">
                    <div className="col-md-6 col-lg-3">
                        <div className="stat-card stat-total">
                            <div className="stat-icon">📊</div>
                            <div className="stat-details">
                                <h3>{stats.total}</h3>
                                <p>Total Complaints</p>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-6 col-lg-3">
                        <div className="stat-card stat-new">
                            <div className="stat-icon">🆕</div>
                            <div className="stat-details">
                                <h3>{stats.new}</h3>
                                <p>New</p>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-6 col-lg-3">
                        <div className="stat-card stat-progress">
                            <div className="stat-icon">⏳</div>
                            <div className="stat-details">
                                <h3>{stats.inProgress}</h3>
                                <p>In Progress</p>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-6 col-lg-3">
                        <div className="stat-card stat-resolved">
                            <div className="stat-icon">✅</div>
                            <div className="stat-details">
                                <h3>{stats.resolved}</h3>
                                <p>Resolved</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filter Buttons */}
                <div className="card filter-card mb-4">
                    <div className="card-body">
                        <div className="btn-group" role="group">
                            <button
                                className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
                                onClick={() => setFilter('all')}
                            >
                                All ({stats.total})
                            </button>
                            <button
                                className={`btn ${filter === 'new' ? 'btn-primary' : 'btn-outline-primary'}`}
                                onClick={() => setFilter('new')}
                            >
                                New ({stats.new})
                            </button>
                            <button
                                className={`btn ${filter === 'in_progress' ? 'btn-primary' : 'btn-outline-primary'}`}
                                onClick={() => setFilter('in_progress')}
                            >
                                In Progress ({stats.inProgress})
                            </button>
                            <button
                                className={`btn ${filter === 'resolved' ? 'btn-primary' : 'btn-outline-primary'}`}
                                onClick={() => setFilter('resolved')}
                            >
                                Resolved ({stats.resolved})
                            </button>
                        </div>
                    </div>
                </div>

                {/* Complaints List */}
                <div className="row">
                    <div className={selectedComplaint ? 'col-lg-7' : 'col-lg-12'}>
                        {filteredComplaints.length === 0 ? (
                            <div className="card empty-state text-center p-5">
                                <div className="empty-icon">📭</div>
                                <h4>No complaints found</h4>
                                <p className="text-muted mb-4">
                                    {filter === 'all'
                                        ? "You haven't submitted any complaints yet."
                                        : `You don't have any ${filter.replace('_', ' ')} complaints.`}
                                </p>
                                <button onClick={handleNewComplaint} className="btn btn-primary">
                                    Submit Your First Complaint
                                </button>
                            </div>
                        ) : (
                            <div className="complaints-grid">
                                {filteredComplaints.map((complaint) => (
                                    <div
                                        key={complaint.complaint_id}
                                        className={`complaint-card card ${selectedComplaint?.complaint_id === complaint.complaint_id ? 'selected' : ''}`}
                                        onClick={() => setSelectedComplaint(complaint)}
                                    >
                                        <div className="card-body">
                                            <div className="d-flex justify-content-between align-items-start mb-3">
                                                <div className="flex-grow-1">
                                                    <h5 className="complaint-title">
                                                        {getStatusIcon(complaint.status)} {complaint.title}
                                                    </h5>
                                                    <p className="complaint-date">
                                                        Submitted: {formatDate(complaint.created_at)}
                                                    </p>
                                                </div>
                                                <div className="d-flex gap-2 flex-wrap">
                                                    {complaint.priority && (
                                                        <span className={`badge ${getPriorityBadgeClass(complaint.priority)}`}>
                                                            {complaint.priority}
                                                        </span>
                                                    )}
                                                    <span className={`badge ${getStatusBadgeClass(complaint.status)}`}>
                                                        {complaint.status.replace('_', ' ')}
                                                    </span>
                                                </div>
                                            </div>
                                            <p className="complaint-preview">
                                                {complaint.description.substring(0, 120)}
                                                {complaint.description.length > 120 ? '...' : ''}
                                            </p>
                                            {complaint.is_payment_issue && (
                                                <div className="payment-badge">
                                                    💰 Payment Issue
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Detail Panel */}
                    {selectedComplaint && (
                        <div className="col-lg-5">
                            <div className="card detail-panel sticky-top">
                                <div className="card-header">
                                    <h5 className="mb-0">Complaint Details</h5>
                                    <button
                                        className="btn-close float-end"
                                        onClick={() => setSelectedComplaint(null)}
                                        style={{ position: 'absolute', right: '1rem', top: '1rem' }}
                                    ></button>
                                </div>
                                <div className="card-body">
                                    <div className="detail-section mb-3">
                                        <label className="detail-label">Title:</label>
                                        <h6 className="fw-bold">{selectedComplaint.title}</h6>
                                    </div>

                                    <div className="detail-section mb-3">
                                        <label className="detail-label">Status:</label>
                                        <div>
                                            <span className={`badge ${getStatusBadgeClass(selectedComplaint.status)} me-2`}>
                                                {selectedComplaint.status.replace('_', ' ')}
                                            </span>
                                            {selectedComplaint.priority && (
                                                <span className={`badge ${getPriorityBadgeClass(selectedComplaint.priority)}`}>
                                                    {selectedComplaint.priority}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="detail-section mb-3">
                                        <label className="detail-label">Submitted:</label>
                                        <p>{formatDate(selectedComplaint.created_at)}</p>
                                    </div>

                                    <div className="detail-section mb-3">
                                        <label className="detail-label">Description:</label>
                                        <p className="detail-text">{selectedComplaint.description}</p>
                                    </div>

                                    {selectedComplaint.is_payment_issue && (
                                        <div className="detail-section mb-3">
                                            <div className="alert alert-info">
                                                <strong>💰 Payment Issue</strong>
                                                <p className="mb-0 small">This complaint is related to payment matters.</p>
                                            </div>
                                        </div>
                                    )}

                                    {selectedComplaint.cmplt_with_userid > 0 && (
                                        <div className="detail-section">
                                            <div className="alert alert-success">
                                                <strong>✅ Assigned</strong>
                                                <p className="mb-0 small">This complaint has been assigned to a representative.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ComplaintsList;
