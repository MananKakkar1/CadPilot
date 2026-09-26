import { AuthForm } from '@/components/auth/auth-form';
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) { const params = await searchParams; return <AuthForm mode="sign-in" nextPath={params.next} resetSuccess={params.reset === 'success'} />; }
