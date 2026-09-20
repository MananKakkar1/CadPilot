import { AuthForm } from '@/components/auth/auth-form';
export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) { const params = await searchParams; return <AuthForm mode="sign-up" nextPath={params.next} />; }
