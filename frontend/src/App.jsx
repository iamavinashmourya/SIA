import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/DashboardLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Rooms from './pages/Rooms';
import Queue from './pages/Queue';
import Transcripts from './pages/Transcripts';
import HostIntervention from './pages/HostIntervention';
import Home from './pages/Home';
import JoinRoom from './pages/JoinRoom';
import Meeting from './pages/Meeting';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<Home />} />
          <Route path="/join/:inviteLink" element={<JoinRoom />} />
          <Route path="/meeting" element={<Meeting />} />
          
          {/* Protected routes */}
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <DashboardLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<Dashboard />} />
                    <Route path="rooms" element={<Rooms />} />
                    <Route path="queue" element={<Queue />} />
                    <Route path="transcripts" element={<Transcripts />} />
                    <Route path="intervention/:queueId" element={<HostIntervention />} />
                  </Route>

          {/* Redirect unknown routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
