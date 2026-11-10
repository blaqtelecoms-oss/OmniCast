import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function PageNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-20">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Compass className="h-5 w-5" />
        </span>
        <p className="label-micro mt-6">Error 404</p>
        <h1 className="mt-3 font-display text-4xl tracking-tight">This page went off-screen</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The link you followed doesn't point at anything on beam. Head back home and start again.
        </p>
        <Link
          to="/"
          className="focus-ring mt-7 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Back to beam
        </Link>
      </div>
    </div>
  );
}
