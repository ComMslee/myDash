'use client';

import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const now = () => Date.now();

export const MOCK_DATA = {
  car: {
    name: 'Model 3', battery_level: 72, est_battery_range: 287, state: 'parked',
    last_seen: '2026-04-14T14:25:00.000Z',
    last_charge: {
      end_date: new Date(now() - 6 * 3600 * 1000).toISOString(),
      soc_start: 58, soc_end: 82, location: '집',
    },
    estimated_charge: {
      date: new Date(now() + 5 * 86400 * 1000).toISOString(),
      days_until: 5, threshold_pct: 20,
    },
  },
  chargingStatus: {
    charging: true, battery_level: 72, charge_limit_soc: 90, charger_power: 11,
    time_to_full_charge: 1.5, charge_energy_added: 18.4,
    start_battery_level: 58,
    start_date: new Date(now() - 60 * 60 * 1000).toISOString(),
  },
  drives: {
    today_distance: 38.4, today_energy_kwh: 5.8,
    week_distance: 214.7, week_energy_kwh: 32.2,
    prev_week_distance: 187.3, prev_week_energy_kwh: 28.1,
    month_distance: 782.4, month_energy_kwh: 117.4,
    recent_drives: [
      { id: 1, start_date: new Date(now() - 2*3600*1000).toISOString(), end_date: new Date(now() - 1*3600*1000).toISOString(), distance: 21.3, duration_min: 28, start_address: '서울 강남구 테헤란로 152', end_address: '서울 송파구 올림픽로 300', start_rated_range_km: 280, end_rated_range_km: 256, start_battery_level: 53, end_battery_level: 49 },
      { id: 2, start_date: new Date(now() - 8*3600*1000).toISOString(), end_date: new Date(now() - 7*3600*1000).toISOString(), distance: 17.1, duration_min: 22, start_address: '서울 송파구 올림픽로 300', end_address: '경기 성남시 분당구 판교로 256', start_rated_range_km: 256, end_rated_range_km: 239, start_battery_level: 49, end_battery_level: 45 },
      { id: 3, start_date: new Date(now() - 26*3600*1000).toISOString(), end_date: new Date(now() - 25*3600*1000).toISOString(), distance: 44.8, duration_min: 51, start_address: '경기 성남시 분당구 판교로 256', end_address: '서울 강남구 테헤란로 152', start_rated_range_km: 320, end_rated_range_km: 272, start_battery_level: 61, end_battery_level: 52 },
      { id: 4, start_date: new Date(now() - 50*3600*1000).toISOString(), end_date: new Date(now() - 49*3600*1000).toISOString(), distance: 9.2, duration_min: 14, start_address: '서울 강남구 학동로 407', end_address: '서울 강남구 테헤란로 152', start_rated_range_km: 272, end_rated_range_km: 263, start_battery_level: 52, end_battery_level: 50 },
      { id: 5, start_date: new Date(now() - 74*3600*1000).toISOString(), end_date: new Date(now() - 73*3600*1000).toISOString(), distance: 62.5, duration_min: 68, start_address: '서울 강남구 테헤란로 152', end_address: '인천 연수구 송도국제대로 68', start_rated_range_km: 350, end_rated_range_km: 287, start_battery_level: 67, end_battery_level: 55 },
    ],
  },
  charges: {
    history: [
      { id: 1, start_date: new Date(now() - 6*3600*1000).toISOString(), duration_min: 95, charge_energy_added: 18.4 },
      { id: 2, start_date: new Date(now() - 30*3600*1000).toISOString(), duration_min: 120, charge_energy_added: 23.1 },
      { id: 3, start_date: new Date(now() - 54*3600*1000).toISOString(), duration_min: 60, charge_energy_added: 11.6 },
      { id: 4, start_date: new Date(now() - 78*3600*1000).toISOString(), duration_min: 140, charge_energy_added: 28.9 },
    ],
  },
  monthlyHistory: {
    months: [
      { month_label: '2026년 4월', year: 2026, month: 4, drive_count: 31, total_distance_km: 782.4, total_duration_min: 1240, charge_count: 9, total_energy_kwh: 124.6 },
      { month_label: '2026년 3월', year: 2026, month: 3, drive_count: 28, total_distance_km: 695.2, total_duration_min: 1080, charge_count: 8, total_energy_kwh: 108.3 },
      { month_label: '2026년 2월', year: 2026, month: 2, drive_count: 24, total_distance_km: 612.8, total_duration_min: 940, charge_count: 7, total_energy_kwh: 96.4 },
      { month_label: '2026년 1월', year: 2026, month: 1, drive_count: 26, total_distance_km: 643.1, total_duration_min: 1020, charge_count: 8, total_energy_kwh: 102.1 },
      { month_label: '2025년 12월', year: 2025, month: 12, drive_count: 30, total_distance_km: 748.6, total_duration_min: 1180, charge_count: 9, total_energy_kwh: 118.9 },
      { month_label: '2025년 11월', year: 2025, month: 11, drive_count: 22, total_distance_km: 534.3, total_duration_min: 860, charge_count: 6, total_energy_kwh: 84.7 },
      { month_label: '2025년 10월', year: 2025, month: 10, drive_count: 25, total_distance_km: 614.7, total_duration_min: 980, charge_count: 7, total_energy_kwh: 97.5 },
      { month_label: '2025년 9월', year: 2025, month: 9, drive_count: 27, total_distance_km: 668.9, total_duration_min: 1060, charge_count: 8, total_energy_kwh: 106.2 },
    ],
  },
  insights: {
    current: {
      distance: 782.4, drive_count: 31, duration_min: 1240,
      total_kwh: 124.6, charge_count: 9, avg_kwh: 13.8,
      home_charges: 7, other_charges: 2,
      max_distance: 62.5, max_duration: 68, max_speed: 118,
      efficiency_wh_km: 152,
    },
    previous: {
      distance: 695.2, drive_count: 28, total_kwh: 108.3,
      charge_count: 8, efficiency_wh_km: 159,
    },
    sixMonth: {
      distance: 4016.4,
      drive_count: 161,
      duration_min: 6320,
      total_kwh: 635.0,
      charge_count: 47,
      avg_kwh: 13.5,
      home_charges: 35,
      other_charges: 12,
      max_distance: 62.5,
      max_duration: 68,
      max_speed: 118,
      efficiency_wh_km: 152,
    },
    monthlyBreakdown: [
      { year: 2025, month: 11, distance: 534.3, drive_count: 22, total_kwh: 84.7, charge_count: 6 },
      { year: 2025, month: 12, distance: 748.6, drive_count: 30, total_kwh: 118.9, charge_count: 9 },
      { year: 2026, month: 1,  distance: 643.1, drive_count: 26, total_kwh: 102.1, charge_count: 8 },
      { year: 2026, month: 2,  distance: 612.8, drive_count: 24, total_kwh: 96.4,  charge_count: 7 },
      { year: 2026, month: 3,  distance: 695.2, drive_count: 28, total_kwh: 108.3, charge_count: 8 },
      { year: 2026, month: 4,  distance: 782.4, drive_count: 31, total_kwh: 124.6, charge_count: 9 },
    ],
    hourly: Array.from({ length: 24 }, (_, h) => {
      const count = h === 8 ? 6 : h === 9 ? 5 : h === 18 ? 7 : h === 19 ? 5 : h === 12 ? 3 : h === 14 ? 2 : h === 22 ? 2 : h >= 6 && h <= 21 ? 1 : 0;
      return { hour: h, count, distance: count * 8.5 };
    }),
    weekday: [
      { dow: 0, count: 2, distance: 45 },
      { dow: 1, count: 6, distance: 128 },
      { dow: 2, count: 7, distance: 142 },
      { dow: 3, count: 5, distance: 118 },
      { dow: 4, count: 6, distance: 134 },
      { dow: 5, count: 4, distance: 96 },
      { dow: 6, count: 1, distance: 22 },
    ],
    charge_hourly: Array.from({ length: 24 }, (_, h) => {
      const count = h === 22 ? 3 : h === 23 ? 2 : h === 0 ? 2 : h === 1 ? 1 : h === 2 ? 1 : h === 13 ? 1 : h === 14 ? 1 : 0;
      return { hour: h, count, kwh: count * 14.2 };
    }),
    charge_weekday: [
      { dow: 0, count: 2, kwh: 32.4 },
      { dow: 1, count: 1, kwh: 18.4 },
      { dow: 2, count: 1, kwh: 11.6 },
      { dow: 3, count: 2, kwh: 28.9 },
      { dow: 4, count: 1, kwh: 23.1 },
      { dow: 5, count: 1, kwh: 18.4 },
      { dow: 6, count: 1, kwh: 11.6 },
    ],
  },
  frequentPlaces: [
    { id: 1, label: '서울 강남구 테헤란로 152', city: '서울 강남구', visit_count: 24 },
    { id: 2, label: '서울 송파구 올림픽로 300', city: '서울 송파구', visit_count: 17 },
    { id: 3, label: '경기 성남시 분당구 판교로 256', city: '경기 성남시', visit_count: 12 },
    { id: 4, label: '인천 연수구 송도국제대로 68', city: '인천 연수구', visit_count: 8 },
  ],
  routePositions: [
    { lat: 37.5012, lng: 127.0396 }, { lat: 37.4980, lng: 127.0421 },
    { lat: 37.4950, lng: 127.0480 }, { lat: 37.4923, lng: 127.0551 },
    { lat: 37.4906, lng: 127.0618 }, { lat: 37.4891, lng: 127.0700 },
    { lat: 37.4875, lng: 127.0780 },
  ],
};

