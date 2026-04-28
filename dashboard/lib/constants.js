// 공유 상수 — 여러 파일에서 동일한 값을 쓰지 않도록 단일 소스 유지

/** kWh/km 환산 계수 (Tesla Model 3 기준) */
export const KWH_PER_KM = 0.150;

/** 배터리 % 계산 기준 최대 주행가능거리 (km) */
export const RATED_RANGE_MAX_KM = 350;

/** 출고 시 배터리 용량 (kWh) — Model Y RWD LFP 2024년 6월 출고 기준 (usable @ 100% SOC) */
export const NOMINAL_BATTERY_KWH = 60;
