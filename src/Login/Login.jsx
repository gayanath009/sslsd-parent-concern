import { useEffect } from 'react';
import { supabase } from '../../SupabaseClient';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import './login.css';

function Login() {
  const navigate = useNavigate();
  const { setEmail } = useUser(); // ✅ Destructure setEmail from context

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setEmail(session.user.email);
        navigate('/dashboard');
      }
    };
    checkSession();
  }, [navigate, setEmail]);



  const signUp = async () => {
    await supabase.auth.signOut(); // ✅ force logout before fresh login
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Dynamically build the redirect URL based on the current origin and base path
        redirectTo: window.location.origin + '/dashboard', // ✅ force Google to show account picker

        queryParams: {
          prompt: 'select_account', // ✅ force Google to show account picker
          response_mode: 'query',
        },
      },
    });
  };

  return (
    <div className='login_page'>
      <nav className="navbar navbar-expand-lg navbar-dark bg-gradient">
        <div className="container-fluid">
          <span className="navbar-brand mb-0 h1">Parent Concerns Portal</span>
          <a href="/" className='btn btn-outline-light btn-sm'>🡐 Home</a>
        </div>
      </nav>

      <div className="login-content-wrapper">
        {/* <a href="/" className='getbackhome'>🡐 Home Page</a> */}
        {/* <h1 className='letsgetstarted'>Let's get you started...</h1> */}
        <br />

        <button onClick={signUp} className='login_button'>
          <img src="/google.png" alt="G" className='google_icon' />
          <span className='bar'>|</span>
          <span className='signin_text'> Sign in with Google</span>
        </button>
      </div>
    </div >
  );
}

export default Login;
