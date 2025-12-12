import './globals.css';

import { GeistSans } from 'geist/font/sans';

const title = 'Calendxr — calm 7-day board';
const description =
  'Private ADHD-friendly calendar/task board with auth, voice capture drafts, and a simple 7-day view.';

export const metadata = {
  title,
  description,
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
  metadataBase: new URL('https://calendar.luminiteq.eu'),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-sand text-slate-900">
      <body className={GeistSans.variable}>{children}</body>
    </html>
  );
}
