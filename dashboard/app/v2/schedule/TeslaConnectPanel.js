'use client';

import { useEffect, useState, useCallback } from 'react';

// Tesla Fleet API OAuth 연결 패널 — 설정 시트 안에서 사용.
// 상태 표시: 미연결 / 연결됨(만료시각). 버튼: 연결 / 재연결 / 해제 / 차량 정보.
export default function TeslaConnectPanel() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/tesla/oauth/status');
      if (r.ok) setStatus(await r.json());
    } catch {}
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const connect = () => {
    // 브라우저 전체를 Tesla 인증 페이지로 — Tesla 가 callback 으로 다시 돌려보냄.
    window.location.href = '/api/tesla/oauth/start';
  };

  const disconnect = async () => {
    if (!confirm('저장된 Tesla 토큰을 삭제할까요? 다시 연결하려면 OAuth 처음부터.')) return;
    setBusy(true);
    try {
      await fetch('/api/tesla/oauth/status', { method: 'DELETE' });
      await refresh();
    } finally { setBusy(false); }
  };

  const connected = status?.connected;
  const exp = status?.expires_at ? new Date(status.expires_at) : null;
  const scopes = (status?.scope || '').split(/\s+/).filter(Boolean);

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-3 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <p className="text-zinc-300 font-semibold">Tesla Fleet API</p>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
            connected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-700 text-zinc-400'
          }`}
        >
          {connected ? '연결됨' : '미연결'}
        </span>
      </div>

      {connected ? (
        <div className="space-y-1.5 text-zinc-400">
          {exp && (
            <p>
              <span className="text-zinc-500">access_token 만료:</span>{' '}
              <span className="text-zinc-300">{exp.toLocaleString('ko-KR')}</span>{' '}
              <span className="text-zinc-500">(자동 갱신)</span>
            </p>
          )}
          {scopes.length > 0 && (
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              scope: <span className="text-zinc-400">{scopes.join(', ')}</span>
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={connect}
              disabled={busy}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-50"
            >재연결</button>
            <button
              onClick={disconnect}
              disabled={busy}
              className="px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 disabled:opacity-50"
            >연결 해제</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-zinc-400">
          <p className="leading-relaxed">
            Tesla 계정으로 로그인하고 권한을 부여해 자동화 명령을 활성화합니다.
            <br />
            <span className="text-zinc-500">scope: openid offline_access user_data vehicle_device_data vehicle_location vehicle_cmds vehicle_charging_cmds</span>
          </p>
          <button
            onClick={connect}
            disabled={busy}
            className="w-full py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 font-semibold disabled:opacity-50"
          >Tesla 계정 연결</button>
          <p className="text-[10px] text-zinc-500 leading-relaxed pt-1">
            연결 후 Tesla 모바일 앱에서 <span className="text-zinc-300">tesla.com/_ak/liam-my-dash.duckdns.org</span> 링크로 Virtual Key 페어링 필요 (명령 발신용).
          </p>
        </div>
      )}
    </div>
  );
}
