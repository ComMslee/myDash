'use client';

import { useState, useCallback, useRef } from 'react';
import { Icon } from '@/app/lib/Icons';

// ─── 상수 ────────────────────────────────────────────────────────────────────

const ACTION_OPTIONS = [
  { value: 'sentry_on',        label: '센트리 ON' },
  { value: 'sentry_off',       label: '센트리 OFF' },
  { value: 'climate_on',       label: '공조 ON' },
  { value: 'climate_off',      label: '공조 OFF' },
  { value: 'lock',             label: '잠금' },
  { value: 'unlock',           label: '잠금 해제' },
  { value: 'charge_start',     label: '충전 시작' },
  { value: 'charge_stop',      label: '충전 중지' },
  { value: 'set_charge_limit', label: '충전 한도 변경' },
  { value: 'flash_lights',     label: '라이트 점멸' },
];

const DAY_LABELS = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' },
  { key: 'sat', label: '토' },
  { key: 'sun', label: '일' },
];

const WEATHER_PRECIP_OPTIONS = [
  { value: '',     label: '없음' },
  { value: 'rain', label: '비' },
  { value: 'snow', label: '눈' },
  { value: 'any',  label: '비 또는 눈' },
];

// 장소는 시간 트리거의 '필터' 로만 사용 — 머무는 동안(at) 만 저장.

// 'HH:MM' 을 5분 단위로 스냅. 잘못된 값/빈값이면 null.
function snapToFiveMin(hhmm) {
  if (!hhmm || !/^\d{1,2}:\d{1,2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  const snapped = Math.round(m / 5) * 5 % 60;
  return `${String(h).padStart(2, '0')}:${String(snapped).padStart(2, '0')}`;
}

// ─── 초기 상태 헬퍼 ─────────────────────────────────────────────────────────

function buildInitialState(initial) {
  const tc = initial?.trigger_config ?? {};
  return {
    name:            initial?.name            ?? '',
    enabled:         initial?.enabled         ?? true,
    mode:            initial?.mode            ?? 'auto',
    action:          initial?.action          ?? 'sentry_on',
    chargePercent:   initial?.action_params?.percent ?? 80,

    // 시간 = 메인 트리거 (항상 활성). 장소/날씨 = 선택 조건(필터).
    timeEnabled:     true,
    // 5분 단위로 스냅 — 기존 데이터가 :03 같이 들어와도 :00 으로 정렬
    timeHhmm:        snapToFiveMin(tc.time?.hhmm) ?? '08:00',
    timeDays:        tc.time?.days            ?? [],
    timeSkipHolidays: tc.time?.skip_holidays  ?? false,
    timeLead:        tc.time?.lead_minutes    ?? 0,

    locationEnabled: !!tc.location,
    locationPlace:   tc.location?.place       ?? 'home',
    locationDebounce: tc.debounce_minutes     ?? 5,

    weatherEnabled:  !!tc.weather,
    weatherTempMin:  tc.weather?.temp_min     ?? '',
    weatherTempMax:  tc.weather?.temp_max     ?? '',
    weatherPrecip:   tc.weather?.precip       ?? '',

    validFrom:       initial?.valid_from      ?? '',
    validUntil:      initial?.valid_until     ?? '',

    skipDates:       initial?.skip_dates      ?? [],
    skipDateInput:   '',

    applyPauseMode:  initial?.apply_pause_mode ?? false,
  };
}

// ─── 서브 컴포넌트 ───────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] text-zinc-500 font-semibold tracking-wide uppercase mb-1">
      {children}
    </p>
  );
}

function FieldRow({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  );
}

function InputBase({ className = '', ...props }) {
  return (
    <input
      className={`bg-zinc-900 border border-white/[0.06] rounded-md px-2 py-1.5 text-xs text-zinc-200 w-full focus:outline-none focus:ring-1 focus:ring-blue-500/40 tabular-nums ${className}`}
      {...props}
    />
  );
}

