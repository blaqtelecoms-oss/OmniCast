import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await base44.auth.requestPasswordReset(email.trim());
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Reset"
      title="Forgot your password?"
      description="We'll email a reset link to the address on your account."
      footer={
        <Link to="/login" className="underline-offset-4 hover:text-foreground hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="leading-relaxed text-foreground">
            If <span className="font-medium">{email}</span> has an account, a reset link is on its way.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@studio.com"
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
