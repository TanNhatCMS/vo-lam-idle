import type { NextConfig } from 'next';

/* Static export: `next build` ghi toàn bộ site vào out/ — chép thẳng vào game/ cho
   gói OTA Android (WebViewAssetLoader phục vụ tại root domain) hoặc hosting bất kỳ.
   Lưu ý: asset path tuyệt đối /_next/... — deploy phải ở domain root, không phải sub-path. */
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
};

export default nextConfig;
