import { Sparkline } from './Sparkline';

export function ServerStatusCard({ data, latencyMs, history }) {
  const fmtUptime = (sec) => {
    if (sec == null) return '—';
    if (sec < 60) return `${sec}초`;
    if (sec < 3600) return `${Math.floor(sec / 60)}분`;
    if (sec < 86400) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      return `${h}h${String(m).padStart(2, '0')}`;
    }
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    return `${d}일 ${h}h`;
  };
  const fmtMB = (b) => b == null ? '—' : `${(b / 1024 / 1024).toFixed(0)}MB`;
  const fmtGB = (b) => b == null ? '—' : `${(b / 1024 / 1024 / 1024).toFixed(1)}GB`;
  const fmtAgo = (iso) => {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return '미래?';
    if (ms < 60_000) return `${Math.floor(ms / 1000)}초 전`;
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 전`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h 전`;
    return `${Math.floor(ms / 86_400_000)}일 전`;
  };
  // 센서 데이터 freshness — 차량이 sleep 이면 수 시간 갭은 정상이라 임계 완화.
  // 12h 넘어가야 빨강 (실제 polling 문제 시그널).
  const freshColor = (iso) => {
    if (!iso) return 'text-zinc-500';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 30 * 60_000) return 'text-emerald-400';
    if (ms < 6 * 3600_000) return 'text-amber-400';
    if (ms < 12 * 3600_000) return 'text-orange-400';
    return 'text-rose-400';
  };
  // 사용자 활동 freshness (drives/charges) — 매일 운행 안 할 수도 있어 더 완화.
  const activityColor = (iso) => {
    if (!iso) return 'text-zinc-500';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 24 * 3600_000) return 'text-zinc-200';
    if (ms < 7 * 86400_000) return 'text-zinc-400';
    return 'text-zinc-500';
  };

  const skew = data.serverTime ? Date.now() - data.serverTime - (latencyMs || 0) / 2 : null;
  const skewColor = skew == null ? 'text-zinc-500'
    : Math.abs(skew) < 5_000  ? 'text-emerald-400'
    : Math.abs(skew) < 30_000 ? 'text-amber-400'
    : 'text-rose-400';

  const load = data.host?.loadavg || [];
  const loadColor = load[0] != null && data.host?.cpuCount
    ? (load[0] / data.host.cpuCount > 1 ? 'text-rose-400'
       : load[0] / data.host.cpuCount > 0.7 ? 'text-amber-400'
       : 'text-emerald-400')
    : 'text-zinc-300';

  // 메모리 사용% — MemAvailable 기반(정확). 폴백: MemFree.
  const memAvailable = data.host?.memAvailable ?? data.host?.memFree;
  const memUsedPct = data.host?.memTotal && memAvailable != null
    ? Math.round((1 - memAvailable / data.host.memTotal) * 100) : null;
  const memAvailPct = data.host?.memTotal && memAvailable != null
    ? Math.round((memAvailable / data.host.memTotal) * 100) : null;

  // 디스크 (루트)
  const disk = data.host?.disk;
  const diskUsedPct = disk?.total ? Math.round((1 - disk.available / disk.total) * 100) : null;

  // CPU 여유% — 100 - (loadavg / cpuCount × 100), 캡 0~100
  const cpuLoadPct = load[0] != null && data.host?.cpuCount
    ? Math.min(100, Math.max(0, Math.round((load[0] / data.host.cpuCount) * 100)))
    : null;
  const cpuFreePct = cpuLoadPct != null ? 100 - cpuLoadPct : null;

  // 여유% 색 (높을수록 좋음 — 색 반전)
  const freePctColor = (pct) => pct == null ? 'text-zinc-300'
    : pct > 50 ? 'text-emerald-400'
    : pct > 20 ? 'text-amber-400'
    : 'text-rose-400';

  // 스왑 사용% (있으면)
  const swapTotal = data.host?.swapTotal;
  const swapUsedPct = swapTotal && data.host?.swapFree != null
    ? Math.round((1 - data.host.swapFree / swapTotal) * 100) : null;

  // 24h 피크/한산 — pg 가 real 을 string 으로 줄 수 있어 Number 강제 + 시각 사전 포맷
  const dailyPeakCpuRaw = data.daily?.peak?.cpu;
  const dailyPeakCpu = dailyPeakCpuRaw != null ? Number(dailyPeakCpuRaw) : null;
  const dailyQuietCpuRaw = data.daily?.quiet?.cpu;
  const dailyQuietCpu = dailyQuietCpuRaw != null ? Number(dailyQuietCpuRaw) : null;
  const fmtClock = (raw) => {
    if (!raw) return null;
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch { return null; }
  };
  const dailyPeakTime = fmtClock(data.daily?.peak?.ts);
  const dailyQuietTime = fmtClock(data.daily?.quiet?.ts);

  // 컨테이너 stats — docker.sock 미마운트면 docker.ok = false
  const containers = data.docker?.ok ? (data.docker.containers || []) : [];
  const findContainer = (name) => containers.find(c => c.name === name);
  const tm = findContainer('teslamate');
  const dash = findContainer('dashboard');
  const tgHubC = findContainer('telegram-hub');

  // 메모리% 색
  const memPctColor = (pct) => pct == null ? 'text-zinc-300'
    : pct > 90 ? 'text-rose-400'
    : pct > 75 ? 'text-amber-400'
    : 'text-zinc-200';

  // 컨테이너 메모리% (limit 대비)
  const containerMemPct = (c) => c?.memUsage != null && c?.memLimit
    ? Math.round((c.memUsage / c.memLimit) * 100) : null;

  const tmMemPct = containerMemPct(tm);
  const dashMemPct = containerMemPct(dash);
  const tgHubMemPct = containerMemPct(tgHubC);

  // PostgreSQL 16.13 (Debian 16.13-1.pgdg13+1) on x86_64-... → "PostgreSQL 16.13"
  const dbVerShort = data.db?.version ? String(data.db.version).match(/PostgreSQL\s+[\d.]+/)?.[0] || '—' : null;
  const cpuModelShort = (data.host?.cpuModel || '').replace(/\s+/g, ' ').replace(/Intel\(R\)\s+|CPU\s*@.*/g, '').trim();

  // 미니 컴포넌트들
  const Row = ({ label, value, valClass = 'text-zinc-200', trail }) => (
    <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
      <span className="text-[10px] text-zinc-500 truncate">{label}</span>
      <span className={`font-semibold ${valClass} flex items-center gap-1 shrink-0`}>
        <span className="truncate">{value}</span>{trail}
      </span>
    </div>
  );
  const SectionHeader = ({ title }) => (
    <div className="text-[10px] font-bold tracking-wide text-zinc-400 truncate">{title}</div>
  );
  const Divider = () => <div className="border-t border-white/[0.04] my-1" />;
  // 10셀 dotmatrix — 채워진 점 = 사용%, 빈 점 = 여유%
  const DotGauge = ({ usedPct }) => {
    if (usedPct == null) return null;
    const filled = Math.min(10, Math.max(0, Math.round(usedPct / 10)));
    const color = usedPct > 80 ? 'text-rose-400'
                : usedPct > 50 ? 'text-amber-400'
                : 'text-emerald-400';
    return (
      <span className="font-mono text-[10px] tracking-tighter leading-none">
        <span className={color}>{'●'.repeat(filled)}</span>
        <span className="text-zinc-700">{'○'.repeat(10 - filled)}</span>
      </span>
    );
  };
  const GaugeRow = ({ label, usedPct, rightText, rightClass = 'text-zinc-200' }) => (
    <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
      <span className="text-[10px] text-zinc-500 truncate shrink-0">{label}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        <DotGauge usedPct={usedPct} />
        <span className={`font-semibold ${rightClass}`}>{rightText}</span>
      </span>
    </div>
  );

  // 컨테이너 메모리 표시 — usage MB + (limit% 작게)
  const fmtContainerMem = (c, pct) => {
    if (c?.memUsage == null) return '—';
    const usage = fmtMB(c.memUsage);
    return pct != null ? `${usage} (${pct}%)` : usage;
  };

  return (
    <div className="space-y-2">
      {/* 4그룹: 항상 1열 세로 스택 */}
      <div className="grid grid-cols-1 gap-2">

        {/* ─── 서버 (호스트) ─── */}
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-2.5 space-y-1.5 min-w-0">
          <SectionHeader title="서버 (호스트)" />
          <Row
            label={`CPU 부하 (1m / ${data.host?.cpuCount ?? '?'}코어)`}
            value={load[0] != null ? load[0].toFixed(2) : '—'}
            valClass={loadColor}
            trail={<Sparkline values={history?.map(h => h.hostCpu)} color="#f59e0b" />}
          />
          <Row
            label="메모리 (실 사용)"
            value={memUsedPct != null ? `${memUsedPct}%` : '—'}
            valClass={memPctColor(memUsedPct)}
            trail={<Sparkline values={history?.map(h => h.hostMemPct)} color="#3b82f6" />}
          />
          <Divider />
          <Row label="가동 시간 (호스트)" value={fmtUptime(data.host?.uptime)} />
          <Row label="시계 차이" value={skew == null ? '—'
            : `${skew >= 0 ? '+' : ''}${Math.abs(skew) >= 1000 ? `${(skew / 1000).toFixed(1)}s` : `${Math.round(skew)}ms`}`}
            valClass={skewColor} />
          <Row label="메모리 총량" value={fmtGB(data.host?.memTotal)} />
          <div className="text-[10px] text-zinc-500 pt-1 leading-snug">
            {data.host?.platform}/{data.host?.arch} · {data.host?.cpuCount}×{cpuModelShort && <span className="text-zinc-600"> {cpuModelShort.slice(0, 24)}</span>}
          </div>
        </div>

        {/* ─── 테슬라메이트 ─── */}
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-2.5 space-y-1.5 min-w-0">
          <SectionHeader title="테슬라메이트" />
          <Row
            label="CPU (컨테이너)"
            value={tm?.cpuPct != null ? `${tm.cpuPct.toFixed(1)}%`
              : !data.docker?.ok ? '미연결'
              : tm?.error ? 'stats 실패'
              : tm ? '—' : '없음'}
            valClass={tm?.cpuPct == null ? 'text-zinc-500' : memPctColor(tm.cpuPct)}
            trail={tm?.cpuPct != null && <Sparkline values={history?.map(h => h.tmCpu)} color="#f59e0b" />}
          />
          <Row
            label="메모리"
            value={fmtContainerMem(tm, tmMemPct)}
            valClass={memPctColor(tmMemPct)}
            trail={tm?.memUsage != null && <Sparkline values={history?.map(h => h.tmMemMB)} color="#3b82f6" />}
          />
          <Divider />
          <Row
            label="최신 위치"
            value={fmtAgo(data.db?.latestPosition)}
            valClass={freshColor(data.db?.latestPosition)}
          />
          <Row
            label="최근 주행"
            value={fmtAgo(data.db?.latestDrive)}
            valClass={activityColor(data.db?.latestDrive)}
          />
          <Row
            label="최근 충전"
            value={fmtAgo(data.db?.latestCharge)}
            valClass={activityColor(data.db?.latestCharge)}
          />
          <Row label="차량 수" value={data.db?.carCount ?? '—'} />
          <div className="text-[10px] text-zinc-500 pt-1 leading-snug truncate">
            {tm?.state ? <>state: <span className="text-zinc-400">{tm.state}</span></>
              : !data.docker?.ok ? <span className="text-rose-400/80">{(data.docker?.error || 'docker 미연결').slice(0, 40)}</span>
              : '—'}
            {tm?.error && <span className="text-rose-400/80 ml-1">· {String(tm.error).slice(0, 30)}</span>}
          </div>
        </div>

        {/* ─── 우리서비스 (대시보드) ─── */}
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-2.5 space-y-1.5 min-w-0">
          <SectionHeader title="우리서비스 (대시보드)" />
          <Row
            label={dash ? 'CPU (컨테이너)' : 'CPU (프로세스 누적)'}
            value={dash?.cpuPct != null ? `${dash.cpuPct.toFixed(1)}%`
              : `user ${data.process?.cpuUserSec ?? 0}s`}
            valClass={dash?.cpuPct == null ? 'text-zinc-300' : memPctColor(dash.cpuPct)}
            trail={dash?.cpuPct != null && <Sparkline values={history?.map(h => h.dashCpu)} color="#f59e0b" />}
          />
          <Row
            label="메모리 (RSS)"
            value={dash?.memUsage != null
              ? fmtContainerMem(dash, dashMemPct)
              : fmtMB(data.memory?.rss)}
            valClass={memPctColor(dashMemPct)}
            trail={dash?.memUsage != null && <Sparkline values={history?.map(h => h.dashMemMB)} color="#3b82f6" />}
          />
          <Divider />
          <Row label="가동 시간 (앱)" value={fmtUptime(data.uptimeSec)} />
          <Row
            label="DB 응답"
            value={data.db?.ok ? `${data.db.latencyMs}ms` : '실패'}
            valClass={data.db?.ok ? 'text-emerald-400' : 'text-rose-400'}
            trail={data.db?.ok && <Sparkline values={history?.map(h => h.dbMs)} color="#10b981" />}
          />
          {!data.db?.ok && data.db?.error && (
            <div className="text-[10px] text-rose-400/80 truncate" title={data.db.error}>
              {data.db.error}
            </div>
          )}
          <Row label="DB pool"
            value={data.db?.poolStats
              ? `t${data.db.poolStats.total} i${data.db.poolStats.idle} w${data.db.poolStats.waiting}`
              : '—'} />
          <Row label="힙 (Node)" value={fmtMB(data.memory?.heapUsed)} />
          <div className="text-[10px] text-zinc-500 pt-1 leading-snug truncate">
            node {data.node} · pid {data.process?.pid} · {data.env}
            {dbVerShort && <span className="text-zinc-600"> · {dbVerShort}</span>}
          </div>
        </div>

        {/* ─── 텔레그램 봇 ─── */}
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-2.5 space-y-1.5 min-w-0">
          <SectionHeader title="텔레그램 봇" />
          <Row
            label="상태"
            value={data.tgHub?.ok ? '정상' : (data.tgHub?.error ? String(data.tgHub.error).slice(0, 32) : '응답 없음')}
            valClass={data.tgHub?.ok ? 'text-emerald-400' : 'text-rose-400'}
          />
          <Row
            label="CPU (컨테이너)"
            value={tgHubC?.cpuPct != null ? `${tgHubC.cpuPct.toFixed(1)}%`
              : !data.docker?.ok ? '미연결'
              : tgHubC?.error ? 'stats 실패'
              : tgHubC ? '—' : '없음'}
            valClass={tgHubC?.cpuPct == null ? 'text-zinc-500' : memPctColor(tgHubC.cpuPct)}
          />
          <Row
            label="메모리"
            value={fmtContainerMem(tgHubC, tgHubMemPct)}
            valClass={memPctColor(tgHubMemPct)}
          />
          <Divider />
          <Row label="가동 시간 (hub)" value={fmtUptime(data.tgHub?.uptime_sec)} />
          <Row
            label="알림 baseline"
            value={data.tgHub?.state
              ? `c${data.tgHub.state.last_charge_start_id ?? '-'} d${data.tgHub.state.last_drive_end_id ?? '-'}`
              : '—'}
          />
          <Row
            label="명령 offset"
            value={data.tgHub?.state?.telegram_offset ?? '—'}
          />
          <div className="text-[10px] text-zinc-500 pt-1 leading-snug truncate">
            {tgHubC?.state ? <>state: <span className="text-zinc-400">{tgHubC.state}</span></>
              : !data.tgHub?.ok && data.tgHub?.error
                ? <span className="text-rose-400/80">{String(data.tgHub.error).slice(0, 60)}</span>
                : '—'}
          </div>
        </div>

        {/* ─── 서버 여유 (확장 capacity) ─── */}
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-2.5 space-y-1.5 min-w-0">
          <SectionHeader title="서버 여유" />
          <GaugeRow
            label="CPU 여유"
            usedPct={cpuLoadPct}
            rightText={cpuFreePct != null ? `${cpuFreePct}%` : '—'}
            rightClass={freePctColor(cpuFreePct)}
          />
          <GaugeRow
            label="메모리 여유"
            usedPct={memUsedPct}
            rightText={memAvailPct != null ? `${memAvailPct}%` : '—'}
            rightClass={freePctColor(memAvailPct)}
          />
          <Row
            label="가용 메모리"
            value={memAvailable != null ? fmtGB(memAvailable) : '—'}
            valClass="text-zinc-300"
          />
          <Divider />
          <GaugeRow
            label="디스크 여유"
            usedPct={diskUsedPct}
            rightText={disk?.total ? `${100 - (diskUsedPct ?? 100)}%` : '—'}
            rightClass={freePctColor(disk ? 100 - diskUsedPct : null)}
          />
          <Row
            label="디스크 가용"
            value={disk?.available != null ? fmtGB(disk.available) : '—'}
            valClass="text-zinc-300"
          />
          <Row
            label="디스크 총량"
            value={disk?.total != null ? fmtGB(disk.total) : '—'}
          />
          {swapTotal > 0 && (
            <GaugeRow
              label="스왑 사용"
              usedPct={swapUsedPct}
              rightText={`${swapUsedPct ?? 0}%`}
              rightClass={swapUsedPct != null && swapUsedPct > 30 ? 'text-amber-400' : 'text-zinc-400'}
            />
          )}
          {/* 24h 피크/한산 — DB 로그 기반. pg 가 real 을 string 으로 줄 수 있어 Number 강제. */}
          {dailyPeakCpu != null && (
            <>
              <Divider />
              <Row
                label="24h 피크 CPU"
                value={Number.isFinite(dailyPeakCpu) ? dailyPeakCpu.toFixed(2) : '—'}
                valClass="text-amber-400"
                trail={dailyPeakTime && (
                  <span className="text-[9px] text-zinc-500 font-normal">{dailyPeakTime}</span>
                )}
              />
              {dailyQuietCpu != null && (
                <Row
                  label="24h 한산 CPU"
                  value={Number.isFinite(dailyQuietCpu) ? dailyQuietCpu.toFixed(2) : '—'}
                  valClass="text-emerald-400/80"
                  trail={dailyQuietTime && (
                    <span className="text-[9px] text-zinc-500 font-normal">{dailyQuietTime}</span>
                  )}
                />
              )}
              {data.daily?.samples != null && (
                <div className="text-[9px] text-zinc-600 pt-0.5">
                  {Number(data.daily.samples)} 샘플 (5분 간격 로그)
                </div>
              )}
            </>
          )}
          <div className="text-[10px] text-zinc-500 pt-1 leading-snug">
            {(() => {
              const verdict =
                cpuFreePct != null && memAvailPct != null
                  ? (cpuFreePct > 50 && memAvailPct > 50 && (diskUsedPct == null || diskUsedPct < 80))
                    ? <span className="text-emerald-500/70">신규 서비스 추가 여유 있음</span>
                    : (cpuFreePct < 20 || memAvailPct < 20 || (diskUsedPct ?? 0) > 90)
                      ? <span className="text-rose-400/80">자원 압박 — 추가 비권장</span>
                      : <span className="text-amber-400/80">제한적 — 가벼운 서비스만</span>
                  : '—';
              return verdict;
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
