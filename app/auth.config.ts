import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import {
  isLocalDevAuthBypassEnabled,
  requestHost,
} from 'app/lib/auth/dev-bypass';

const publicRoutes = ['/login', '/register'];

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }: { auth: { user?: unknown } | null; request: NextRequest }) {
      let nextUrl = request.nextUrl;
      let isLoggedIn = !!auth?.user;
      let pathname = nextUrl.pathname;
      let isAuthRoute = pathname.startsWith('/api/auth');
      let isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route)) || isAuthRoute;

      if (isLocalDevAuthBypassEnabled(requestHost(request.headers))) {
        if (!isAuthRoute && publicRoutes.includes(pathname)) {
          return Response.redirect(new URL('/protected', nextUrl));
        }
        return true;
      }

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
