'use client';

import { useMemo } from 'react';
import { kstDateStr, splitByKstMidnight } from '@/lib/kst';

/**
 * 대기 드레인 레코드 + 충전 세션을 KST 자정 기준으로 분할한 뒤
 * 일자별로 그룹화하여 역순 정렬된 배열과 요약 통계를 반환한다.
 *
 * @param {Array} records - idle_start/idle_end/soc_start/soc_drop/next_type 필드
 * @param {Array} chargingSessions - start/end/soc_start/soc_end/soc_added
 * @returns {object} { grouped, chargingByDay, stats }
 *   - grouped: [{ key: 'YYYY-MM-DD', items: [...] }, ...] 일자 역순
 *   - chargingByDay: { 'YYYY-MM-DD': [segment...] }
 *   - stats: { avgDrainPerDay, avgIdleHours, totalRecords }
 */
export function useIdleDrainDays(records, chargingSessions = []) {
  return useMemo(() => {
    if (!records || records.length === 0) {
      return { grouped: [], chargingByDay: {}, stats: null };
    }

    // 자정(KST) 넘어가는 idle 세션은 각 날짜로 분할
    const expandedRecords = [];
    records.forEach(r => {
      const startMs = new Date(r.idle_start).getTime();
      const endMs = r.idle_end ? new Date(r.idle_end).getTime() : Date.now();
      if (endMs <= startMs) return;
      const totalMs = endMs - startMs;
      const totalDrop = r.soc_drop || 0;
      const climateSpansAll = Array.isArray(r.climate_spans) ? r.climate_spans : [];
      const onlineSpansAll = Array.isArray(r.online_spans) ? r.online_spans : [];
      const clipSpans = (list, segStart, segEnd) => list
        .map(sp => ({ s: Math.max(sp.s, segStart), e: Math.min(sp.e, segEnd) }))
        .filter(sp => sp.e > sp.s);
      const sumSpansMs = (list) => list.reduce((t, sp) => t + (sp.e - sp.s), 0);
      for (const seg of splitByKstMidnight(startMs, endMs)) {
        const segMs = seg.endMs - seg.startMs;
        const segRatio = segMs / totalMs;
        const segDrop = Math.round(totalDrop * segRatio * 10) / 10;
        const segClimateSpans = clipSpans(climateSpansAll, seg.startMs, seg.endMs);
        const segOnlineSpans = clipSpans(onlineSpansAll, seg.startMs, seg.endMs);
        const segClimate = Math.round(sumSpansMs(segClimateSpans) / 60000 * 10) / 10;
        const segOnline = Math.round(sumSpansMs(segOnlineSpans) / 60000 * 10) / 10;
        const socStart = r.soc_start != null ? r.soc_start - totalDrop * ((seg.startMs - startMs) / totalMs) : null;
        const socEnd = r.soc_start != null ? r.soc_start - totalDrop * ((seg.endMs - startMs) / totalMs) : null;
        expandedRecords.push({
          idle_start: new Date(seg.startMs).toISOString(),
          idle_end: new Date(seg.endMs).toISOString(),
          idle_hours: segMs / 3600000,
          soc_drop: segDrop,
          climate_minutes: segClimate,
          climate_spans: segClimateSpans,
          online_minutes: segOnline,
          online_spans: segOnlineSpans,
          soc_start: socStart != null ? Math.round(socStart * 10) / 10 : null,
          soc_end: socEnd != null ? Math.round(socEnd * 10) / 10 : null,
          next_type: r.next_type,
        });
      }
    });

    // 충전 세션도 자정 기준 분할 후 KST 일자별 그룹화
    const chargingByDay = {};
    chargingSessions.forEach(c => {
      const startMs = new Date(c.start).getTime();
      const endMs = c.end ? new Date(c.end).getTime() : Date.now();
      if (endMs <= startMs) return;
      for (const seg of splitByKstMidnight(startMs, endMs)) {
        if (!chargingByDay[seg.kstDay]) chargingByDay[seg.kstDay] = [];
        chargingByDay[seg.kstDay].push({
          start: new Date(seg.startMs).toISOString(),
          end: new Date(seg.endMs).toISOString(),
          hours: (seg.endMs - seg.startMs) / 3600000,
          soc_start: c.soc_start,
          soc_end: c.soc_end,
          soc_added: c.soc_added,
        });
      }
    });

    // 요약 통계 (원본 records 기준 — 분할 전)
    const totalIdleHours = records.reduce((s, r) => s + r.idle_hours, 0);
    const totalDrop = records.reduce((s, r) => s + r.soc_drop, 0);
    const avgDrainPerDay = totalIdleHours > 0 ? (totalDrop / totalIdleHours * 24).toFixed(1) : '0';
    const avgIdleHours = records.length > 0 ? totalIdleHours / records.length : 0;

    // 일자별 그룹 — idle 기록 + 충전만 있는 날 포함
    const seen = {};
    expandedRecords.forEach(r => {
      const key = kstDateStr(r.idle_start);
      if (!seen[key]) seen[key] = [];
      seen[key].push(r);
    });
    Object.keys(chargingByDay).forEach(k => { if (!seen[k]) seen[k] = []; });
    // 각 일자 내 idle_start 역순
    Object.values(seen).forEach(items =>
      items.sort((a, b) => new Date(b.idle_start) - new Date(a.idle_start))
    );
    const grouped = Object.keys(seen)
      .sort((a, b) => b.localeCompare(a))
      .map(key => ({ key, items: seen[key] }));

    return {
      grouped,
      chargingByDay,
      stats: {
        avgDrainPerDay,
        avgIdleHours,
        totalRecords: records.length,
      },
    };
  }, [records, chargingSessions]);
}
