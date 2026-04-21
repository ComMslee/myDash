// 단지 충전기 식별자 → 표시용 문자열 변환 유틸
import {
  P1_108_IDS, P1_107_IDS, P2_102_IDS, P2_104_IDS,
  P3_105_IDS, P3_115_IDS,
  MAIN_STATION_ID, STATION_115_UNDERGROUND, STATION_CONFIG,
  ID_OFFSET,
} from './constants';

export const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// chgerId → 차지비 앱 번호 (예: '04' → 14)
export function appNumberOf(chgerId) {
  return (ID_OFFSET + Number(chgerId)) - 95100;
}

// (statId, chgerId) → 동 이름 (예: '108', '115(지상)', '119', '기타')
export function buildingOf(statId, chgerId) {
  if (statId === STATION_115_UNDERGROUND) return '115(지하)';
  if (statId !== MAIN_STATION_ID) {
    return (STATION_CONFIG[statId]?.label || statId).replace(/\s*앞$/, '');
  }
  if (P1_108_IDS.includes(chgerId)) return '108';
  if (P1_107_IDS.includes(chgerId)) return '107';
  if (P2_102_IDS.includes(chgerId)) return '102';
  if (P2_104_IDS.includes(chgerId)) return '104';
  if (P3_105_IDS.includes(chgerId)) return '105';
  if (P3_115_IDS.includes(chgerId)) return '115(지상)';
  return '기타';
}

// "PI795111_04" 같은 키를 { statId, chgerId }로 분리
export function splitKey(key) {
  const idx = key.lastIndexOf('_');
  if (idx < 0) return { statId: key, chgerId: '' };
  return { statId: key.slice(0, idx), chgerId: key.slice(idx + 1) };
}

// 팝업 표시용 라벨 — "108-14" 형식
export function formatEntry(key) {
  const { statId, chgerId } = splitKey(key);
  return `${buildingOf(statId, chgerId)}-${appNumberOf(chgerId)}`;
}
