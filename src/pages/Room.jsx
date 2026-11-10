import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import HostRoom from '@/components/room/HostRoom';
import HelpGuest from '@/components/room/HelpGuest';
import ViewerRoom from '@/components/room/ViewerRoom';
import { pageItems } from '@/components/room/signal';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode() {
  return Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
}

async function createSession(mode, user) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = makeCode();
    let existing = [];
    try {
      existing = await pageItems(base44.entities.CastSession.filter({ code, status: 'live' }));
    } catch (err) {
      existing = [];
    }
    if (existing.length) continue;
    return base44.entities.CastSession.create({
      code,
      mode,
      host_id: user.id,
      host_name: user.full_name || user.email || 'Host',
      status: 'live',
      allow_pointing: true,
    });
  }
  return null;
}

export default function Room() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState('');
  const [loading, setLoading] = useState(true);
  const [hostDevice, setHostDevice] = useState(false);
  const mode = params.get('mode') === 'help' ? 'help' : 'mirror';

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const user = await base44.auth.me();
        if (!alive) return;
        setMe(user);

        if (!code || code === 'new') {
          const created = await createSession(mode, user);
          if (!alive) return;
          if (!created) {
            setError('Could not open a room just now. Please try again.');
            setLoading(false);
            return;
          }
          localStorage.setItem(`beam-host-${created.code}`, '1');
          navigate(`/room/${created.code}`, { replace: true });
          return;
        }

        const found = await pageItems(
          base44.entities.CastSession.filter({ code: code.toUpperCase() }, { sort: '-created_date', limit: 5 })
        );
        if (!alive) return;
        const active = found.find((item) => item.status === 'live') || found[0];
        if (!active) {
          setError('That code is not active. Check the six characters and try again.');
        } else {
          setSession(active);
          setHostDevice(localStorage.getItem(`beam-host-${active.code}`) === '1');
        }
        setLoading(false);
      } catch (err) {
        if (!alive) return;
        setDetail(String(err?.message || err || ''));
        setError('Something went wrong opening this room.');
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [code, mode]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-lg font-medium">Room not found</p>
        <p className="max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">{error}</p>
        {detail && (
          <p className="max-w-sm font-mono text-[10.5px] leading-relaxed text-muted-foreground/60">
            {detail}
          </p>
        )}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          Back to home
        </button>
      </div>
    );
  }

  if (!session) return null;

  const isCreator = Boolean(me && session.host_id === me.id);

  // Help room: the host opens the room and guides. Whoever joins with the code waits to
  // be accepted, then shares their screen while the host watches and controls it.
  if (session.mode === 'help') {
    return isCreator ? (
      <ViewerRoom session={session} me={me} canClaimHost={false} />
    ) : (
      <HelpGuest session={session} me={me} />
    );
  }

  const canClaimHost = isCreator && !hostDevice;

  return hostDevice && isCreator ? (
    <HostRoom session={session} me={me} />
  ) : (
    <ViewerRoom session={session} me={me} canClaimHost={canClaimHost} />
  );
}