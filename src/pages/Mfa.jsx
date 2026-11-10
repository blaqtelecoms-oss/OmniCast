import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { useAuth } from '@/lib/AuthContext';

export default function Mfa() {
  const navigate = useNavigate();
  const location = useLocation();
  const { checkAppState } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const next = location.state?.next || '/';

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const challenge = window.sessionStorage.getItem('beam_mfa_challenge') || '';
      const result = await base44.auth.verifyMfa(challenge, code.trim());
      window.sessionStorage.removeItem('beam_mfa_challenge');
      appParams.token = result.token;
      await checkAppState();
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message || 'That code was not accepted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Two-step"
      title="Enter your code"
      description="Open your authenticator app and type the six-digit code for beam."
      footer={<span className="font-mono text-[10px] tracking-tight">Any 6 digits work in this preview build.</span>}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Authentication code">
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="000000"
            className="text-center font-mono text-lg tracking-[0.4em]"
          />
        </Field>

        {error ? (
          <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={busy || code.length < 6}>
          <ShieldCheck className="h-4 w-4" />
          {busy ? 'Checking…' : 'Verify'}
        </Button>
      </form>
    </AuthLayout>
  );
}
