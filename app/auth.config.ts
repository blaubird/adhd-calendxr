import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';

const publicRoutes = ['/login', '/register'];

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }: { auth: { user?: unknown } | null; request: NextRequest }) {
      let isLoggedIn = !!auth?.user;
      let pathname = nextUrl.pathname;
      let isAuthRoute = pathname.startsWith('/api/auth');
      let isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route)) || isAuthRoute;

      if (!isLoggedIn && !isPublicRoute) {
        return false;
      }

      if (isLoggedIn && publicRoutes.includes(pathname)) {
        return Response.redirect(new URL('/protected', nextUrl));
      }

      return true;
    },
    async session({ session, token }: { session: Session; token: { sub?: string } }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};
