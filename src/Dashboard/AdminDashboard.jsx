import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../SupabaseClient';
import { useUser } from '../context/UserContext';
import * as XLSX from 'xlsx';
import './AdminDashboard.css';

function AdminDashboard() {
    const navigate = useNavigate();
    const { email, name, setEmail, setName, setRole, setUserId } = useUser();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState(null);
    const [newRole, setNewRole] = useState('');
    const [newGrade, setNewGrade] = useState('');
    const [newName, setNewName] = useState('');
    const [newIsActive, setNewIsActive] = useState(true);
    const [showPurgeModal, setShowPurgeModal] = useState(false);
    const [purgeOption, setPurgeOption] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const roles = ['admin', 'parent', 'representative', 'board_member', 'principal'];
    //const grades = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'];

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setEmail('');
        setName('');
        setRole('');
        setUserId(null);
        navigate('/login');
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('appusers')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching users:', error);
            } else {
                setUsers(data || []);
            }
        } catch (error) {
            console.error('Unexpected error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRoleChange = async (userId, currentRole, currentGrade, currentName, currentIsActive) => {
        setEditingUser(userId);
        setNewRole(currentRole);
        setNewGrade(currentGrade || '');
        setNewName(currentName || '');
        setNewIsActive(currentIsActive !== false); // Default to true if undefined
    };

    const saveRoleChange = async () => {
        try {
            console.log('Updating user:', {
                userId: editingUser,
                role: newRole,
                grade: newGrade
            });

            const { error } = await supabase
                .from('appusers')
                .update({
                    name: newName,
                    role: newRole,
                    grade: newGrade || null,
                    is_active: newIsActive
                })
                .eq('user_id', editingUser);

            if (error) {
                console.error('Error updating role:', error);
                alert(`❌ Failed to update role: ${error.message}`);
            } else {
                alert('✅ Role and grade updated successfully!');
                setEditingUser(null);
                fetchUsers();
            }
        } catch (error) {
            console.error('Unexpected error:', error);
            alert('❌An unexpected error occurred');
        }
    };

    const getGradeDisplay = (grade) => {
        if (!grade) return 'N/A';
        if (grade === 'L') return 'Grade LR';
        if (grade === 'U') return 'Grade UR';
        return `Grade ${grade}`;
    };

    const exportComplaintsData = async (startDate) => {
        try {
            // Fetch complaints from the specified date
            const { data: complaints, error: complaintsError } = await supabase
                .from('complaint')
                .select('*')
                .gte('created_at', startDate)
                .order('created_at', { ascending: false });

            if (complaintsError) {
                console.error('Error fetching complaints:', complaintsError);
                return null;
            }

            // Fetch all users and comments
            const { data: users } = await supabase.from('appusers').select('*');
            const { data: comments } = await supabase.from('comment').select('*');

            const exportData = [];

            for (const complaint of complaints) {
                const user = users?.find(u => u.user_id === complaint.user_id);
                const complaintComments = comments?.filter(c => c.complaint_id === complaint.complaint_id) || [];

                const baseData = {
                    'Concern ID': complaint.complaint_id,
                    'Submitted By': user?.name || 'Unknown',
                    'Email': user?.email || 'N/A',
                    'Contact': complaint.contact_number || 'N/A',
                    'Type': complaint.type || 'N/A',
                    'Student Name': complaint.student_name || 'N/A',
                    'Student No': complaint.student_no || 'N/A',
                    'Grade': complaint.grade || 'N/A',
                    'Section': complaint.section || 'N/A',
                    'Title': complaint.title,
                    'Description': complaint.description,
                    'Priority': complaint.priority || 'N/A',
                    'Status': getStatusText(complaint.stat_code),
                    'Created At': new Date(complaint.created_at).toLocaleString()
                };

                if (complaintComments.length > 0) {
                    complaintComments.forEach((comment, index) => {
                        const commentUser = users?.find(u => u.user_id === comment.user_id);
                        exportData.push({
                            ...baseData,
                            'Action Taken': comment.comment_text,
                            'Action By': commentUser?.name || 'Unknown',
                            'Action Datetime': new Date(comment.created_at).toLocaleString()
                        });
                    });
                } else {
                    exportData.push({
                        ...baseData,
                        'Action Taken': 'No actions yet',
                        'Action By': '',
                        'Action Datetime': ''
                    });
                }
            }

            return exportData;
        } catch (error) {
            console.error('Error exporting data:', error);
            return null;
        }
    };

    const getStatusText = (statCode) => {
        const statusMap = {
            1: 'Initiated',
            2: 'Reviewed',
            3: 'New',
            4: 'Forwarded',
            5: 'Open',
            6: 'Closed'
        };
        return statusMap[statCode] || 'Unknown';
    };

    const handlePurgeData = async () => {
        if (!purgeOption) {
            alert('Please select a purge option');
            return;
        }

        const confirmPurge = window.confirm(
            `⚠️ Are you sure you want to purge data older than ${purgeOption}? This action cannot be undone. Data will be exported before deletion.`
        );

        if (!confirmPurge) return;

        try {
            // Calculate the date threshold
            const now = new Date();
            let startDate;

            switch (purgeOption) {
                case '1month':
                    startDate = new Date(now.setMonth(now.getMonth() - 1));
                    break;
                case '3months':
                    startDate = new Date(now.setMonth(now.getMonth() - 3));
                    break;
                case '6months':
                    startDate = new Date(now.setMonth(now.getMonth() - 6));
                    break;
                case '1year':
                    startDate = new Date(now.setFullYear(now.getFullYear() - 1));
                    break;
                default:
                    return;
            }

            // Export data before purging
            const exportData = await exportComplaintsData(startDate.toISOString());

            if (exportData && exportData.length > 0) {
                const ws = XLSX.utils.json_to_sheet(exportData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Purged Concerns');
                XLSX.writeFile(wb, `Purged_Concerns_${new Date().toISOString().split('T')[0]}.xlsx`);
                console.log('Export completed successfully');
            } else {
                console.log('No data to export');
            }

            // Delete using RPC to bypass any RLS issues
            console.log('Deleting data older than:', startDate.toISOString());

            // Delete comments first (foreign key constraint)
            const { data: deletedComments, error: commentsError } = await supabase
                .rpc('purge_old_comments', {
                    p_cutoff_date: startDate.toISOString()
                });

            if (commentsError) {
                console.error('Error deleting comments:', commentsError);
                alert(`Failed to purge comments: ${commentsError.message}`);
                return;
            }

            console.log('Comments deleted:', deletedComments);

            // Delete complaints
            const { data: deletedComplaints, error: complaintsError } = await supabase
                .rpc('purge_old_complaints', {
                    p_cutoff_date: startDate.toISOString()
                });

            if (complaintsError) {
                console.error('Error deleting complaints:', complaintsError);
                alert(`Failed to purge complaints: ${complaintsError.message}`);
                return;
            }

            console.log('Complaints deleted:', deletedComplaints);

            alert('✅ Data purged successfully! ✅ Exported file has been downloaded.');
            setShowPurgeModal(false);
            setPurgeOption('');
        } catch (error) {
            console.error('Unexpected error during purge:', error);
            alert('An unexpected error occurred during purge');
        }
    };

    const filteredUsers = users.filter(user =>
        user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.role?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="admin-dashboard-container">
            <nav className="navbar navbar-expand-lg navbar-dark bg-gradient">
                <div className="container-fluid">
                    <span className="navbar-brand mb-0 h1">🛡️ Admin Dashboard</span>
                    <div className="d-flex align-items-center gap-3">
                        <span className="text-white">Welcome, {name}</span>
                        <button onClick={handleLogout} className="btn btn-outline-light logout-btn">
                            Logout
                        </button>
                    </div>
                </div>
            </nav>

            <div className="container-fluid py-4">
                {/* Header Section */}
                <div className="row mb-4">
                    <div className="col-12">
                        <div className="card shadow">
                            <div className="card-body">
                                <h2 className="mb-0">User Management</h2>
                                <p className="text-muted mb-0">Manage user roles and system data</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="row mb-4">
                    <div className="col-md-6">
                        <input
                            type="text"
                            className="form-control"
                            placeholder="🔍 Search users by name, email, or role..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="col-md-6 text-end">
                        <button
                            className="btn btn-danger"
                            onClick={() => setShowPurgeModal(true)}
                        >
                            🗑️ Purge Data
                        </button>
                    </div>
                </div>

                {/* Users Table */}
                <div className="card shadow">
                    <div className="card-body">
                        {loading ? (
                            <div className="text-center py-5">
                                <div className="spinner-border text-primary" role="status">
                                    <span className="visually-hidden">Loading...</span>
                                </div>
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Email</th>
                                            <th>Role</th>
                                            <th>Grade</th>
                                            <th>Status</th>
                                            <th>Created At</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredUsers.map((user) => (
                                            <tr key={user.user_id}>
                                                <td>
                                                    {editingUser === user.user_id ? (
                                                        <input
                                                            type="text"
                                                            className="form-control form-control-sm"
                                                            value={newName}
                                                            onChange={(e) => setNewName(e.target.value)}
                                                        />
                                                    ) : (
                                                        user.name
                                                    )}
                                                </td>
                                                <td>{user.email}</td>
                                                <td>
                                                    {editingUser === user.user_id ? (
                                                        <select
                                                            className="form-select form-select-sm"
                                                            value={newRole}
                                                            onChange={(e) => setNewRole(e.target.value)}
                                                        >
                                                            {roles.map((role) => (
                                                                <option key={role} value={role}>
                                                                    {role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' ')}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <span className={`badge badge-${user.role}`}>
                                                            {user.role?.charAt(0).toUpperCase() + user.role?.slice(1).replace('_', ' ')}
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    {editingUser === user.user_id ? (
                                                        <select
                                                            className="form-select form-select-sm"
                                                            value={newGrade}
                                                            onChange={(e) => setNewGrade(e.target.value)}
                                                        >
                                                            <option value="">-- Select Grade --</option>
                                                            <option value="">Select Grade</option>
                                                            <option value="L">LR</option>
                                                            <option value="U">UR</option>
                                                            {[...Array(13)].map((_, i) => (
                                                                <option key={i + 1} value={`${i + 1}`}>Grade {i + 1}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        getGradeDisplay(user.grade)
                                                    )}
                                                </td>
                                                <td>
                                                    {editingUser === user.user_id ? (
                                                        <select
                                                            className="form-select form-select-sm"
                                                            value={newIsActive}
                                                            onChange={(e) => setNewIsActive(e.target.value === 'true')}
                                                        >
                                                            <option value="true">Active</option>
                                                            <option value="false">Deactive</option>
                                                        </select>
                                                    ) : (
                                                        <span className={`badge ${user.is_active ? 'bg-success' : 'bg-danger'}`}>
                                                            {user.is_active ? 'Active' : 'Deactive'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                                                <td>
                                                    {editingUser === user.user_id ? (
                                                        <div className="btn-group btn-group-sm">
                                                            <button
                                                                className="btn btn-success"
                                                                onClick={saveRoleChange}
                                                            >
                                                                Save
                                                            </button>
                                                            <button
                                                                className="btn btn-secondary"
                                                                onClick={() => setEditingUser(null)}
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            className="btn btn-primary btn-sm"
                                                            onClick={() => handleRoleChange(user.user_id, user.role, user.grade, user.name, user.is_active)}
                                                        >
                                                            Edit
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Purge Data Modal */}
            {showPurgeModal && (
                <div className="modal-overlay" onClick={() => setShowPurgeModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h5 className="modal-title">Purge Data</h5>
                            <button
                                className="btn-close"
                                onClick={() => setShowPurgeModal(false)}
                            >
                                X
                            </button>
                        </div>
                        <div className="modal-body">
                            <p className="text-danger fw-bold">
                                ⚠️ Warning: This will permanently delete complaints and comments older than the selected period.
                                Data will be exported before deletion.
                            </p>
                            <div className="mb-3">
                                <label className="form-label">Select Purge Period:</label>
                                <select
                                    className="form-select"
                                    value={purgeOption}
                                    onChange={(e) => setPurgeOption(e.target.value)}
                                >
                                    <option value="">-- Select Period --</option>
                                    <option value="1month">Older than 1 Month</option>
                                    <option value="3months">Older than 3 Months</option>
                                    <option value="6months">Older than 6 Months</option>
                                    <option value="1year">Older than 1 Year</option>
                                </select>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowPurgeModal(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={handlePurgeData}
                                disabled={!purgeOption}
                            >
                                Purge Data
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AdminDashboard;
