/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Engine logic is covered by vitest; don't block builds on lint.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
