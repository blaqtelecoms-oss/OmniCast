import { cn } from '@/lib/utils';

const VARIANTS = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary/90 disabled:hover:bg-primary border border-transparent',
  secondary:
    'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-transparent',
  outline:
    'border border-border bg-transparent text-foreground hover:bg-secondary/60',
  ghost: 'border border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
  danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 border border-transparent',
};

const SIZES = {
  sm: 'h-9 px-3.5 text-xs',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-sm',
};

export function Button({
  as: Component = 'button',
  variant = 'primary',
  size = 'md',
  className,
  ...props
}) {
  return (
    <Component
      className={cn(
        'focus-ring inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    />
  );
}
