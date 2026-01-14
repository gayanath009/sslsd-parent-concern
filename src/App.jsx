import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { UserProvider } from './context/UserContext';
import Home from './Home/Home';
import Login from './Login/Login';
import UpdatePassword from './Login/UpdatePassword';
import Dashboard from './Dashboard/Dashboard';
import Complaints from './Complaints/Complaints';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <UserProvider>
      <Router basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/update-password" element={<UpdatePassword />} />
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

