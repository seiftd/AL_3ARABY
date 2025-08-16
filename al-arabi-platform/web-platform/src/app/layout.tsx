import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Amiri, Aref_Ruqaa } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import { ReactNode } from 'react';

import './globals.css';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { SocketProvider } from '@/providers/SocketProvider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const amiri = Amiri({
  subsets: ['arabic', 'latin'],
  variable: '--font-amiri',
  weight: ['400', '700'],
  display: 'swap',
});

const arefRuqaa = Aref_Ruqaa({
  subsets: ['arabic', 'latin'],
  variable: '--font-aref-ruqaa',
  weight: ['400', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    template: '%s | العرّبي - Al-Arabi',
    default: 'العرّبي - Al-Arabi | منصة التذاكر العربية',
  },
  description: 'منصة العرّبي لحجز التذاكر - اكتشف الأحداث واحجز تذاكرك بسهولة في الوطن العربي',
  keywords: [
    'تذاكر',
    'أحداث',
    'حفلات',
    'مؤتمرات',
    'العرّبي',
    'tickets',
    'events',
    'concerts',
    'conferences',
    'Al-Arabi'
  ],
  authors: [{ name: 'Al-Arabi Team' }],
  creator: 'Al-Arabi Platform',
  publisher: 'Al-Arabi',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://al-arabi.com'),
  alternates: {
    canonical: '/',
    languages: {
      'ar-SA': '/ar',
      'en-US': '/en',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'ar_SA',
    url: '/',
    title: 'العرّبي - Al-Arabi | منصة التذاكر العربية',
    description: 'منصة العرّبي لحجز التذاكر - اكتشف الأحداث واحجز تذاكرك بسهولة في الوطن العربي',
    siteName: 'Al-Arabi',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Al-Arabi Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'العرّبي - Al-Arabi | منصة التذاكر العربية',
    description: 'منصة العرّبي لحجز التذاكر - اكتشف الأحداث واحجز تذاكرك بسهولة في الوطن العربي',
    images: ['/og-image.jpg'],
    creator: '@alarabi_platform',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_VERIFICATION_ID,
  },
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/safari-pinned-tab.svg',
      },
    ],
  },
  manifest: '/site.webmanifest',
  category: 'technology',
};

interface RootLayoutProps {
  children: ReactNode;
  params: {
    locale: string;
  };
}

const locales = ['ar', 'en'];

export default async function RootLayout({
  children,
  params: { locale }
}: RootLayoutProps) {
  // Validate that the incoming `locale` parameter is valid
  if (!locales.includes(locale as any)) notFound();

  let messages;
  try {
    messages = (await import(`../messages/${locale}.json`)).default;
  } catch (error) {
    notFound();
  }

  const isRTL = locale === 'ar';

  return (
    <html 
      lang={locale} 
      dir={isRTL ? 'rtl' : 'ltr'}
      className={`${inter.variable} ${amiri.variable} ${arefRuqaa.variable}`}
    >
      <head>
        {/* Preconnect to external domains */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* DNS prefetch for better performance */}
        <link rel="dns-prefetch" href="//api.al-arabi.com" />
        <link rel="dns-prefetch" href="//cdn.al-arabi.com" />
        
        {/* Theme color for mobile browsers */}
        <meta name="theme-color" content="#0ea5e9" />
        <meta name="msapplication-TileColor" content="#0ea5e9" />
        
        {/* Apple specific meta tags */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="العرّبي" />
        
        {/* Microsoft specific meta tags */}
        <meta name="msapplication-config" content="/browserconfig.xml" />
        
        {/* Additional meta tags for better SEO */}
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <meta name="googlebot" content="index, follow" />
        <meta name="bingbot" content="index, follow" />
        
        {/* Structured data for better search results */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'Al-Arabi',
              url: process.env.NEXT_PUBLIC_APP_URL,
              description: 'منصة العرّبي لحجز التذاكر - اكتشف الأحداث واحجز تذاكرك بسهولة في الوطن العربي',
              inLanguage: [
                {
                  '@type': 'Language',
                  name: 'Arabic',
                  alternateName: 'ar'
                },
                {
                  '@type': 'Language', 
                  name: 'English',
                  alternateName: 'en'
                }
              ],
              publisher: {
                '@type': 'Organization',
                name: 'Al-Arabi',
                url: process.env.NEXT_PUBLIC_APP_URL,
                logo: {
                  '@type': 'ImageObject',
                  url: `${process.env.NEXT_PUBLIC_APP_URL}/logo.png`,
                  width: 512,
                  height: 512
                }
              }
            })
          }}
        />
      </head>
      
      <body className={`
        antialiased
        ${isRTL ? 'font-arabic' : 'font-english'}
        bg-white dark:bg-gray-900
        text-gray-900 dark:text-gray-100
        transition-colors duration-200
      `}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <QueryProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <AuthProvider>
                <SocketProvider>
                  <ToastProvider>
                    {/* Skip to main content link for accessibility */}
                    <a 
                      href="#main-content"
                      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-md focus:shadow-lg"
                    >
                      {isRTL ? 'انتقل إلى المحتوى الرئيسي' : 'Skip to main content'}
                    </a>
                    
                    {/* Main app content */}
                    <div id="app-root" className="min-h-screen flex flex-col">
                      {children}
                    </div>
                    
                    {/* Portal root for modals and overlays */}
                    <div id="portal-root" />
                    
                    {/* Loading indicator root */}
                    <div id="loading-root" />
                  </ToastProvider>
                </SocketProvider>
              </AuthProvider>
            </ThemeProvider>
          </QueryProvider>
        </NextIntlClientProvider>

        {/* Service Worker registration script */}
        {process.env.NODE_ENV === 'production' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if ('serviceWorker' in navigator) {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js').then(function(registration) {
                      console.log('SW registered: ', registration);
                    }).catch(function(registrationError) {
                      console.log('SW registration failed: ', registrationError);
                    });
                  });
                }
              `
            }}
          />
        )}

        {/* Google Analytics */}
        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', {
                    page_title: document.title,
                    page_location: window.location.href,
                  });
                `
              }}
            />
          </>
        )}
      </body>
    </html>
  );
}