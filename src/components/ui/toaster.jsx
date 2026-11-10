import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

let listeners = [];
let counter = 0;

export function toast({ title, description, variant = 'default' }) {
  const id = ++counter;
  listeners.forEach((notify) => notify({ id, title, description, variant }));
  return id;
}

export function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const notify = (item) => {
      setItems((previous) => [...previous, item]);
      window.setTimeout(() => {
        setItems((previous) => previous.filter((entry) => entry.id !== item.id));
      }, 5000);
    };
    listeners.push(notify);
    return () => {
      listeners = listeners.filter((entry) => entry !== notify);
    };
  }, []);

  if (!items.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-lg border bg-popover/95 p-4 text-sm shadow-xl backdrop-blur',
            item.variant === 'destructive' ? 'border-destructive/40' : 'border-border'
          )}
        >
          {item.variant === 'destructive' ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">{item.title}</p>
            {item.description ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setItems((previous) => previous.filter((entry) => entry.id !== item.id))}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
