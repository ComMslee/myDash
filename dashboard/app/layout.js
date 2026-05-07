import './globals.css';
import { MockProvider } from './context/mock';
import GlobalHeader from './components/GlobalHeader';
import BottomNav from './components/BottomNav';

export const metadata = {
  title: 'TeslaMate Dashboard',
  description: 'Tesla vehicle monitoring dashboard',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <meta name="theme-color" content="#0f0f0f" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="bg-[#0f0f0f] text-white min-h-screen pb-20">
        <MockProvider>
          <GlobalHeader />
          {children}
          <BottomNav />
        </MockProvider>
      </body>
    </html>
  );
}
