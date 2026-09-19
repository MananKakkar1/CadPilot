'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, KeyRound, UserRound } from 'lucide-react';
import { Button } from '@/components/magicui/button';
import { MagicCard } from '@/components/magicui/magic-card';
import { ShineBorder } from '@/components/magicui/shine-border';
import { AnimatedGradientText } from '@/components/magicui/animated-gradient-text';

type Mode = 'sign-in' | 'sign-up';

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState(''); const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [pending, setPending] = useState(false);
  const isSignup = mode === 'sign-up';
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setPending(true); setError('');
    const response = await fetch(`/api/auth/${isSignup ? 'signup' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isSignup ? { email, username, password } : { email, password }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error ?? 'Unable to continue.'); setPending(false); return; }
    router.replace('/projects'); router.refresh();
  };
  return <main className="auth-page"><Link href="/" className="auth-brand"><span>✦</span> Agentic CAD</Link><MagicCard className="auth-card" gradientFrom="#4f46e5" gradientTo="#06b6d4"><ShineBorder shineColor={['#4f46e5', '#06b6d4', '#a855f7']} duration={12} /><div className="auth-card-content"><div className="auth-icon">{isSignup ? <UserRound /> : <KeyRound />}</div><p className="auth-kicker">{isSignup ? 'CREATE YOUR WORKSPACE' : 'WELCOME BACK'}</p><h1>{isSignup ? <>Build systems<br /><AnimatedGradientText colorFrom="#4f46e5" colorTo="#06b6d4">that stay editable.</AnimatedGradientText></> : <>Continue your<br /><AnimatedGradientText colorFrom="#4f46e5" colorTo="#06b6d4">design practice.</AnimatedGradientText></>}</h1><p className="auth-intro">{isSignup ? 'Store prompts, validated BREP revisions, exports, and published engineering projects in one place.' : 'Pick up your projects, revisions, build records, and export files.'}</p><form onSubmit={submit}><label>Email<input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label>{isSignup && <label>Username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="engineering_team" minLength={3} maxLength={20} pattern="[A-Za-z0-9_]{3,20}" title="Use 3–20 letters, numbers, or underscores" required /></label>}<label>Password<input autoComplete={isSignup ? 'new-password' : 'current-password'} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isSignup ? 'At least 8 characters' : 'Your password'} minLength={8} required /></label>{error && <p className="auth-error" role="alert">{error}</p>}<Button type="submit" disabled={pending}>{pending ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'} <ArrowRight /></Button></form><p className="auth-switch">{isSignup ? 'Already have an account?' : 'New to Agentic CAD?'} <Link href={isSignup ? '/sign-in' : '/sign-up'}>{isSignup ? 'Sign in' : 'Create an account'}</Link></p></div></MagicCard></main>;
}
