import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Smartphone, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import useBeamMedia from './useBeamMedia';

export default function PhoneBeamPanel({ session, me }) {
  const inputRef = useRef(null);
  const { media } = useBeamMedia(session.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      await base44.entities.BeamMedia.create({
        session_id: session.id,
        kind: file.type.startsWith('video') ? 'video' : 'image',
        file_uri,
        title: file.name,
        sender_name: me?.full_name || me?.email || 'A guest',
      });
    } catch (err) {
      setError('That file could not be sent. Try a photo or a short video.');
    }
    setBusy(false);
  };

  const clear = async () => {
    if (!media) return;
    try {
      await base44.entities.BeamMedia.delete(media.id);
    } catch (err) {
      setError('Only the device that sent it can take it down.');
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background/60">
        <Smartphone className="h-6 w-6 text-muted-foreground" />
      </span>

      <div>
        <p className="text-base font-medium">Send a photo to the screen</p>
        <p className="mx-auto mt-1 max-w-[40ch] text-[13px] leading-relaxed text-muted-foreground">
          Phone browsers can&apos;t capture the whole screen. Pick a photo or a short video
          instead — it opens on every screen in this room.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        onChange={pick}
        className="hidden"
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        {busy ? 'Sending…' : 'Choose a photo or video'}
      </button>

      {media && (
        <div className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[12px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          On screen now
          <button
            type="button"
            onClick={clear}
            className="ml-1 flex items-center gap-1 text-muted-foreground transition-colors hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
            Remove
          </button>
        </div>
      )}

      {error && <p className="max-w-[34ch] text-[12px] text-destructive">{error}</p>}
    </div>
  );
}