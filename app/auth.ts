import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcrypt-ts';
import { getUser } from 'app/db';
import { authConfig } from 'app/auth.config';
import { env } from 'app/env';

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  secret: env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      async authorize({ email, password }: any) {
        let users = await getUser(email);
        if (users.length === 0) return null;
        let dbUser = users[0];
        let passwordsMatch = await compare(password, dbUser.password!);
        if (passwordsMatch) {
          return { id: String(dbUser.id), email: dbUser.email } as any;
        }
        return null;
      },
    }),
  ],
});
