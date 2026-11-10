import { Outlet, Link, useLocation } from 'react-router-dom';
import { MonitorUp, LogOut } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function AppShell() {
  const location = useLocation();
  const isRoom = location.pathname.startsWith('/room');

  return (
    <div className="min-h-screen bg-background text-foreground">
      {!isRoom && (
        <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-8">
            <Link to="/" className="group flex items-center gap-2.5">
              <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/30">
                <span className="h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="text-[15px] font-semibold tracking-tight">beam</span>
            </Link>

            <nav className="flex items-center gap-0.5 text-xs text-muted-foreground sm:gap-1 sm:text-sm">
              <Link to="/" className={`whitespace-nowrap rounded-full px-2 py-1.5 transition-colors hover:text-foreground sm:px-3.5 ${location.pathname === '/' ? 'bg-secondary text-foreground' : ''}`}>Home</Link>
              <Link to="/join" className={`whitespace-nowrap rounded-full px-2 py-1.5 transition-colors hover:text-foreground sm:px-3.5 ${location.pathname === '/join' ? 'bg-secondary text-foreground' : ''}`}>Join</Link>
              <Link to="/devices" className={`whitespace-nowrap rounded-full px-2 py-1.5 transition-colors hover:text-foreground sm:px-3.5 ${location.pathname.startsWith('/device') ? 'bg-secondary text-foreground' : ''}`}>Devices</Link>
              <button type="button" onClick={() => base44.auth.logout('/login')} title="Sign out" className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <LogOut className="h-4 w-4" />
              </button>
            </nav>
          </div>
        </header>
      )}

      <Outlet />

      {!isRoom && (
        <footer className="mx-auto w-full max-w-6xl px-5 pb-10 pt-16 sm:px-8">
          <div className="flex flex-col gap-3 border-t border-border/70 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2">
              <MonitorUp className="h-3.5 w-3.5" />
              Beam — mirror a screen, or help someone through theirs.
            </span>
            <span className="font-mono tracking-tight">Works on any device with a browser</span>
          </div>
        </footer>
      )}
    </div>
  );
}
