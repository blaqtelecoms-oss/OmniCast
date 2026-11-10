import { UserX } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function UserNotRegisteredError() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-20">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <UserX className="h-5 w-5" />
        </span>
        <p className="label-micro mt-6">Access</p>
        <h1 className="mt-3 font-display text-4xl tracking-tight">This account isn't on the list</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Your sign-in worked, but this person hasn't been added to the workspace yet. Ask an admin to
          invite you, then try again.
        </p>
        <button
          type="button"
          onClick={() => base44.auth.logout('/login')}
          className="focus-ring mt-7 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Use another account
        </button>
      </div>
    </div>
  );
}
