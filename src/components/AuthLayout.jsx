import { Link } from 'react-router-dom';

export default function AuthLayout({ eyebrow, title, description, children, footer }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-16">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-40" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[38rem] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />

      <div className="relative w-full max-w-sm">
        <Link to="/" className="group flex items-center justify-center gap-2.5">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/30">
            <span className="h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">beam</span>
        </Link>

        <div className="mt-8 rounded-xl border border-border/80 bg-card/80 p-6 shadow-2xl backdrop-blur">
          <p className="label-micro">{eyebrow}</p>
          <h1 className="mt-3 font-display text-3xl leading-tight tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
          <div className="mt-6">{children}</div>
        </div>

        {footer ? <div className="mt-5 text-center text-xs text-muted-foreground">{footer}</div> : null}
      </div>
    </div>
  );
}
