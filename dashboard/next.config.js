/** @type {import('next').NextConfig} */

// /v2 prefix 제거 — 파일은 /app/v2/* 그대로, URL 만 깨끗하게:
// 1) redirect: 기존/내부 /v2/* 링크가 클릭되면 영구 리디렉트로 깨끗한 URL 로
// 2) rewrite : 새 깨끗한 URL 로 들어온 요청을 내부적으로 /v2/* 파일에 매핑
// 새 v2 서브라우트 추가 시 V2_SUBROUTES 에만 추가.
const V2_SUBROUTES = ['drives', 'history', 'battery', 'chargers', 'tg', 'dev'];

const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
  serverExternalPackages: ['pg', 'pg-pool', 'pgpass', 'pg-connection-string'],

  async redirects() {
    return [
      { source: '/v2', destination: '/', permanent: true },
      { source: '/v2/:path*', destination: '/:path*', permanent: true },
    ];
  },

  async rewrites() {
    return [
      ...V2_SUBROUTES.map(r => ({ source: `/${r}`, destination: `/v2/${r}` })),
      ...V2_SUBROUTES.map(r => ({ source: `/${r}/:path*`, destination: `/v2/${r}/:path*` })),
    ];
  },
};

export default nextConfig;
