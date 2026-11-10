import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Rendered inside ProtectedRoute when there is no session. Sends the visitor to
 * /login while remembering where they were headed.
 */
export default function LoginRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    navigate('/login', { replace: true, state: { from: location.pathname } });
  }, [navigate, location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
    </div>
  );
}
