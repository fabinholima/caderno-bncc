import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'UfaProva — Avaliações alinhadas à BNCC',
  description: 'Organize questões, prepare avaliações alinhadas à BNCC e gere provas prontas para imprimir.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    siteName: 'UfaProva',
    locale: 'pt_BR',
    type: 'website',
    title: 'UfaProva — Mais tempo para ensinar. E para você.',
    description: 'Organize questões, prepare avaliações alinhadas à BNCC e gere provas prontas para imprimir.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // As variáveis das fontes ficam no <html>, onde o globals.css aplica font-sans.
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
