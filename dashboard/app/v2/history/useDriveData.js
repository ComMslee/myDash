'use client';

import { useState, useEffect, useRef } from 'react';
import { MOCK_DATA } from '@/app/context/mock';
import { dbgLog } from '@/lib/dbg';

// 동시 요청 상한 헬퍼 — N개 워커가 cursor를 공유하며 items 소비
async function fetchInChunks(items, fn, concurrency = 6) {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try { results[i] = await fn(items[i], i); }
      catch { results[i] = null; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/**
 * 로드트립 페이지의 데이터 fetching + 상태를 단일 훅으로 격리.
 *
 * @param {object} args
 *   - isMock: boolean — Mock 토글
 *   - refreshSignal: number — MockProvider 새로고침 트리거
 *   - initialId: number|null — 진입 시 선택할 drive id
 *   - initialDate: string|null — 'YYYY-MM-DD' 진입 시 선택할 일자
 *   - driveDayStr: (drive) => 'YYYY-MM-DD' — 로컬 타임존 기준 날짜 키 변환
 *
 * @returns {object}
 *   drives, places, selectedDrive, setSelectedDrive,
 *   positions, setPositions,
 *   routeData, dayRoutes,
 *   dayMode, setDayMode,
 *   loadingDrives, loadingRoute, error
 */
export function useDriveData({ isMock, refreshSignal, initialId, initialDate, driveDayStr }) {
  const [drives, setDrives] = useState([]);
  const [selectedDrive, setSelectedDrive] = useState(null);
  const [positions, setPositions] = useState([]);
  const [places, setPlaces] = useState([]);
  const [routeData, setRouteData] = useState(null);
  const [loadingDrives, setLoadingDrives] = useState(true);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [error, setError] = useState(null);
  const [dayMode, setDayMode] = useState(initialDate || null); // 'YYYY-MM-DD' or null
  const [dayRoutes, setDayRoutes] = useState([]);
  const [monthMode, setMonthMode] = useState(null); // 'YYYY-MM' or null
  const [monthRoutes, setMonthRoutes] = useState([]);
  const abortRef = useRef(null);
  const dayAbortRef = useRef(null);
  const monthAbortRef = useRef(null);

  // 진입 쿼리(id/date)에 맞는 주행을 선택 — id > date > 첫 항목
  const pickPreselect = (list) => {
    if (initialId) {
      const found = list.find(d => d.id === initialId);
      if (found) return found;
    }
    if (initialDate) {
      const found = list.find(d => driveDayStr(d) === initialDate);
      if (found) return found;
    }
    return list[0];
  };

  // drives + places 초기 로드
  useEffect(() => {
    dbgLog(`[drives effect] initId=${initialId ?? 'null'} initDate=${initialDate ?? 'null'} isMock=${isMock} refresh=${refreshSignal}`);
    if (isMock) {
      const list = MOCK_DATA.drives.recent_drives;
      dbgLog(`[drives effect] mock branch list=${list.length}`);
      setDrives(list);
      setPlaces(MOCK_DATA.frequentPlaces);
      setLoadingDrives(false);
      setSelectedDrive(pickPreselect(list));
      return;
    }
    setLoadingDrives(true);
    setError(null);
    Promise.allSettled([
      fetch('/api/drives').then(r => r.json()),
      fetch('/api/frequent-places').then(r => r.json()),
    ]).then(([drivesResult, placesResult]) => {
      const drivesData = drivesResult.status === 'fulfilled' ? drivesResult.value : { recent_drives: [] };
      const placesData = placesResult.status === 'fulfilled' ? placesResult.value : { places: [] };
      if (drivesResult.status === 'rejected') setError('데이터를 불러오지 못했습니다.');
      const list = drivesData.recent_drives || [];
      const pre = list.length > 0 ? pickPreselect(list) : null;
      dbgLog(`[drives fetch] OK list=${list.length} preselect=${pre?.id ?? 'null'}`);
      setDrives(list);
      setPlaces(placesData.places || []);
      setLoadingDrives(false);
      if (pre) setSelectedDrive(pre);
    });
  }, [isMock, refreshSignal, initialId, initialDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // 단일 주행 경로 로드
  useEffect(() => {
    dbgLog(`[route effect] selDrive=${selectedDrive?.id ?? 'null'} dayMode=${dayMode ?? 'null'} monthMode=${monthMode ?? 'null'} isMock=${isMock}`);
    if (dayMode || monthMode) { dbgLog(`[route effect] EXIT dayMode/monthMode`); return; }
    if (!selectedDrive) { dbgLog(`[route effect] EXIT no selectedDrive`); return; }
    if (isMock) {
      dbgLog(`[route effect] mock branch`);
      setPositions(MOCK_DATA.routePositions);
      setRouteData({ positions: MOCK_DATA.routePositions, maxSpeedKmh: 127, speedBands: { jam: 12, slow: 35, flow: 28, fast: 25 } });
      return;
    }
    dbgLog(`[route effect] setLoadingRoute(true) → fetch driveId=${selectedDrive.id}`);
    setLoadingRoute(true);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const driveId = selectedDrive.id;

    // 5xx transient 에러 회복용 1회 retry. r.ok 체크해서 HTTP 에러를 throw 로 명시 처리.
    const fetchOnce = async () => {
      const r = await fetch(`/api/route-map?driveId=${driveId}`, { signal: controller.signal });
      dbgLog(`[route fetch] HTTP ${r.status} driveId=${driveId}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    };
    (async () => {
      let data;
      try {
        data = await fetchOnce();
      } catch (e1) {
        if (e1.name === 'AbortError' || controller.signal.aborted) {
          dbgLog(`[route fetch] ABORT driveId=${driveId}`);
          return;
        }
        dbgLog(`[route fetch] retry after ${e1.message}`);
        try {
          data = await fetchOnce();
        } catch (e2) {
          if (e2.name === 'AbortError' || controller.signal.aborted) return;
          dbgLog(`[route fetch] FAIL ${e2.message}`);
          setPositions([]);
          setRouteData(null);
          setLoadingRoute(false);
          return;
        }
      }
      if (controller.signal.aborted) { dbgLog(`[route fetch] ABORTED post-json driveId=${driveId}`); return; }
      const pos = data.positions || [];
      dbgLog(`[route fetch] OK driveId=${driveId} positions=${pos.length}`);
      setPositions(pos);
      setRouteData(data);
      setLoadingRoute(false);
    })();
    return () => { dbgLog(`[route effect] CLEANUP abort driveId=${driveId}`); controller.abort(); };
  }, [selectedDrive?.id, isMock, refreshSignal, dayMode, monthMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 일 모드 — 해당 일의 모든 주행 경로 병렬 로드
  useEffect(() => {
    if (!dayMode || isMock || drives.length === 0) { setDayRoutes([]); return; }
    // 하루 주행을 시간 순(ASC)으로 정렬 → 지도 번호 배지 1번 = 그날 첫 주행
    const dayDrives = drives
      .filter(d => driveDayStr(d) === dayMode)
      .slice()
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    if (dayDrives.length === 0) { setDayRoutes([]); return; }
    setLoadingRoute(true);
    if (dayAbortRef.current) dayAbortRef.current.abort();
    dayAbortRef.current = new AbortController();
    const palette = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#a855f7', '#84cc16', '#f43f5e'];
    fetchInChunks(dayDrives, (d, idx) =>
      fetch(`/api/route-map?driveId=${d.id}`, { signal: dayAbortRef.current.signal })
        .then(r => r.json())
        .then(data => ({
          positions: data.positions || [],
          color: palette[idx % palette.length],
          id: d.id,
          startDate: d.start_date,
        }))
        .catch(() => null)
    , 6).then(results => {
      const valid = results.filter(r => r && r.positions.length >= 2);
      setDayRoutes(valid);
      setLoadingRoute(false);
    });
    return () => { dayAbortRef.current?.abort(); };
  }, [dayMode, isMock, drives]); // eslint-disable-line react-hooks/exhaustive-deps

  // 월 모드 — 해당 월의 모든 주행 경로 병렬 로드
  useEffect(() => {
    if (!monthMode || isMock || drives.length === 0) { setMonthRoutes([]); return; }
    const monthDrives = drives
      .filter(d => driveDayStr(d).slice(0, 7) === monthMode)
      .slice()
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    if (monthDrives.length === 0) { setMonthRoutes([]); return; }
    setLoadingRoute(true);
    if (monthAbortRef.current) monthAbortRef.current.abort();
    monthAbortRef.current = new AbortController();
    const palette = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#a855f7', '#84cc16', '#f43f5e'];
    fetchInChunks(monthDrives, (d, idx) =>
      fetch(`/api/route-map?driveId=${d.id}&detail=light`, { signal: monthAbortRef.current.signal })
        .then(r => r.json())
        .then(data => ({
          positions: data.positions || [],
          color: palette[idx % palette.length],
          id: d.id,
          startDate: d.start_date,
        }))
        .catch(() => null)
    , 6).then(results => {
      const valid = results.filter(r => r && r.positions.length >= 2);
      setMonthRoutes(valid);
      setLoadingRoute(false);
    });
    return () => { monthAbortRef.current?.abort(); };
  }, [monthMode, isMock, drives]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    drives,
    places,
    selectedDrive, setSelectedDrive,
    positions, setPositions,
    routeData,
    dayMode, setDayMode,
    dayRoutes,
    monthMode, setMonthMode,
    monthRoutes,
    loadingDrives, loadingRoute,
    error,
  };
}
