import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from '@/src/components/theme-provider';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-jakarta',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  title: 'Gyan Vatika Library — Self-Study Center in Chota Gamaria',
  description:
    'Smart Library & Self-Study Center Management System for Gyan Vatika Library, Sunful Complex Service Road, Chota Gamaria, Jharkhand.',
  openGraph: {
    title: 'Gyan Vatika Library — Self-Study Center in Chota Gamaria',
    description:
      'Quiet partitioned study desks, curated books, shift-wise seat reservations, and member portal in Chota Gamaria.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gyan Vatika Library — Self-Study Center in Chota Gamaria',
    description:
      'Explore reading room photos, live shift availability, plans, and seat requests at Gyan Vatika Library.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${plusJakarta.variable} ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body
        className="min-h-screen bg-[#FAFAFA] text-[#09090B] dark:bg-[#09090B] dark:text-zinc-100 antialiased selection:bg-emerald-500/20 selection:text-emerald-300"
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
