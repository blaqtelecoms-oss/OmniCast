import { Loader2 } from 'lucide-react';
import { Image } from '@/components/ui/image';

export default function BeamMediaStage({ media, src }) {
  if (!src) {
    return (
      <div className="flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {media.kind === 'video' ? (
        <video
          src={src}
          controls
          playsInline
          className="max-h-full w-full object-contain"
        />
      ) : (
        <Image
          src={src}
          alt={media.title || 'Shared photo'}
          fittingType="fit"
          className="max-h-full w-full object-contain"
        />
      )}

      <span className="pointer-events-none absolute left-4 top-4 rounded-full border border-border bg-background/80 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground backdrop-blur">
        From {media.sender_name || 'a guest'}
      </span>
    </div>
  );
}