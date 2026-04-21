'use client';

import { useState, useEffect, useRef } from 'react';
import { MOCK_DATA } from '../context/mock';

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
  const [pinnedPlaces, setPinnedPlaces] = useState([]);
  const [routeData, setRouteData] = useState(null);
  const [loadingDrives, setLoadingDrives] = useState(true);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [error, setError] = useState(null);
  const [dayMode, setDayMode] = useState(initialDate || null); // 'YYYY-MM-DD' or null
  const [dayRoutes, setDayRoutes] = useState([]);
  const abortRef = useRef(null);
  const dayAbortRef = useRef(null);

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
    if (isMock) {
      const list = MOCK_DATA.drives.recent_drives;
      setDrives(list);
      setPlaces(MOCK_DATA.frequentPlaces);
      setPinnedPlaces([]);
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
      const placesData = placesResult.status === 'fulfilled' ? placesResult.value : { places: [], pinned: [] };
      if (drivesResult.status === 'rejected') setError('데이터를 불러오지 못했습니다.');
      const list = drivesData.recent_drives || [];
      setDrives(list);
      setPlaces(placesData.places || []);
      setPinnedPlaces(placesData.pinned || []);
      setLoadingDrives(false);
      if (list.length > 0) {
        setSelectedDrive(pickPreselect(list));
      }
    });
  }, [isMock, refreshSignal, initialId, initialDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // 단일 주행 경로 로드
  useEffect(() => {
    if (dayMode) return; // 일 모드에서는 단일 경로 미로딩
    if (!selectedDrive) return;
    if (isMock) {
      setPositions(MOCK_DATA.routePositions);
      setRouteData({ positions: MOCK_DATA.routePositions, maxSpeedKmh: 127, speedBands: { jam: 12, slow: 35, flow: 28, fast: 25 } });
      return;
    }
    setLoadingRoute(true);
    setPositions([]);
    setRouteData(null);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    fetch(`/api/route-map?driveId=${selectedDrive.id}`, { signal: abortRef.current.signal })
      .then(r => r.json())
      .then(data => {
        setPositions(data.positions || []);
        setRouteData(data);
        setLoadingRoute(false);
      })
      .catch(e => {
        if (e.name !== 'AbortError') {
          setPositions([]);
          setRouteData(null);
          setLoadingRoute(false);
        }
      });
  }, [selectedDrive?.id, isMock, refreshSignal, dayMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
    Promise.all(
      dayDrives.map((d, idx) =>
        fetch(`/api/route-map?driveId=${d.id}`, { signal: dayAbortRef.current.signal })
          .then(r => r.json())
          .then(data => ({
            positions: data.positions || [],
            color: palette[idx % palette.length],
            id: d.id,
          }))
          .catch(() => null)
      )
    ).then(results => {
      const valid = results.filter(r => r && r.positions.length >= 2);
      setDayRoutes(valid);
      setLoadingRoute(false);
    });
  }, [dayMode, isMock, drives]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    drives,
    places,
    pinnedPlaces,
    selectedDrive, setSelectedDrive,
    positions, setPositions,
    routeData,
    dayMode, setDayMode,
    dayRoutes,
    loadingDrives, loadingRoute,
    error,
  };
}
