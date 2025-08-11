// apps/web/next.config.ts
import type { NextConfig } from 'next';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const ROOT_ENV = path.resolve(__dirname, '../../.env');
if (fs.existsSync(ROOT_ENV)) {
  dotenv.config({ path: ROOT_ENV });
} else {
  console.warn(`[next.config.ts] Root .env not found at: ${ROOT_ENV}`);
}

const nextConfig: NextConfig = {
  reactStrictMode: true,

  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    WEB_ORIGIN: process.env.WEB_ORIGIN,
  },
};

export default nextConfig;
