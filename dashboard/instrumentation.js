// Next.js instrumentation — nodejs 런타임에서만 warm 루프 등록.
// edge 런타임에서는 pg/fs 의존성을 끌지 않도록 동적 분리.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  await import('./instrumentation-node.js');
}
