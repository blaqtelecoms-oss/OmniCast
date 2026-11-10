import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, MonitorUp, Pencil, Trash2, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { PLATFORMS } from '@/lib/deviceInstallers';
import { formatRelative } from '@/lib/utils';

export default function DeviceRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await base44.devices.get(id);
      setDevice(data);
      setName(data.name);
      setError('');
    } catch (err) {
      setError(err.status === 404 ? 'That computer is no longer paired.' : err.message || 'Could not load it.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const next = name.trim();
    if (!next) return;
    const updated = await base44.devices.update(id, { name: next });
    setDevice(updated);
    setEditing(false);
  };

  const remove = async () => {
    await base44.devices.remove(id);
    navigate('/devices', { replace: true });
  };

  const platform = PLATFORMS.find((entry) => entry.id === device?.platform);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        to="/devices"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All devices
      </Link>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : error ? (
        <div className="mt-8 rounded-xl border border-border/80 bg-card/50 p-6">
          <p className="font-display text-2xl tracking-tight">{error}</p>
          <Button as={Link} to="/devices" variant="secondary" className="mt-4">
            Back to devices
          </Button>
        </div>
      ) : (
        <>
          <header className="mt-6">
            <p className="label-micro">{platform?.name || 'Computer'}</p>
            {editing ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input value={name} onChange={(event) => setName(event.target.value)} className="max-w-xs" />
                <Button size="sm" onClick={save}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <h1 className="font-display text-4xl leading-tight tracking-tight">{device.name}</h1>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="focus-ring rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label="Rename this computer"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Wifi className="h-3.5 w-3.5 text-accent" />
              Paired · last seen {formatRelative(device.lastSeen)}
            </p>
          </header>

          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border/80 bg-card/50 p-5">
              <p className="label-micro">Agent</p>
              <p className="mt-2 text-sm">{platform?.shell || 'Background service'}</p>
              <p className="mt-1 text-xs text-muted-foreground">{platform?.detail || 'Any modern desktop'}</p>
            </div>
            <div className="rounded-xl border border-border/80 bg-card/50 p-5">
              <p className="label-micro">Pairing</p>
              <p className="mt-2 font-mono text-sm tracking-[0.2em]">{device.pairCode || '—'}</p>
              <p className="mt-1 text-xs text-muted-foreground">Ask the agent to print this code again.</p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-border/80 bg-card/40 p-6">
            <h2 className="font-display text-2xl tracking-tight">Bring this screen into a session</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Open a room on this computer, then approve the agent's request when it appears. Nothing is
              captured while the room is closed.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button as={Link} to="/room/new">
                <MonitorUp className="h-4 w-4" />
                Open a room
              </Button>
              <Button variant="outline" onClick={remove}>
                <Trash2 className="h-3.5 w-3.5" />
                Remove computer
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
