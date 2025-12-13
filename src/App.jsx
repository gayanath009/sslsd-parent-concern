import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { UserProvider } from './context/UserContext';
import Home from './Home/Home';
import Login from './Login/Login';
import Dashboard from './Dashboard/Dashboard';
import Complaints from './Complaints/Complaints';
import ComplaintsList from './Complaints/ComplaintsList';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <UserProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/complaints"
            element={
              <ProtectedRoute>
                <Complaints />
              </ProtectedRoute>
            }
          />
          {/* <Route
            path="/complaints-list"
            element={
              <ProtectedRoute>
                <ComplaintsList />
              </ProtectedRoute>
            }
          /> */}
        </Routes>
      </Router>
    </UserProvider>
  );
}

export default App;

