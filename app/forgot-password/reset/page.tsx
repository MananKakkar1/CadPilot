'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ArrowRight, KeyRound } from 'lucide-react';
import { Input } from '@/components/magicui/input';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/magicui/button';
import { PasswordChecklist } from '@/components/auth/password-checklist';
import { isPasswordValid } from '@/lib/auth/password-policy';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? 'Unable to reset password.');
        setPending(false);
        return;
      }
      router.replace('/sign-in?reset=success');
    } catch {
      setError('Connection failed — check your network and try again.');
      setPending(false);
    }
  };

  return (
    <AuthLayout>
      <section className="auth-card">
        <div className="auth-card-content">
          <div className="auth-icon"><KeyRound /></div>
          <p className="auth-kicker">RESET YOUR PASSWORD</p>
          <h1>Enter your code</h1>
          <p className="auth-intro">Enter the reset code we emailed you along with a new password.</p>
          <form onSubmit={submit}>
            <label htmlFor="reset-email">Email
              <Input id="reset-email" autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required />
            </label>
            <label htmlFor="reset-code">Reset code
              <Input id="reset-code" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="123456" required />
            </label>
            <label htmlFor="reset-new-password">New password
              <Input id="reset-new-password" autoComplete="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required />
            </label>
            <PasswordChecklist password={newPassword} />
            {error && <p className="auth-error" role="alert">{error}</p>}
            <Button type="submit" disabled={pending || !isPasswordValid(newPassword)}>{pending ? 'Please wait…' : 'Reset password'} <ArrowRight /></Button>
          </form>
          <p className="auth-switch">Didn&apos;t get a code? <Link href="/forgot-password">Request another</Link></p>
        </div>
      </section>
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
