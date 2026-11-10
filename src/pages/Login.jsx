import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { useAuth } from '@/lib/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { checkAppState } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const next = new URLSearchParams(location.search).get('next') || location.state?.from || '/';

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await base44.auth.login(email.trim(), password);
      if (result?.mfaRequired) {
        window.sessionStorage.setItem('beam_mfa_challenge', result.challenge);
        navigate('/mfa', { replace: true, state: { next } });
        return;
      }
      appParams.token = result.token;
      await checkAppState();
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message || 'That sign-in did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Sign in"
      title="Welcome back"
      description="Pick up your devices and sessions where you left them."
      footer={
        <>
          No account yet?{' '}
          <Link to="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@studio.com"
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </Field>

        {error ? (
          <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <Link to="/forgot-password" className="underline-offset-4 hover:text-foreground hover:underline">
          Forgot password?
        </Link>
        <span className="font-mono text-[10px] tracking-tight">demo@beam.app · demo1234</span>
      </div>
    </AuthLayout>
  );
}
