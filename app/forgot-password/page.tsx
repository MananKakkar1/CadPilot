'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Mail } from 'lucide-react';
import { Input } from '@/components/magicui/input';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/magicui/button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // The endpoint always responds ok:true regardless of whether the email
      // exists, so treat any successful response as success.
      if (!response.ok) throw new Error('request failed');
      setDone(true);
    } catch {
      setError('Connection failed — check your network and try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout>
      <section className="auth-card">
        <div className="auth-card-content">
          <div className="auth-icon"><Mail /></div>
          <p className="auth-kicker">RESET YOUR PASSWORD</p>
          <h1>Forgot your password?</h1>
          <p className="auth-intro">Enter the email on your account and we&apos;ll send a reset code if it exists.</p>
          {done ? (
            <>
              <p className="auth-success" role="status">If that email exists, we sent a reset code.</p>
              <p className="auth-switch"><Link href={`/forgot-password/reset${email ? `?email=${encodeURIComponent(email)}` : ''}`}>I have a code &rarr;</Link></p>
            </>
          ) : (
            <form onSubmit={submit}>
              <label htmlFor="forgot-email">Email
                <Input id="forgot-email" autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required />
              </label>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <Button type="submit" disabled={pending}>{pending ? 'Please wait…' : 'Send reset code'} <ArrowRight /></Button>
            </form>
          )}
          <p className="auth-switch">Remembered your password? <Link href="/sign-in">Sign in</Link></p>
        </div>
      </section>
    </AuthLayout>
  );
}
