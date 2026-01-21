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

    const handleExportData = async () => {
        const confirmExport = window.confirm("Are you sure you want to export all system data?");
        if (!confirmExport) return;

        setLoading(true);
        try {
            // Fetch all data for backup
            const { data: appusers } = await supabase.from('appusers').select('*');
            const { data: complaints } = await supabase.from('complaint').select('*').order('created_at', { ascending: false });
            const { data: comments } = await supabase.from('comment').select('*');
            const { data: complaintTypes } = await supabase.from('complaint_typ').select('*');
            const { data: statusTypes } = await supabase.from('status_typ').select('*');

            const wb = XLSX.utils.book_new();

            // 1. Formatted Report
            const exportData = [];
            if (complaints && appusers && comments) {
                let runningNo = 1;

                for (const complaint of complaints) {
                    const user = appusers.find(u => u.user_id === complaint.user_id);
                    const complaintComments = comments.filter(c => c.complaint_id === complaint.complaint_id) || [];

                    const baseData = {
                        'No': runningNo++,
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
                        complaintComments.forEach((comment) => {
                            const commentUser = appusers.find(u => u.user_id === comment.user_id);
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
            }

            if (exportData.length > 0) {
                const wsReport = XLSX.utils.json_to_sheet(exportData);
                XLSX.utils.book_append_sheet(wb, wsReport, 'Detailed Report');
            }

            // 2. Raw Tables
            if (appusers?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(appusers), 'appusers');
            if (complaints?.length) {
                // Add running number to raw complaints as well for easy reference
                const rawComplaints = complaints.map((c, i) => ({ running_id: i + 1, ...c }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawComplaints), 'complaint');
            }
            if (comments?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(comments), 'comment');
            if (complaintTypes?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(complaintTypes), 'complaint_typ');
            if (statusTypes?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(statusTypes), 'status_typ');

            XLSX.writeFile(wb, `System_Backup_${new Date().toISOString().split('T')[0]}.xlsx`);
            alert('✅ Data exported successfully!');

        } catch (error) {
            console.error('Error exporting data:', error);
            alert('❌ Failed to export data: ' + error.message);
        } finally {
            setLoading(false);
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
                            className="btn btn-success"
                            onClick={handleExportData}
                        >
                            � Export Data
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


        </div>
    );
}

export default AdminDashboard;
