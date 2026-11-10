import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'focus-ring h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground/70',
        className
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }) {
  return (
    <label
      className={cn('mb-1.5 block text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

export function Field({ label, hint, children, className }) {
  return (
    <div className={cn('w-full', className)}>
      {label ? <Label>{label}</Label> : null}
      {children}
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground/80">{hint}</p> : null}
    </div>
  );
}
