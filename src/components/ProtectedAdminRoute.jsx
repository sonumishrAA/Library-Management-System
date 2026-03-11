import { Navigate } from 'react-router-dom';
import { decodeJwt } from 'jose';

export default function ProtectedAdminRoute({ children }) {
  const token = sessionStorage.getItem('lms_admin_token');

  if (!token) {
    return <Navigate to="/LMS-admin/login" replace />;
  }

  try {
    const payload = decodeJwt(token);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      sessionStorage.removeItem('lms_admin_token');
      return <Navigate to="/LMS-admin/login" replace />;
    }
  } catch {
    sessionStorage.removeItem('lms_admin_token');
    return <Navigate to="/LMS-admin/login" replace />;
  }

  return children;
}
