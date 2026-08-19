import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Wraps everything that requires a session. While the stored token is being
// verified we show a quiet loading state instead of flashing the login page.
export default function ProtectedRoute() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return <div className="page-loading">Checking your session...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
