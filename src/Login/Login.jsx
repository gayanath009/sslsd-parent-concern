import { useEffect, useState } from 'react';
import { supabase } from '../../SupabaseClient';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import './login.css';
import sslsdLogo from '../assets/sslsd-logo.png';

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setEmail } = useUser();
  const [loading, setLoading] = useState(false);
  const [email, setInputEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Check if redirected from Home with email method preference
    if (location.state?.method === 'email') {
      // You could autofocus or scroll here if needed
    }

    // Check for password recovery event
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event == "PASSWORD_RECOVERY") {
        navigate('/update-password');
      }
    })

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setEmail(session.user.email);
        navigate('/dashboard');
      }
    };
    checkSession();
  }, [navigate, setEmail, location]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/dashboard',
        queryParams: {
          prompt: 'select_account',
          response_mode: 'query',
        },
      },
    });
    if (error) {
      alert(error.message);
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/update-password',
      });
      if (error) throw error;
      setMessage('✅ Password reset link sent! Check your email.');
      // Don't switch view immediately so they can see the message, or switch to login?
      // setIsForgotPassword(false); 
    } catch (error) {
      setMessage('❌ ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (isSignUp) {
        // Sign Up
        const { data, error } = await supabase.auth.signUp({
          email: email,
          password: password,
          options: {
            data: {
              name: fullName,
            } // Metadata (name) to be used in Dashboard to create user record
          }
        });

        if (error) throw error;

        if (data?.session) {
          navigate('/dashboard');
        } else if (data?.user) {
          setMessage('✅ Registration successful! Please check your email for confirmation (if enabled) or sign in.');
          setIsSignUp(false); // Switch to login view
        }

      } else {
        // Sign In
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email,
          password: password,
        });

        if (error) throw error;

        if (data?.session) {
          navigate('/dashboard');
        }
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='login_page'>
      <nav className="navbar navbar-expand-lg navbar-dark bg-gradient">
        <div className="container-fluid">
          <span className="navbar-brand mb-0 h1">SSLSD Parent Concerns Portal</span>
          <a href="/" className='btn btn-outline-light btn-sm'>Home</a>
        </div>
      </nav>

      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-md-6 col-lg-5">
            <div className="card shadow border-0">
              <div className="card-body p-5">
                <div className="text-center mb-3">
                  <img src={sslsdLogo} alt="SSLSD Logo" style={{ width: '100px', height: 'auto' }} />
                </div>
                <h3 className="card-title text-center mb-4">
                  {/* {isSignUp ? 'Create Account' : 'Welcome Back'} */}
                  SSLSD Parent Concerns Portal
                </h3>
                {/* <h5 className="text-center mb-4 text-muted">
                  {isForgotPassword ? 'Reset Password' : (isSignUp ? 'Create Account' : 'Welcome Back')}
                </h5> */}

                {!isForgotPassword && (
                  <>
                    <div className="d-grid gap-2 mb-3">
                      <button onClick={handleGoogleLogin} className='login_button btn d-flex align-items-center justify-content-center gap-2' disabled={loading}>
                        <img src="/google.png" alt="G" className='google_icon' style={{ width: '24px', height: '24px' }} />
                        <span>Sign in with Google</span>
                      </button>
                    </div>

                    <div className="d-flex align-items-center my-3">
                      <hr className="flex-grow-1" />
                      <span className="mx-2 text-muted fw-bold">OR</span>
                      <hr className="flex-grow-1" />
                    </div>
                  </>
                )}

                {message && <div className={`alert ${message.includes('success') || message.includes('sent') ? 'alert-success' : 'alert-danger'}`}>{message}</div>}

                {isForgotPassword ? (
                  <form onSubmit={handleResetPassword}>
                    <div className="mb-3">
                      <label className="form-label">Email Address</label>
                      <input
                        type="email"
                        className="form-control"
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setInputEmail(e.target.value)}
                        required
                      />
                    </div>
                    <button type="submit" className="btn btn-primary w-100 py-2" disabled={loading}>
                      {loading ? 'Sending...' : 'Send Reset Link'}
                    </button>
                    <div className="text-center mt-3">
                      <span style={{ cursor: 'pointer', fontWeight: 'bold', color: '#004d24' }} onClick={() => { setIsForgotPassword(false); setMessage(''); }}>Back to Sign In</span>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleEmailAuth}>
                    {isSignUp && (
                      <div className="mb-3">
                        <label className="form-label">Full Name</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="John Doe"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          required
                        />
                      </div>
                    )}
                    <div className="mb-3">
                      <label className="form-label">Email Address</label>
                      <input
                        type="email"
                        className="form-control"
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setInputEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Password</label>
                      <input
                        type="password"
                        className="form-control"
                        placeholder="******"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      {!isSignUp && (
                        <div className="text-end mt-1">
                          <span
                            className="text-muted small"
                            style={{ cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={() => { setIsForgotPassword(true); setMessage(''); }}
                          >
                            Forgot Password?
                          </span>
                        </div>
                      )}
                    </div>

                    <button type="submit" className="btn btn-primary w-100 py-2" disabled={loading}>
                      {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
                    </button>
                  </form>
                )}

                {!isForgotPassword && (
                  <div className="text-center mt-3">
                    {isSignUp ? (
                      <p>Already have an account? <span style={{ cursor: 'pointer', fontWeight: 'bold', color: '#004d24' }} onClick={() => setIsSignUp(false)}>Sign In</span></p>
                    ) : (
                      <p>Don't have an account? <span style={{ cursor: 'pointer', fontWeight: 'bold', color: '#004d24' }} onClick={() => setIsSignUp(true)}>Sign Up</span></p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div >
  );
}

export default Login;
