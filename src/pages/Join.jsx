import { useNavigate } from 'react-router-dom';
import JoinPanel from '@/components/home/JoinPanel';

export default function Join() {
  const navigate = useNavigate();

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-20 sm:px-8">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
        Join a session
      </p>
      <h1 className="text-balance font-display text-4xl leading-tight tracking-tight sm:text-5xl">
        The code is on their screen.
      </h1>
      <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
        Type the six characters and this device starts watching or helping right away.
      </p>

      <div className="mt-8">
        <JoinPanel onJoin={(code) => navigate(`/room/${code}`)} />
      </div>
    </main>
  );
}