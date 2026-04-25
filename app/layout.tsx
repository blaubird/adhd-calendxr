import './globals.css';

import { GeistSans } from 'geist/font/sans';

const title = 'Calendxr — monthly calendar brain';
const description =
  'Private ADHD-friendly calendar with monthly view, AI drafts, and unified item model.';

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
    <html lang="en">
      <body className={`${GeistSans.variable}`}>{children}</body>
    </html>
  );
}
