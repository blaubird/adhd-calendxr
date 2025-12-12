import Link from 'next/link';
import { Form } from 'app/form';
import { signIn } from 'app/auth';
import { SubmitButton } from 'app/submit-button';

export default function Login() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-sand text-slate-100 px-4">
      <div className="z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-800 shadow-soft bg-card">
        <div className="flex flex-col items-center justify-center space-y-3 border-b border-slate-800 bg-card px-4 py-6 pt-8 text-center sm:px-10">
          <h3 className="text-xl font-semibold text-white">Sign In</h3>
          <p className="text-sm text-slate-400">
            Use your email and password to sign in
          </p>
        </div>
        <Form
          action={async (formData: FormData) => {
            'use server';
            await signIn('credentials', {
              redirectTo: '/protected',
              email: formData.get('email') as string,
              password: formData.get('password') as string,
            });
          }}
        >
          <SubmitButton>Sign in</SubmitButton>
          <p className="text-center text-sm text-slate-400">
            {"Don't have an account? "}
            <Link href="/register" className="font-semibold text-white">
              Sign up
            </Link>
            {' for free.'}
          </p>
        </Form>
      </div>
    </div>
  );
}
