import { Helmet } from '@dr.pogodin/react-helmet';
import { type ReactElement } from 'react';
import { ScrollRestoration } from 'react-router-dom';

/**
 * Root layout for IWILLBUILD Portal — fullscreen dashboard app.
 * No shared header/footer; each page manages its own layout.
 */
interface RootLayoutProps {
  children: ReactElement;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>IWILLBUILD Portal</title>
        <meta name="description" content="Internal operations portal for IWILLBUILD — manage jobs, crews, fleet, and more." />
      </Helmet>
      <ScrollRestoration />
      {children}
    </div>
  );
}
