import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function RequireAuth({ admin = false, children }) {
  const { user, ready, isAdmin } = useAuth();
  const loc = useLocation();
  if (!ready) return <section className="container placeholder"><p className="muted">Loading…</p></section>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (admin && !isAdmin) return <section className="container placeholder"><h1 className="h1">Admin only</h1><p>This area is for Impress Design staff.</p></section>;
  return children;
}
