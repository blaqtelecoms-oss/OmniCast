import { useNavigate } from 'react-router-dom';
import HeroSection from '@/components/home/HeroSection';
import StartCards from '@/components/home/StartCards';
import JoinPanel from '@/components/home/JoinPanel';

export default function Home() {
  const navigate = useNavigate();

  return (
    <main>
      <HeroSection />

      <section id="start" className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="mb-6 flex items-end justify-between gap-6">
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
              Start here
            </p>
            <h2 className="text-balance text-2xl font-medium tracking-tight sm:text-3xl">
              Two ways to share a screen
            </h2>
          </div>
          <p className="hidden max-w-[26ch] text-right text-[13px] leading-relaxed text-muted-foreground sm:block">
            Phone, laptop or smart TV — every device joins with the same code.
          </p>
        </div>

        <StartCards onStart={(mode) => navigate(`/room/new?mode=${mode}`)} />

        <div className="mt-4">
          <JoinPanel onJoin={(code) => navigate(`/room/${code}`)} />
        </div>
      </section>
    </main>
  );
}