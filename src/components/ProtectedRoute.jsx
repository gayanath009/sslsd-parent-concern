// ./components/ProtectedRoute.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../SupabaseClient';
import { useUser } from '../context/UserContext';

function ProtectedRoute({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { setEmail, setName } = useUser(); // Use context to store user email and name

  useEffect(() => {
    // Check for anonymous access flag
    if (location.state?.isAnonymous) {
      setIsAuthenticated(true);
      return;
    }

    let subscription;

    const checkSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        navigate('/login'); // Redirect to login if not authenticated
      } else {
        setIsAuthenticated(true);
        const { email, user_metadata } = session.user;
        setEmail(email);
        setName(user_metadata?.name || 'No name available'); // Set name from user metadata
      }
    };

    checkSession();

    // Subscribe to authentication state changes
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setIsAuthenticated(true);
        const { email, user_metadata } = session.user;
        setEmail(email);
        setName(user_metadata?.name || 'No name available'); // Handle name here as well
      } else {
        setIsAuthenticated(false);
        navigate('/login');
      }
    });
    subscription = data.subscription;

    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, [navigate, setEmail, setName, location]);

  if (isAuthenticated === null) return null;

  return isAuthenticated ? children : null;
}

export default ProtectedRoute;