// 명시적 native picker — 탭하면 연/월/일 선택 popup 이 뜬다.
function DatePicker({ value, onChange, placeholder = '연-월-일 선택' }) {
  const ref = useRef(null);
  const open = () => {
    const el = ref.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.click();
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={open}
        className="w-full bg-zinc-900 border border-white/[0.06] rounded-md px-2 py-1.5 text-xs text-left flex items-center gap-1.5 hover:bg-zinc-800 transition-colors"
      >
        <span className="text-zinc-500">📅</span>
        <span className={`flex-1 tabular-nums ${value ? 'text-zinc-200' : 'text-zinc-600'}`}>{value || placeholder}</span>
        <span className="text-zinc-600 text-[10px]">▾</span>
      </button>
      <input
        ref={ref}
        type="date"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

function SelectBase({ className = '', children, ...props }) {
  return (
    <select
      className={`bg-zinc-900 border border-white/[0.06] rounded-md px-2 py-1.5 text-xs text-zinc-200 w-full focus:outline-none focus:ring-1 focus:ring-blue-500/40 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

function Toggle({ value, onChange, labelOn = '켜기', labelOff = '끄기' }) {
  return (
    <div className="flex rounded-md overflow-hidden border border-white/[0.06] w-fit">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-2 py-1 text-[11px] font-medium transition-colors ${
          value
            ? 'bg-blue-500/20 text-blue-400 border-r border-blue-500/30'
            : 'bg-zinc-800 text-zinc-500 border-r border-white/[0.06]'
        }`}
      >
        {labelOn}
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-2 py-1 text-[11px] font-medium transition-colors ${
          !value
            ? 'bg-zinc-700 text-zinc-300'
            : 'bg-zinc-800 text-zinc-500'
        }`}
      >
        {labelOff}
      </button>
    </div>
  );
}

function AxisHeader({ icon, title, enabled, onToggle }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <span className="text-sm font-medium text-zinc-300">{title}</span>
      </div>
      <Toggle value={enabled} onChange={onToggle} />
    </div>
  );
}

function ErrorHint({ children }) {
  if (!children) return null;
  return <p className="text-xs text-red-400 mt-1">{children}</p>;
}

// ─── 검증 ────────────────────────────────────────────────────────────────────

function validate(s) {
  const errors = {};
  if (!s.name.trim()) errors.name = '이름을 입력해 주세요.';
  // 시간은 항상 트리거 — 시각 필수
  if (!s.timeHhmm) errors.time = '시각을 설정해 주세요.';
  if (s.locationEnabled && !s.locationPlace) {
    errors.location = '장소를 선택해 주세요.';
  }
  return errors;
}

// ─── payload 조립 ────────────────────────────────────────────────────────────

function buildPayload(s) {
  const trigger_config = {};

  if (s.timeEnabled) {
    trigger_config.time = {
      hhmm:           s.timeHhmm,
      days:           s.timeDays,
      skip_holidays:  s.timeSkipHolidays,
      lead_minutes:   Number(s.timeLead) || 0,
    };
  }

  if (s.locationEnabled) {
    trigger_config.location = {
      place: s.locationPlace,
      event: 'at', // 시간 트리거의 위치 필터로만 사용
    };
    trigger_config.debounce_minutes = Number(s.locationDebounce) || 5;
  }

  if (s.weatherEnabled) {
    const weather = {};
    if (s.weatherTempMin !== '') weather.temp_min = Number(s.weatherTempMin);
    if (s.weatherTempMax !== '') weather.temp_max = Number(s.weatherTempMax);
    if (s.weatherPrecip)         weather.precip   = s.weatherPrecip;
    trigger_config.weather = weather;
  }

  if (!s.timeEnabled && !s.locationEnabled && s.weatherEnabled) {
    trigger_config.debounce_minutes = Number(s.locationDebounce) || 5;
  }

  const action_params = {};
  if (s.action === 'set_charge_limit') {
    action_params.percent = Number(s.chargePercent) || 80;
  }

  return {
    name:             s.name.trim(),
    enabled:          s.enabled,
    mode:             s.mode,
    action:           s.action,
    action_params,
    trigger_config,
    skip_dates:       s.skipDates,
    valid_from:       s.validFrom  || null,
    valid_until:      s.validUntil || null,
    apply_pause_mode: s.applyPauseMode,
  };
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────

export default function ScheduleForm({ initial = null, geofences = [], onSave, onCancel, onTestRun }) {
  const [s, setS] = useState(() => buildInitialState(initial));
  const [saving, setSaving]   = useState(false);
  const [testing, setTesting] = useState(false);
  const [errors, setErrors]   = useState({});
  const [touched, setTouched] = useState(false);

  const set = useCallback((patch) => setS(prev => ({ ...prev, ...patch })), []);

  // ─── 요일 토글 ────────────────────────────────────────────────────────────

  function toggleDay(key) {
    setS(prev => {
      const days = prev.timeDays.includes(key)
        ? prev.timeDays.filter(d => d !== key)
        : [...prev.timeDays, key];
      return { ...prev, timeDays: days };
    });
  }

  // ─── skip_dates 관리 ──────────────────────────────────────────────────────

  function addSkipDate() {
    if (!s.skipDateInput) return;
    if (s.skipDates.includes(s.skipDateInput)) return;
    set({ skipDates: [...s.skipDates, s.skipDateInput].sort(), skipDateInput: '' });
  }

  function removeSkipDate(d) {
    set({ skipDates: s.skipDates.filter(x => x !== d) });
  }

  // ─── 장소 옵션 ────────────────────────────────────────────────────────────

  const placeOptions = [
    { value: 'home',    label: '집' },
    { value: 'work',    label: '회사' },
    { value: 'outside', label: '외부' },
    ...(geofences ?? []).map(g => ({ value: `custom:${g.id}`, label: g.name })),
  ];

  // ─── 저장 / 테스트 ────────────────────────────────────────────────────────

  function runValidate() {
    const errs = validate(s);
    setErrors(errs);
    setTouched(true);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!runValidate()) return;
    setSaving(true);
    try {
      await onSave?.(buildPayload(s));
    } finally {
      setSaving(false);
    }
  }

  async function handleTestRun() {
    if (!runValidate()) return;
    setTesting(true);
    try {
      await onTestRun?.(buildPayload(s));
    } finally {
      setTesting(false);
    }
  }

  const isValid = !touched || Object.keys(errors).length === 0;
  const canSave = s.name.trim().length > 0 && !saving;

  // ─── 렌더 ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-xl p-3 space-y-2.5">

      {/* 헤더 */}
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <h2 className="text-sm font-semibold text-zinc-100">
          {initial ? '스케줄 편집' : '새 스케줄'}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
          aria-label="닫기"
        >
          <Icon name="x" className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 이름 + 활성 토글 한 줄 */}
      <div className="space-y-2 pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <InputBase
            type="text"
            placeholder="스케줄 이름"
            value={s.name}
            onChange={e => set({ name: e.target.value })}
            className="flex-1"
          />
          <Toggle value={s.enabled} onChange={v => set({ enabled: v })} labelOn="ON" labelOff="OFF" />
        </div>
        {touched && errors.name && <ErrorHint>{errors.name}</ErrorHint>}
      </div>

      {/* 액션 한 줄 */}
      <div className="space-y-2 pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 font-semibold tracking-wide uppercase whitespace-nowrap w-12">액션</span>
          <SelectBase
            value={s.action}
            onChange={e => set({ action: e.target.value })}
            className="flex-1"
          >
            {ACTION_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </SelectBase>
          {s.action === 'set_charge_limit' && (
            <InputBase
              type="number"
              min={50}
              max={100}
              value={s.chargePercent}
              onChange={e => set({ chargePercent: e.target.value })}
              className="tabular-nums w-20 flex-shrink-0"
              placeholder="80"
            />
          )}
        </div>
      </div>

      {/* ── 시간 트리거 (항상 활성) ── */}
      <div className="space-y-2 pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-base">🕐</span>
          <span className="text-sm font-medium text-zinc-300">시간</span>
          <span className="text-[10px] text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-800 border border-white/[0.06]">트리거</span>
        </div>

        <div className="pl-4 space-y-2">
          {/* 시각(시:분) + 사전실행(분) 한 줄 */}
          <div className="flex items-center gap-2">
            <SelectBase
              value={(s.timeHhmm || '08:00').split(':')[0]}
              onChange={e => {
                const mm = (s.timeHhmm || '08:00').split(':')[1] || '00';
                set({ timeHhmm: `${e.target.value}:${mm}` });
              }}
              className="flex-1 tabular-nums"
            >
              {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).map(hh => (
                <option key={hh} value={hh}>{hh}시</option>
              ))}
            </SelectBase>
            <SelectBase
              value={(s.timeHhmm || '08:00').split(':')[1]}
              onChange={e => {
                const hh = (s.timeHhmm || '08:00').split(':')[0] || '08';
                set({ timeHhmm: `${hh}:${e.target.value}` });
              }}
              className="flex-1 tabular-nums"
            >
              {Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')).map(mm => (
                <option key={mm} value={mm}>{mm}분</option>
              ))}
            </SelectBase>
            <span className="text-[10px] text-zinc-500 whitespace-nowrap">사전</span>
            <InputBase
              type="number"
              min={0}
              max={120}
              value={s.timeLead}
              onChange={e => set({ timeLead: e.target.value })}
              placeholder="0"
              className="tabular-nums w-14 flex-shrink-0"
            />
            <span className="text-[10px] text-zinc-500">분</span>
          </div>

          {/* 요일 한 줄 */}
          <div className="flex gap-1.5">
            {DAY_LABELS.map(({ key, label }) => {
              const active = s.timeDays.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleDay(key)}
                  className={`flex-1 h-7 rounded-md text-[11px] font-semibold border transition-colors ${
                    active
                      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                      : 'bg-zinc-800 text-zinc-500 border-white/[0.06]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {touched && errors.time && <ErrorHint>{errors.time}</ErrorHint>}
        </div>
      </div>

      {/* ── 추가 조건 (장소·날씨 필터) ── */}
      <div className="space-y-3 pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-400">📋 추가 조건</span>
          <span className="text-[10px] text-zinc-500">(시간 매칭 시 함께 충족돼야 발화)</span>
        </div>

        {/* 장소 필터 — 한 줄 */}
        <div className="bg-zinc-900/30 border border-white/[0.04] rounded-lg p-2 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">📍</span>
            <span className="text-xs text-zinc-300 flex-1">장소</span>
            <Toggle value={s.locationEnabled} onChange={v => set({ locationEnabled: v })} labelOn="ON" labelOff="OFF" />
          </div>
          {s.locationEnabled && (
            <SelectBase
              value={s.locationPlace}
              onChange={e => set({ locationPlace: e.target.value })}
            >
              {placeOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}에 머물 때</option>
              ))}
            </SelectBase>
          )}
          {touched && errors.location && <ErrorHint>{errors.location}</ErrorHint>}
        </div>

        {/* 날씨 필터 — 토글 + 외기온 min/max + 강수 한 줄 */}
        <div className="bg-zinc-900/30 border border-white/[0.04] rounded-lg p-2 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">🌤</span>
            <span className="text-xs text-zinc-300 flex-1">날씨</span>
            <Toggle value={s.weatherEnabled} onChange={v => set({ weatherEnabled: v })} labelOn="ON" labelOff="OFF" />
          </div>
          {s.weatherEnabled && (
            <div className="flex items-center gap-1.5">
              <InputBase
                type="number"
                value={s.weatherTempMin}
                onChange={e => set({ weatherTempMin: e.target.value })}
                placeholder="최저°"
                className="tabular-nums flex-1"
              />
              <span className="text-zinc-600 text-[10px]">~</span>
              <InputBase
                type="number"
                value={s.weatherTempMax}
                onChange={e => set({ weatherTempMax: e.target.value })}
                placeholder="최고°"
                className="tabular-nums flex-1"
              />
              <SelectBase
                value={s.weatherPrecip}
                onChange={e => set({ weatherPrecip: e.target.value })}
                className="flex-1"
              >
                {WEATHER_PRECIP_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label === '없음' ? '강수 무관' : o.label}</option>
                ))}
              </SelectBase>
            </div>
          )}
        </div>
      </div>

      {/* 유효 기간 한 줄 */}
      <div className="space-y-1 pb-2 border-b border-white/[0.06]">
        <SectionLabel>유효 기간 (비워두면 무제한)</SectionLabel>
        <div className="flex items-center gap-1.5">
          <div className="flex-1">
            <DatePicker
              value={s.validFrom}
              onChange={v => set({ validFrom: v })}
              placeholder="시작일"
            />
          </div>
          <span className="text-zinc-600 text-[10px]">~</span>
          <div className="flex-1">
            <DatePicker
              value={s.validUntil}
              onChange={v => set({ validUntil: v })}
              placeholder="종료일"
            />
          </div>
        </div>
      </div>

      {/* 제외 날짜 */}
      <div className="space-y-2 pb-2 border-b border-white/[0.06]">
        <SectionLabel>제외 날짜</SectionLabel>
        <div className="flex gap-2">
          <div className="flex-1">
            <DatePicker
              value={s.skipDateInput}
              onChange={v => set({ skipDateInput: v })}
              placeholder="제외할 날짜 선택"
            />
          </div>
          <button
            type="button"
            onClick={addSkipDate}
            disabled={!s.skipDateInput}
            className="px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-white/[0.06] hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            추가
          </button>
        </div>

        {s.skipDates.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {s.skipDates.map(d => (
              <span
                key={d}
                className="flex items-center gap-1 bg-zinc-800 border border-white/[0.06] rounded-md px-2 py-1 text-xs text-zinc-300 tabular-nums"
              >
                {d}
                <button
                  type="button"
                  onClick={() => removeSkipDate(d)}
                  className="text-zinc-500 hover:text-zinc-200 transition-colors ml-0.5"
                  aria-label={`${d} 제거`}
                >
                  <Icon name="x" className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 건너뛰기 — 공휴일 / 휴무 모드 한 줄 */}
      <div className="space-y-1 pb-2 border-b border-white/[0.06]">
        <SectionLabel>건너뛰기</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center justify-between gap-2 bg-zinc-900/30 border border-white/[0.04] rounded-lg px-2 py-1.5">
            <span className="text-xs text-zinc-300">공휴일</span>
            <Toggle
              value={s.timeSkipHolidays}
              onChange={v => set({ timeSkipHolidays: v })}
              labelOn="ON"
              labelOff="OFF"
            />
          </div>
          <div className="flex items-center justify-between gap-2 bg-zinc-900/30 border border-white/[0.04] rounded-lg px-2 py-1.5">
            <span className="text-xs text-zinc-300">휴무 모드</span>
            <Toggle
              value={s.applyPauseMode}
              onChange={v => set({ applyPauseMode: v })}
              labelOn="ON"
              labelOff="OFF"
            />
          </div>
        </div>
      </div>

      {/* 하단 버튼 */}
      <div className="flex gap-1.5 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="flex-1 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
        >
          {saving ? '저장 중…' : '저장'}
        </button>

        {onTestRun && (
          <button
            type="button"
            onClick={handleTestRun}
            disabled={testing || saving}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 border border-white/[0.06] transition-colors whitespace-nowrap"
          >
            {testing ? '실행…' : 'Dry-Run'}
          </button>
        )}

        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-white/[0.06] transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  );
}
