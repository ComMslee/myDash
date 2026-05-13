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

const LOCATION_EVENT_OPTIONS = [
  { value: 'at',    label: '머무는 동안' },
  { value: 'enter', label: '도착 시' },
  { value: 'exit',  label: '출발 시' },
];

// ─── 초기 상태 헬퍼 ─────────────────────────────────────────────────────────

function buildInitialState(initial) {
  const tc = initial?.trigger_config ?? {};
  return {
    name:            initial?.name            ?? '',
    enabled:         initial?.enabled         ?? true,
    mode:            initial?.mode            ?? 'auto',
    action:          initial?.action          ?? 'sentry_on',
    chargePercent:   initial?.action_params?.percent ?? 80,

    // 3축 트리거
    timeEnabled:     !!tc.time,
    timeHhmm:        tc.time?.hhmm           ?? '08:00',
    timeDays:        tc.time?.days            ?? [],
    timeSkipHolidays: tc.time?.skip_holidays  ?? false,
    timeLead:        tc.time?.lead_minutes    ?? 0,

    locationEnabled: !!tc.location,
    locationPlace:   tc.location?.place       ?? 'home',
    locationEvent:   tc.location?.event       ?? 'enter',
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
  if (s.timeEnabled) {
    if (!s.timeHhmm && s.timeDays.length === 0) {
      errors.time = '시각 또는 요일 중 하나는 설정해 주세요.';
    }
  }
  if (s.locationEnabled) {
    if (!s.locationPlace) errors.location = '장소를 선택해 주세요.';
    if (!s.locationEvent) errors.locationEvent = '이벤트를 선택해 주세요.';
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
      event: s.locationEvent,
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

      {/* 이름 + 활성 토글 */}
      <div className="space-y-2 pb-2 border-b border-white/[0.06]">
        <FieldRow label="이름">
          <InputBase
            type="text"
            placeholder="스케줄 이름"
            value={s.name}
            onChange={e => set({ name: e.target.value })}
          />
          {touched && errors.name && <ErrorHint>{errors.name}</ErrorHint>}
        </FieldRow>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 font-semibold tracking-wide uppercase">스케줄 활성</p>
            <p className="text-[11px] text-zinc-600 mt-0.5">끄면 자동 실행이 멈춥니다</p>
          </div>
          <Toggle value={s.enabled} onChange={v => set({ enabled: v })} labelOn="켜기" labelOff="끄기" />
        </div>
      </div>

      {/* 액션 */}
      <div className="space-y-2 pb-2 border-b border-white/[0.06]">
        <FieldRow label="액션">
          <SelectBase
            value={s.action}
            onChange={e => set({ action: e.target.value })}
          >
            {ACTION_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </SelectBase>
        </FieldRow>

        {s.action === 'set_charge_limit' && (
          <FieldRow label="충전 한도 (%)">
            <InputBase
              type="number"
              min={50}
              max={100}
              value={s.chargePercent}
              onChange={e => set({ chargePercent: e.target.value })}
              className="tabular-nums"
            />
          </FieldRow>
        )}
      </div>

      {/* ── 시간 트리거 ── */}
      <div className="space-y-2 pb-2 border-b border-white/[0.06]">
        <AxisHeader
          icon="🕐"
          title="시간"
          enabled={s.timeEnabled}
          onToggle={v => set({ timeEnabled: v })}
        />

        {s.timeEnabled && (
          <div className="pl-4 space-y-2">
            {/* 시각 */}
            <FieldRow label="시각">
              <InputBase
                type="time"
                value={s.timeHhmm}
                onChange={e => set({ timeHhmm: e.target.value })}
              />
            </FieldRow>

            {/* 요일 */}
            <div>
              <SectionLabel>요일</SectionLabel>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_LABELS.map(({ key, label }) => {
                  const active = s.timeDays.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleDay(key)}
                      className={`w-7 h-7 rounded-md text-[11px] font-semibold border transition-colors ${
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
            </div>

            {/* 공휴일 */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 font-semibold tracking-wide uppercase">공휴일에 건너뛰기</p>
                <p className="text-[11px] text-zinc-600 mt-0.5">공휴일에는 이 스케줄을 실행하지 않습니다</p>
              </div>
              <Toggle
                value={s.timeSkipHolidays}
                onChange={v => set({ timeSkipHolidays: v })}
                labelOn="켜기"
                labelOff="끄기"
              />
            </div>

            {/* 사전 분 */}
            <FieldRow label="사전 실행 (분)">
              <InputBase
                type="number"
                min={0}
                max={120}
                value={s.timeLead}
                onChange={e => set({ timeLead: e.target.value })}
                placeholder="0"
                className="tabular-nums"
              />
            </FieldRow>

            {touched && errors.time && <ErrorHint>{errors.time}</ErrorHint>}
          </div>
        )}
      </div>

      {/* ── 장소 트리거 ── */}
      <div className="space-y-2 pb-2 border-b border-white/[0.06]">
        <AxisHeader
          icon="📍"
          title="장소"
          enabled={s.locationEnabled}
          onToggle={v => set({ locationEnabled: v })}
        />

        {s.locationEnabled && (
          <div className="pl-4 space-y-2">
            <FieldRow label="장소">
              <SelectBase
                value={s.locationPlace}
                onChange={e => set({ locationPlace: e.target.value })}
              >
                {placeOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </SelectBase>
              {touched && errors.location && <ErrorHint>{errors.location}</ErrorHint>}
            </FieldRow>

            <FieldRow label="이벤트">
              <SelectBase
                value={s.locationEvent}
                onChange={e => set({ locationEvent: e.target.value })}
              >
                {LOCATION_EVENT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </SelectBase>
              {touched && errors.locationEvent && <ErrorHint>{errors.locationEvent}</ErrorHint>}
            </FieldRow>

            <FieldRow label="디바운스 (분)">
              <InputBase
                type="number"
                min={0}
                max={60}
                value={s.locationDebounce}
                onChange={e => set({ locationDebounce: e.target.value })}
                placeholder="5"
                className="tabular-nums"
              />
            </FieldRow>
          </div>
        )}
      </div>

      {/* ── 날씨 트리거 ── */}
      <div className="space-y-2 pb-2 border-b border-white/[0.06]">
        <AxisHeader
          icon="🌤"
          title="날씨"
          enabled={s.weatherEnabled}
          onToggle={v => set({ weatherEnabled: v })}
        />

        {s.weatherEnabled && (
          <div className="pl-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <FieldRow label="외기온 최저 (°C)">
                <InputBase
                  type="number"
                  value={s.weatherTempMin}
                  onChange={e => set({ weatherTempMin: e.target.value })}
                  placeholder="예: -5"
                  className="tabular-nums"
                />
              </FieldRow>
              <FieldRow label="외기온 최고 (°C)">
                <InputBase
                  type="number"
                  value={s.weatherTempMax}
                  onChange={e => set({ weatherTempMax: e.target.value })}
                  placeholder="예: 35"
                  className="tabular-nums"
                />
              </FieldRow>
            </div>

            <FieldRow label="강수">
              <SelectBase
                value={s.weatherPrecip}
                onChange={e => set({ weatherPrecip: e.target.value })}
              >
                {WEATHER_PRECIP_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </SelectBase>
            </FieldRow>
          </div>
        )}
      </div>

      {/* 유효 기간 */}
      <div className="space-y-2 pb-2 border-b border-white/[0.06]">
        <SectionLabel>유효 기간 (비워두면 무제한)</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="시작일">
            <DatePicker
              value={s.validFrom}
              onChange={v => set({ validFrom: v })}
              placeholder="시작일 선택"
            />
          </FieldRow>
          <FieldRow label="종료일">
            <DatePicker
              value={s.validUntil}
              onChange={v => set({ validUntil: v })}
              placeholder="종료일 선택"
            />
          </FieldRow>
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

      {/* 휴무 모드 */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
        <div>
          <p className="text-xs text-zinc-500 font-semibold tracking-wide uppercase">휴무 모드 따르기</p>
          <p className="text-xs text-zinc-600 mt-0.5">휴무 기간에는 이 스케줄을 실행하지 않습니다</p>
        </div>
        <Toggle
          value={s.applyPauseMode}
          onChange={v => set({ applyPauseMode: v })}
          labelOn="켜기"
          labelOff="끄기"
        />
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
