import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  MonitorUp,
  MousePointerClick,
  ShieldCheck,
  Unplug,
  Users,
  Laptop,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import useDevices from '@/components/devices/useDevices';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';

const STEPS = [
  {
    icon: MonitorUp,
    title: 'Share the screen you mean',
    body: 'Pick a window, a tab or the whole desktop. Nothing is recorded — the stream only exists while the room is open.',
  },
  {
    icon: Users,
    title: 'Hand over a six-character code',
    body: 'Whoever needs to see it types the code in Join a session. No accounts, no downloads, no meeting client.',
  },
  {
    icon: MousePointerClick,
    title: 'Or let them drive',
    body: 'Paired computers can hand over control, so you can walk someone through the thing they are actually stuck on.',
  },
];

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { devices, loading } = useDevices();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const joined = devices.filter((device) => device.status === 'paired');
  const firstName = (user?.name || '').split(' ')[0];

  const join = async (event) => {
    event.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean.length < 6) {
      setError('Room codes are six characters.');
      return;
    }
    setError('');
    setChecking(true);
    try {
      const room = await base44.rooms.peek(clean);
      if (!room?.exists) {
        setError('No room is live with that code.');
        return;
      }
      navigate(`/room/${clean}`);
    } catch (err) {
      setError(err.message || 'That code could not be checked.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      <section className="relative overflow-hidden pb-10 pt-14 sm:pb-16 sm:pt-20">
        <div className="pointer-events-none absolute -top-32 right-0 h-72 w-72 rounded-full bg-primary/10 blur-[110px]" />
        <div className="relative max-w-2xl">
          <p className="label-micro">Browser screen sharing</p>
          <h1 className="mt-4 font-display text-[2.75rem] leading-[1.03] tracking-tight sm:text-6xl">
            Mirror a screen, or help someone through theirs.
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            {firstName ? `${firstName}, start` : 'Start'} a room, share the code, and the other screen is
            looking at yours in seconds. Nothing to install for the person watching.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button as={Link} to="/room/new" size="lg">
              <MonitorUp className="h-4 w-4" />
              Share this screen
            </Button>
            <Button as={Link} to="/join" size="lg" variant="outline">
              Join a session
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <Unplug className="h-3.5 w-3.5 text-accent" /> No installs for guests
            </li>
            <li className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" /> Peer to peer, nothing stored
            </li>
            <li className="flex items-center gap-1.5">
              <Laptop className="h-3.5 w-3.5 text-accent" /> Works on any device with a browser
            </li>
          </ul>
        </div>
      </section>

      <section className="grid gap-4 border-t border-border/70 py-10 sm:grid-cols-2">
        <div className="rounded-xl border border-border/80 bg-card/60 p-6">
          <p className="label-micro">Start</p>
          <h2 className="mt-2 font-display text-2xl tracking-tight">Open a room</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            You get a code and an empty stage. Share your screen when you are ready.
          </p>
          <Button as={Link} to="/room/new" variant="secondary" className="mt-5">
            Create a room
          </Button>
        </div>

        <form onSubmit={join} className="rounded-xl border border-border/80 bg-card/60 p-6">
          <p className="label-micro">Join</p>
          <h2 className="mt-2 font-display text-2xl tracking-tight">Enter a code</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Six characters, from whoever is sharing.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="A1B2C3"
              maxLength={6}
              aria-label="Room code"
              className="font-mono uppercase tracking-[0.32em]"
            />
            <Button type="submit" variant="secondary" disabled={checking}>
              {checking ? 'Checking…' : 'Join'}
            </Button>
          </div>
          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        </form>
      </section>

      <section className="border-t border-border/70 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="label-micro">How it works</p>
            <h2 className="mt-2 font-display text-3xl tracking-tight">Three steps, no ceremony</h2>
          </div>
          <Link
            to="/devices"
            className="hidden shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:block"
          >
            {loading ? 'Your devices' : `${joined.length} device${joined.length === 1 ? '' : 's'} paired`}
          </Link>
        </div>

        <ol className="mt-7 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-xl border border-border/70 bg-card/40 p-5">
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/12 text-primary">
                  <step.icon className="h-4 w-4" />
                </span>
                <span className="font-mono text-[10px] tracking-[0.22em] text-muted-foreground">
                  0{index + 1}
                </span>
              </div>
              <h3 className="mt-4 text-sm font-semibold">{step.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
