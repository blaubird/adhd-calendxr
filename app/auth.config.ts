import { NextAuthConfig } from 'next-auth';

const publicRoutes = ['/login', '/register'];

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
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
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
