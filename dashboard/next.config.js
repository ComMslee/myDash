/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
  serverExternalPackages: ['pg', 'pg-pool', 'pgpass', 'pg-connection-string'],
};
export default nextConfig;