const MockContext = createContext({
  isMock: false,
  toggleMock: () => {},
  isMockCharging: false,
  toggleMockCharging: () => {},
  refreshSignal: 0,
  triggerRefresh: () => {},
  lastRefresh: null,
  setLastRefresh: () => {},
  mockData: MOCK_DATA,
});

export function MockProvider({ children }) {
  const [isMock, setIsMock] = useState(false);
  const [isMockCharging, setIsMockCharging] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [lastRefresh, setLastRefresh] = useState(null);
  const triggerRefresh = useCallback(() => setRefreshSignal(s => s + 1), []);
  const toggleMock = useCallback(() => setIsMock(p => !p), []);
  const toggleMockCharging = useCallback(() => setIsMockCharging(p => !p), []);

  const mockData = useMemo(() => ({
    ...MOCK_DATA,
    car: {
      ...MOCK_DATA.car,
      state: isMockCharging ? 'charging' : 'parked',
    },
    chargingStatus: isMockCharging ? MOCK_DATA.chargingStatus : { charging: false },
  }), [isMockCharging]);

  const value = useMemo(() => ({
    isMock,
    toggleMock,
    isMockCharging,
    toggleMockCharging,
    refreshSignal,
    triggerRefresh,
    lastRefresh,
    setLastRefresh,
    mockData,
  }), [isMock, toggleMock, isMockCharging, toggleMockCharging, refreshSignal, triggerRefresh, lastRefresh, mockData]);

  return (
    <MockContext.Provider value={value}>
      {children}
    </MockContext.Provider>
  );
}

export function useMock() {
  return useContext(MockContext);
}
