// apps/web/next.config.ts
import type { NextConfig } from 'next';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';


const LOCAL_ENV = path.resolve(process.cwd(), '.env');
if (fs.existsSync(LOCAL_ENV)) {
  dotenv.config({ path: LOCAL_ENV });
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_REPORT_BASE_URL: process.env.NEXT_PUBLIC_REPORT_BASE_URL,
    WEB_ORIGIN: process.env.WEB_ORIGIN,
  },
};

export default nextConfig;
