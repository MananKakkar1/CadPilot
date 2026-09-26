'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, KeyRound, UserRound } from 'lucide-react';
import { Input } from '@/components/magicui/input';
import { AuthLayout } from './auth-layout';
import { Button } from '@/components/magicui/button';

type Mode = 'sign-in' | 'sign-up';

export function AuthForm({ mode, nextPath, resetSuccess }: { mode: Mode; nextPath?: string; resetSuccess?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(''); const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [pending, setPending] = useState(false); const [showPassword, setShowPassword] = useState(false);
  const isSignup = mode === 'sign-up';
  const nextQuery = nextPath?.startsWith('/') ? `?next=${encodeURIComponent(nextPath)}` : '';
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/auth/${isSignup ? 'signup' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isSignup ? { email, username, password } : { email, password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error ?? 'Unable to continue.'); setPending(false); return; }
      router.replace(nextPath?.startsWith('/') ? nextPath : '/projects');
      router.refresh();
    } catch {
      setError('Connection failed — check your network and try again.');
      setPending(false);
    }
  };
  return <AuthLayout><section className="auth-card"><div className="auth-card-content"><div className="auth-icon">{isSignup ? <UserRound /> : <KeyRound />}</div><p className="auth-kicker">{isSignup ? 'START DESIGNING' : 'YOUR CADPILOT ACCOUNT'}</p><h1>{isSignup ? 'Create your account.' : 'Welcome back.'}</h1><p className="auth-intro">{isSignup ? 'Store prompts, validated BREP revisions, exports, and published engineering projects in one place.' : 'Pick up your projects, revisions, build records, and export files.'}</p>{!isSignup && resetSuccess && <p className="auth-success">Your password was reset. Sign in with your new password.</p>}<form onSubmit={submit}><label htmlFor="auth-email">Email<Input id="auth-email" autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label>{isSignup && <label htmlFor="auth-username">Username<Input id="auth-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="engineering-team" minLength={3} maxLength={20} required /></label>}<label htmlFor="auth-password">Password<span className="auth-password-field"><Input id="auth-password" autoComplete={isSignup ? 'new-password' : 'current-password'} type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isSignup ? 'At least 8 characters' : 'Your password'} minLength={8} required /><Button variant="ghost" size="icon" type="button" className="auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</Button></span></label>{!isSignup && <Link href="/forgot-password" className="auth-forgot-link">Forgot password?</Link>}{error && <p className="auth-error" role="alert">{error}</p>}<Button type="submit" disabled={pending}>{pending ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'} <ArrowRight /></Button></form><p className="auth-switch">{isSignup ? 'Already have an account?' : 'New to CadPilot?'} <Link href={`${isSignup ? '/sign-in' : '/sign-up'}${nextQuery}`}>{isSignup ? 'Sign in' : 'Create an account'}</Link></p></div></section></AuthLayout>;
}
