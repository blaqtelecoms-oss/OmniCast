import { ArrowRight, Tv, LifeBuoy } from 'lucide-react';

const CARDS = [
  {
    id: 'mirror',
    icon: Tv,
    kicker: 'Mirror',
    title: 'Screen to the big one',
    body:
      'Share this screen with a TV, tablet or another laptop. Open the code on the TV and you are live — no cables, no apps to install.',
    action: 'Start mirroring',
    tint: 'from-primary/12',
  },
  {
    id: 'help',
    icon: LifeBuoy,
    kicker: 'Remote help',
    title: 'See the screen, guide the person',
    body:
      'Open a help room and watch their screen in real time. Point, tap and write notes right on top of it while they keep control.',
    action: 'Start a help room',
    tint: 'from-accent/12',
  },
];

export default function StartCards({ onStart }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {CARDS.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onStart(card.id)}
            className="group relative overflow-hidden rounded-3xl border border-border bg-card/70 p-6 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-card sm:p-7"
          >
            <div
              className={`pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b ${card.tint} to-transparent opacity-70 transition-opacity group-hover:opacity-100`}
            />
            <div className="relative">
              <div className="mb-6 flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/60">
                  <Icon className="h-[18px] w-[18px] text-foreground" />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  {card.kicker}
                </span>
              </div>
              <h3 className="mb-2 text-lg font-medium tracking-tight">{card.title}</h3>
              <p className="mb-6 text-[13.5px] leading-relaxed text-muted-foreground">
                {card.body}
              </p>
              <span className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground">
                {card.action}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}