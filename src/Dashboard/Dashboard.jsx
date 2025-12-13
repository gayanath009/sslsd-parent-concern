import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../SupabaseClient';
import { useUser } from '../context/UserContext';
import RepresentativeDashboard from './RepresentativeDashboard';
import PrincipalDashboard from './PrincipalDashboard';
import './Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();
  const { email, name, setEmail, setName, role, setRole, setUserId } = useUser();
  const [loading, setLoading] = useState(true);

  // Moved Logic (Complaints) to top level
  const [complaints, setComplaints] = useState([]);
  const [comments, setComments] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);

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
          .from('user')
          .select('user_id, role')
          .eq('email', email)
          .maybeSingle();

        if (!existingRecord) {
          // Insert new user with default role 'parent'
          const { data: newUser, error: insertError } = await supabase
            .from('user')
            .insert({
              name: userName,
              email: email,
              auth_provider: provider,
              role: 'parent',
              is_active: true,
              created_at: new Date().toISOString(),
            })
            .select('user_id, role')
            .single();

          if (insertError) {
            console.error('Error inserting user:', insertError);
          } else {
            console.log('Record inserted successfully');
            setRole(newUser?.role || 'parent');
            setUserId(newUser?.user_id || null);
          }
        } else {
          console.log('Record already exists');
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
      if (!email || role !== 'parent') return; // Only fetch for parents

      // First get the user_id if not already in context/state, 
      // but we are already doing that in the main useEffect.
      // Let's rely on the result of the main logic or just query by email if the schema supports it.
      // Safer to query by the user_id we found.

      try {
        const { data: userData, error: userError } = await supabase
          .from('user')
          .select('user_id')
          .eq('email', email)
          .single();

        if (userError || !userData) return;

        const { data, error } = await supabase
          .from('complaint')
          .select('*')
          .eq('user_id', userData.user_id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching complaints:', error);
        } else {
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
  if (role === 'representative') {
    return <RepresentativeDashboard />;
  }

  if (role === 'principal') {
    return <PrincipalDashboard />;
  }

  // Default: Parent Dashboard

  const handleComplaintClick = async (complaintId) => {
    setLoadingComments(true);
    setShowModal(true);
    setComments([]); // Clear previous

    try {
      const { data, error } = await supabase
        .from('comment') // stored in 'comment' table based on request
        .select('*')
        .eq('complaint_id', complaintId)
        .order('created_at', { ascending: true });

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
                <h5 className="mb-0">My Concern History</h5>
              </div>
              <div className="list-group list-group-flush">
                {complaints.length > 0 ? (
                  complaints.map((complaint) => (
                    <button
                      key={complaint.complaint_id}
                      className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                      onClick={() => handleComplaintClick(complaint.complaint_id)}
                    >
                      <div>
                        <div className="fw-bold">{complaint.title}</div>
                        <small className="text-muted">{new Date(complaint.created_at).toLocaleDateString()}</small>
                      </div>
                      <span className={`badge rounded-pill ${complaint.status === 'open' ? 'bg-success' :
                        complaint.status === 'closed' ? 'bg-secondary' : 'bg-primary'
                        }`}>
                        {complaint.status}
                      </span>
                    </button>
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
      {
        showModal && (
          <div className="modal-backdrop-custom">
            <div className="modal-content-custom">
              <div className="modal-header-custom">
                <h5 className="modal-title">Replies</h5>
                <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
              </div>
              <div className="modal-body-custom">
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
                        <p className="mb-1">{comment.comment_text}</p>
                        <small className="text-muted">
                          {new Date(comment.created_at).toLocaleString()}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted text-center my-3">No replies yet.</p>
                )}
              </div>
              <div className="modal-footer-custom">
                <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}

export default Dashboard;

