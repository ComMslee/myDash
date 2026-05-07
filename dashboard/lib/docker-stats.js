import http from 'node:http';

// Docker daemon API 호출 — /var/run/docker.sock 유닉스 소켓 (RO 마운트).
// 컨테이너별 CPU%/Memory 점유율 산출용.
const SOCKET = '/var/run/docker.sock';
const TIMEOUT_MS = 2000;

function dockerRequest(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: SOCKET, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`docker ${res.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('docker socket timeout')));
    req.end();
  });
}

// docker stats 응답에서 CPU% 산출. precpu 와 cpu_stats 의 delta / system delta * cores.
function calcCpuPct(s) {
  const cpuDelta = (s.cpu_stats?.cpu_usage?.total_usage ?? 0) - (s.precpu_stats?.cpu_usage?.total_usage ?? 0);
  const sysDelta = (s.cpu_stats?.system_cpu_usage ?? 0) - (s.precpu_stats?.system_cpu_usage ?? 0);
  const numCPUs = s.cpu_stats?.online_cpus || s.cpu_stats?.cpu_usage?.percpu_usage?.length || 1;
  if (sysDelta <= 0 || cpuDelta < 0) return 0;
  return (cpuDelta / sysDelta) * numCPUs * 100;
}

// 컨테이너 이름 → compose 서비스 매핑. compose project prefix(myDash_/mydash-) 제거.
function normalizeName(raw) {
  const n = (raw || '').replace(/^\//, '');
  // myDash-teslamate-1 / mydash_teslamate_1 → teslamate
  const m = n.match(/^[a-zA-Z0-9]+[-_](.+?)[-_]\d+$/);
  return m ? m[1] : n;
}

export async function getContainerStats() {
  try {
    const list = await dockerRequest('/containers/json');
    const stats = await Promise.all(list.map(async (c) => {
      const name = normalizeName(c.Names?.[0]);
      try {
        const s = await dockerRequest(`/containers/${c.Id}/stats?stream=false`);
        return {
          name,
          state: c.State,
          cpuPct: +calcCpuPct(s).toFixed(2),
          memUsage: s.memory_stats?.usage ?? null,
          memLimit: s.memory_stats?.limit ?? null,
        };
      } catch (e) {
        return { name, state: c.State, error: e.message };
      }
    }));
    return { ok: true, containers: stats };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
