import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../SupabaseClient';
import { useUser } from '../context/UserContext';
import RepresentativeDashboard from './RepresentativeDashboard';
import PrincipalDashboard from './PrincipalDashboard';
import AdminDashboard from './AdminDashboard';
import BoardMemberDashboard from './BoardMemberDashboard';
import './Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();
  const { email, name, setEmail, setName, role, setRole, userId, setUserId } = useUser();
  const [loading, setLoading] = useState(true);

  // Moved Logic (Complaints) to top level
  const [complaints, setComplaints] = useState([]);
  const [comments, setComments] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [showReadMoreModal, setShowReadMoreModal] = useState(false);
  const [showResponseBackModal, setShowResponseBackModal] = useState(false);
  const [responseBackText, setResponseBackText] = useState('');

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setEmail('');
    setName('');
    setRole('');
    setUserId(null);
    navigate('/login');
  };

  const handleConcern = () => {
    navigate('/complaints');
  };
  useEffect(() => {
    const fetchUserInfo = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Error fetching session:', error.message);
        setLoading(false);
        return;
      }

      const session = data?.session;
      if (session?.user) {
        const { email, user_metadata, app_metadata } = session.user;
        const userName = user_metadata?.name || 'No name available';
        const provider = app_metadata?.provider || 'google';

        setEmail(email);
        setName(userName);

        // ---- Check if record exists ----
        const { data: existingRecord } = await supabase
          .from('appusers')
          .select('user_id, role, is_active')
          .eq('email', email)
          .maybeSingle();

        if (!existingRecord) {
          // Insert new user with default role 'parent'
          const { data: newUser, error: insertError } = await supabase
            .from('appusers')
            .insert({
              name: userName,
              email: email,
              auth_provider: provider,
              role: 'parent',
              is_active: true,
              created_at: new Date().toISOString(),
            })
            .select('user_id, role, is_active')
            .single();

          if (insertError) {
            console.error('Error inserting user:', insertError);
          } else {
            console.log('Record inserted successfully');
            setRole(newUser?.role || 'parent');
            setUserId(newUser?.user_id || null);
          }
        } else {
          if (existingRecord.is_active === false) {
            alert("❌ Your account is deactivated. Please contact the administrator.");
            await supabase.auth.signOut();
            navigate('/login');
            return;
          }
          setRole(existingRecord.role || 'parent');
          setUserId(existingRecord.user_id || null);
        }
      } else {
        navigate('/login');
      }

      setLoading(false);
    };

    fetchUserInfo();
  }, [navigate, setEmail, setName, setRole, setUserId]);
  useEffect(() => {
    const getComplaints = async () => {
      if (!email || role !== 'parent') return; // fetch for parents

      try {
        const { data: userData, error: userError } = await supabase
          .from('appusers')
          .select('user_id')
          .eq('email', email)
          .single();

        if (userError || !userData) return;

        const { data, error } = await supabase
          .from('complaint')
          .select('*, status_typ(display, color)')
          .eq('user_id', userData.user_id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('❌ Error fetching complaints:', error);
        } else {
          console.log('complaints', data);
          setComplaints(data || []);
        }
      } catch (err) {
        console.error("Unexpected error fetching complaints:", err);
      }
    };

    getComplaints();
  }, [email, role]); // Run when email is established (and role confirmed as parent)

  // Show loading state while fetching user data
  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  // Render role-specific dashboard
  if (role === 'admin') {
    return <AdminDashboard />;
  }

  if (role === 'representative') {
    return <RepresentativeDashboard />;
  }

  if (role === 'principal') {
    return <PrincipalDashboard />;
  }

  if (role === 'board_member') {
    return <BoardMemberDashboard />;
  }

  // Default: Parent Dashboard

  const handleComplaintClick = async (complaintId) => {
    setLoadingComments(true);
    setShowModal(true);
    setComments([]); // Clear previous

    try {
      const { data, error } = await supabase
        .from('comment') // stored in 'comment' table based on request
        .select('*, appusers(name)')
        .eq('complaint_id', complaintId)
        .order('created_at', { ascending: true });

      console.log('comments', data);

      if (error) {
        console.error('Error fetching comments:', error);
      } else {
        setComments(data || []);
      }
    } catch (err) {
      console.error("Error fetching comments:", err);
    } finally {
      setLoadingComments(false);
    }
  };

  const submitResponseBack = async () => {
    if (!responseBackText.trim()) {
      alert('Please enter a comment');
      return;
    }

    try {
      // 1. Insert comment
      const { error: commentError } = await supabase
        .from('comment')
        .insert({
          complaint_id: selectedComplaint.complaint_id,
          user_id: userId,
          comment_text: responseBackText,
          visible_to: 'principal',
          created_at: new Date().toISOString()
        });

      if (commentError) {
        console.error('Error adding response:', commentError);
        alert('❌ Failed to send response');
        return;
      }

      // 2. Update status to 6 using RPC
      const { error: updateError } = await supabase
        .rpc('update_complaint_status', {
          p_complaint_id: selectedComplaint.complaint_id,
          p_stat_code: 6
        });

      if (updateError) {
        console.error('Error updating status via RPC:', updateError);

        // Fallback: Try direct update
        const { error: directUpdateError } = await supabase
          .from('complaint')
          .update({ stat_code: 6 })
          .eq('complaint_id', selectedComplaint.complaint_id);

        if (directUpdateError) {
          console.error('Error updating status directly:', directUpdateError);
          alert('✅ Response saved, but failed to update status');
        } else {
          alert('Response sent successfully');
          setShowResponseBackModal(false);
          setResponseBackText('');
          window.location.reload(); // Refresh to show new status
        }
      } else {
        alert('✅ Response sent successfully');
        setShowResponseBackModal(false);
        setResponseBackText('');
        window.location.reload(); // Refresh to show new status
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      alert('❌ An unexpected error occurred');
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



  return (
    <div className='dashboard-container'>
      {/* Navigation Bar */}
      <nav className="navbar navbar-expand-lg navbar-dark bg-gradient">
        <div className="container-fluid">
          <span className="navbar-brand mb-0 h1"> 👪 Parent Portal</span>
          <button onClick={handleLogout} className='btn btn-outline-light logout-btn'>
            Logout
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-lg-10">
            {/* Welcome Card */}
            <div className="card welcome-card shadow-lg mb-4">
              <div className="card-body p-5">
                <h1 className="card-title mb-3">Welcome, {name}! 👋</h1>
                <p className="card-text text-muted">
                  We're glad to have you here. Manage your concerns and stay connected with your child's education.
                </p>
              </div>
            </div>

            {/* User Info Section */}
            <div className="row g-4 mb-4">
              <div className="col-md-6">
                <div className="card info-card shadow">
                  <div className="card-body">
                    <h6 className="card-subtitle mb-2 text-muted">Name</h6>
                    <p className="card-text fs-5 fw-semibold">{name}</p>
                  </div>
                </div>
              </div>
              <div className="col-md-6">
                <div className="card info-card shadow">
                  <div className="card-body">
                    <h6 className="card-subtitle mb-2 text-muted">Email</h6>
                    <p className="card-text fs-5 fw-semibold">{email}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <div className="text-center mb-5">
              <button onClick={handleConcern} className='btn btn-primary btn-lg concern-btn'>
                📝 Submit a Concern
              </button>
            </div>

            {/* Complaints List Section */}
            <div className="card shadow-sm">
              <div className="bg-history">
                <h5 className="mb-0">My Communication History</h5>
              </div>
              <div className="list-group list-group-flush">
                {complaints.length > 0 ? (
                  complaints.map((complaint) => (
                    <div
                      key={complaint.complaint_id}
                      className="list-group-item list-group-item-action d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3"
                      onClick={() => handleComplaintClick(complaint.complaint_id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="flex-grow-1">
                        <small className="text-muted">{new Date(complaint.created_at).toLocaleDateString()}</small>
                        <div className="fw-bold">{complaint.title}</div>
                        <small className="text-muted">
                          {complaint.description.length > 100
                            ? complaint.description.substring(0, 100) + '...'
                            : complaint.description}
                          {complaint.description.length > 100 && (
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
                        </small>

                      </div>

                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        {complaint.stat_code === 4 && (
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedComplaint(complaint);
                              setShowResponseBackModal(true);
                            }}
                          >
                            Response back
                          </button>
                        )}
                        <span
                          className="badge rounded-pill status-badge"
                          style={{ backgroundColor: complaint.status_typ?.color || '#6c757d' }}
                        >
                          {complaint.status_typ?.display}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-muted">
                    No active concerns found.
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Comments Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h5 style={{ color: 'white' }}>Responses</h5>
              <button
                className="btn-close"
                onClick={() => setShowModal(false)}
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
                  {comments.map((comment) => (
                    <li key={comment.comment_id} className="list-group-item">
                      <div className="d-flex justify-content-between">
                        <strong className="mb-1">{comment.appusers?.name || 'Unknown'}</strong>
                        <small className="text-muted">
                          {new Date(comment.created_at).toLocaleString()}
                        </small>
                      </div>
                      {/* <p className="mb-1">{comment.comment_text}</p> */}

                      <div className="mb-3">

                        <div
                          className="p-3 border rounded bg-light"
                          style={{ maxHeight: '300px', overflowY: 'auto' }}
                        >
                          {comment.comment_text}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted text-center my-3">No responses yet.</p>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Close</button>
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

      {/* Response Back to School Modal */}
      {showResponseBackModal && selectedComplaint && (
        <div className="modal-overlay" onClick={() => setShowResponseBackModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h5 style={{ color: 'white' }}>Response to School</h5>
              <button
                className="btn-close"
                onClick={() => setShowResponseBackModal(false)}
              >X</button>
            </div>
            <div className="modal-body">
              <div className="mb-3">
                <label className="form-label fw-bold">Concern: {selectedComplaint.title}</label>
              </div>
              <div className="mb-3">
                <label htmlFor="responseBackText" className="form-label fw-bold">
                  Message <span className="text-danger">*</span>
                </label>
                <textarea
                  id="responseBackText"
                  className="form-control"
                  rows="5"
                  placeholder="Type your response..."
                  value={responseBackText}
                  onChange={(e) => setResponseBackText(e.target.value)}
                ></textarea>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowResponseBackModal(false);
                  setResponseBackText('');
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={submitResponseBack}
              >
                Send Response
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
}

export default Dashboard;

