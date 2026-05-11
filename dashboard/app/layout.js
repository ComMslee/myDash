import './globals.css';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { MockProvider } from './context/mock';
import GlobalHeader from './components/GlobalHeader';
import { readAuth } from '@/lib/auth-store';
import { COOKIE } from '@/lib/auth-helper';

export const metadata = {
  title: 'TeslaMate Dashboard',
  description: 'Tesla vehicle monitoring dashboard',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};

export default async function RootLayout({ children }) {
  const pathname = headers().get('x-pathname') || '/';
  const auth = await readAuth();
  const cookieToken = cookies().get(COOKIE)?.value;
  const ok = auth && cookieToken === auth.token;

  const isLogin = pathname === '/login';
  const isSetup = pathname === '/setup';

  if (!auth) {
    if (!isSetup) redirect('/setup');
  } else if (!ok) {
    if (!isLogin) redirect('/login');
  } else if (isLogin || isSetup) {
    redirect('/');
  }

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
        </MockProvider>
      </body>
    </html>
  );
}
