import { Image } from '@/components/ui/image';
import { ArrowUpRight } from 'lucide-react';

const HERO_IMAGE =
  'https://media.base44.com/images/public/6aeef3a599c7640be7d910de/ae4ece579_generated_image.png';

export default function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden" aria-label="Beam">
      <div className="pointer-events-none absolute inset-0 ink-glow" />
      <div className="pointer-events-none absolute -right-40 -top-24 h-[520px] w-[520px] rounded-full bg-accent/10 blur-[120px]" />

      <div className="relative mx-auto w-full max-w-6xl px-5 pb-14 pt-14 sm:px-8 sm:pb-20 sm:pt-20">
        <div className="grid items-stretch gap-10 lg:grid-cols-[1fr_44%] lg:gap-12">
          <div className="flex flex-col justify-between gap-10">
            <div>
              <p className="mb-7 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Cast · Mirror · Help
              </p>
              <h1 className="text-balance font-display text-[clamp(2.7rem,6.4vw,5.1rem)] font-normal leading-[0.94] tracking-[-0.02em]">
                Put any screen
                <br />
                on the <em className="italic text-primary">big</em> one.
              </h1>
            </div>

            <div className="flex flex-col items-start gap-7">
              <p className="max-w-[42ch] text-[15px] leading-relaxed text-muted-foreground sm:text-base">
                Mirror your phone or laptop onto a TV in a couple of taps. Or open a help
                room and walk someone through their own screen — live, from anywhere.
              </p>
              <a
                href="#start"
                className="group inline-flex items-center gap-3 rounded-full border border-foreground/25 px-7 py-4 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground transition-colors hover:border-foreground/70 hover:bg-foreground/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                Start a session
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </a>
            </div>
          </div>

          <figure className="relative overflow-hidden rounded-[22px] ring-1 ring-border/80 lg:pl-0">
            <div className="absolute inset-0 z-10 bg-gradient-to-t from-background/55 via-transparent to-background/10" />
            <Image
              src={HERO_IMAGE}
              alt="A phone beaming its screen onto a large TV in a dim living room"
              className="aspect-[4/3] w-full lg:aspect-[602/628] lg:h-full"
              fittingType="fill"
            />
          </figure>
        </div>
      </div>
    </section>
  );
}