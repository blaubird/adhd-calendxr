import Link from 'next/link';
import { Form } from 'app/form';
import { redirect } from 'next/navigation';
import { createUser, getUser } from 'app/db';
import { SubmitButton } from 'app/submit-button';

export default function Login() {
  async function register(formData: FormData) {
    'use server';
    let email = formData.get('email') as string;
    let password = formData.get('password') as string;
    let user = await getUser(email);

    if (user.length > 0) {
      return 'User already exists'; // TODO: Handle errors with useFormStatus
    } else {
      await createUser(email, password);
      redirect('/login');
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-sand text-slate-100 px-4">
      <div className="z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-800 shadow-soft bg-card">
        <div className="flex flex-col items-center justify-center space-y-3 border-b border-slate-800 bg-card px-4 py-6 pt-8 text-center sm:px-10">
          <h3 className="text-xl font-semibold text-white">Sign Up</h3>
          <p className="text-sm text-slate-400">
            Create an account with your email and password
          </p>
        </div>
        <Form action={register}>
          <SubmitButton>Sign Up</SubmitButton>
          <p className="text-center text-sm text-slate-400">
            {'Already have an account? '}
            <Link href="/login" className="font-semibold text-white">
              Sign in
            </Link>
            {' instead.'}
          </p>
        </Form>
      </div>
    </div>
  );
}
