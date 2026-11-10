import { Navigate, useLocation } from 'react-router-dom';

/**
 * Sends a signed-out visitor to sign-in, keeping the page they actually asked for.
 *
 * The companion opens /devices?agent=…&device=… on the computer it runs on, and
 * those parameters are how that page knows which device it is looking at — losing
 * them at sign-in is what made people install the companion again after logging in.
 */
export default function LoginRedirect() {
  const location = useLocation();
  const here = `${location.pathname}${location.search}`;
  const target = here && here !== '/' ? `/login?returnTo=${encodeURIComponent(here)}` : '/login';
  return <Navigate to={target} replace />;
}