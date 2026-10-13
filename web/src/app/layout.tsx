import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Võ Lâm Idle',
  description: 'Game võ hiệp idle — tự đi, tự đánh, tự nhặt đồ, chơi offline 100%',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0e1412',
};

/* style.css giữ dạng file tĩnh trong public/ (không qua bundler) để url(ui/panel.png)
   tương đối trỏ đúng vào thư mục media như bản gốc. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <link rel="stylesheet" href="/fonts/ibm-plex-mono.css" />
        <link rel="stylesheet" href="/style.css" />
        {children}
      </body>
    </html>
  );
}
