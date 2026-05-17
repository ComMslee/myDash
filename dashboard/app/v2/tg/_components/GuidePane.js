export function GuidePane() {
  return (
    <div className="text-[12px] text-zinc-300 space-y-4 leading-relaxed">
      <div>
        <div className="font-medium mb-1">1. 시작하는 방법</div>
        <div className="text-zinc-400">
          Telegram 앱에서 <code className="text-blue-300">@liam_mydash_bot</code> 검색 → "Start" 누르기 → 관리자 승인 대기 → 승인되면 사용 가능 (`/help` 자동 표시).
        </div>
      </div>

      <div>
        <div className="font-medium mb-1">2. 메뉴 사용법 — 슬래시 외울 필요 없음</div>
        <div className="text-zinc-400 mb-1">
          채팅창 하단에 한글 키보드가 자동으로 깔립니다. 누르면 슬래시 명령으로 변환되어 전송.
        </div>
        <div className="bg-black/30 rounded p-2 text-[11px] text-zinc-300 font-mono leading-relaxed">
          {`[🚗 차량]  [🏠 가족]  [📝 SNS]      ← 메인
        ↓ 카테고리 누르면
[🔋 배터리]  [🛣 주행거리]  [📍 위치]
[📊 요약]    [🔌 충전기]    [🗺 가는 곳]
[⬅️ 메인]                                ← 메인 복귀`}
        </div>
        <div className="text-zinc-500 text-[11px] mt-1">
          텔레그램 입력창 좌측 [/] 메뉴는 <b>비활성</b> — 본 봇은 Reply 키보드만 사용.
        </div>
      </div>

      <div>
        <div className="font-medium mb-1">3. 차량 명령 (car 권한)</div>
        <ul className="text-zinc-400 list-disc list-inside space-y-0.5">
          <li><b>🔋 배터리</b> <code className="text-blue-300">/soc</code> — % + 거리 + 충전 상세 통합</li>
          <li><b>🛣 주행거리</b> <code className="text-blue-300">/range</code> — 남은 거리 (alias)</li>
          <li><b>📊 요약</b> <code className="text-blue-300">/period</code> — 오늘·이번주·저번주·최근4주·직전4주 (km · 전비)</li>
          <li><b>📍 위치</b> <code className="text-blue-300">/where</code> — 정차/주행 통합 (지도 핀 포함)</li>
          <li><b>🔌 충전기</b> <code className="text-blue-300">/chargers</code> — 즐겨찾기 동별 가용/충전중</li>
          <li><b>🗺 가는 곳</b> <code className="text-blue-300">/places</code> — 자주가는 곳 / 오래머문 곳 TOP 10 (분기)</li>
        </ul>
        <div className="text-zinc-500 text-[11px] mt-1">
          이전 명령은 alias 로 살아있음: /charge → /soc, /yesterday /week → /period, /parked → /where.
        </div>
      </div>

      <div>
        <div className="font-medium mb-1">4. 가족 명령 (family 권한 · mock)</div>
        <ul className="text-zinc-400 list-disc list-inside space-y-0.5">
          <li><b>🌤 오늘 날씨</b> <code className="text-blue-300">/weather</code> — 기상청 단기예보 (예정)</li>
          <li><b>🌧 강수 예보</b> <code className="text-blue-300">/forecast</code> — 비/눈 사전 알림 (예정)</li>
          <li><b>📅 일정</b> <code className="text-blue-300">/event</code> — 등록·조회·반복 + 알림 (예정)</li>
          <li><b>📝 메모</b> <code className="text-blue-300">/memo</code> — 가족 공유 메모 (예정)</li>
        </ul>
        <div className="text-zinc-500 text-[11px] mt-1">
          현재는 placeholder 응답. 실제 구현은 후속 PR.
        </div>
      </div>

      <div>
        <div className="font-medium mb-1">5. SNS 명령 (sns 권한 · mock)</div>
        <ul className="text-zinc-400 list-disc list-inside space-y-0.5">
          <li><b>📝 글쓰기</b> <code className="text-blue-300">/post</code> — 네이버 블로그 (mock 채널 검증)</li>
        </ul>
        <div className="text-zinc-400 mt-1 text-[11px]">
          누르면 "본문/사진 보내주세요" 안내 → 텍스트/사진/사진+캡션 입력 → 미리보기 표시 → [✅ 발행] 누르면 dashboard 로 전달 확인. 5분 안에 입력 안 하면 자동 취소.
        </div>
      </div>

      <div>
        <div className="font-medium mb-1">6. 🔔 자동 알림 — 이벤트 push</div>
        <div className="text-zinc-400 text-[11px] space-y-1">
          <div>각 알림은 해당 <b>기능그룹 권한자 전원</b>에 자동 발송. 그룹 권한 없으면 받지 않음.</div>
          <div className="font-semibold text-zinc-300 mt-1">🚗 car 그룹 (차량 이벤트, poller 5초 폴링)</div>
          <ul className="list-disc list-inside space-y-0.5 ml-1">
            <li><b>⚡ 충전 시작</b> — SOC + 위치</li>
            <li><b>✅ 충전 완료</b> — SOC델타·kWh·환산km / ⚡급속·🔌완속 / ⏱️시간·📈평균kW · 위치</li>
            <li><b>🚗 주행 종료</b> — 시작→끝 / km · 시간 / Wh/km · km/kWh</li>
            <li><b>📅 주간 요약 (월~금)</b> — 매주 <b>토 09:00 KST</b></li>
            <li><b>📅 주말 요약 (토·일)</b> — 매주 <b>월 09:00 KST</b></li>
          </ul>
          <div className="font-semibold text-zinc-300 mt-2">🏠 family 그룹</div>
          <ul className="list-disc list-inside space-y-0.5 ml-1 text-zinc-500">
            <li>비/눈 1~2시간 전 자동 broadcast (예정)</li>
            <li>등록 일정 알림 (예정)</li>
          </ul>
          <div className="font-semibold text-zinc-300 mt-2">📝 sns 그룹</div>
          <ul className="list-disc list-inside space-y-0.5 ml-1 text-zinc-500">
            <li>발행 결과 통보 (mock)</li>
          </ul>
          <div className="mt-1">
            <b>야간 매너모드</b>: 23~06시 KST 알림은 <code className="text-blue-300">disable_notification</code> 자동 적용 — 메시지는 도착하지만 소리/진동 OFF.
          </div>
          <div>
            <b>인라인 버튼</b> (env <code className="text-blue-300">DASHBOARD_PUBLIC_URL</code> 설정 시): 주행 종료 → 🗺️ 지도 보기, 충전 완료 → 🔋 배터리 상세.
          </div>
          <div className="text-zinc-500">
            "알림" 탭의 <b>🧪 알림 포맷 테스트</b> 에서 10종 샘플 발송 가능 (root 한정).
          </div>
        </div>
      </div>

      <div>
        <div className="font-medium mb-1">7. 응답 후속 액션</div>
        <div className="text-zinc-400 text-[11px]">
          데이터 명령 응답 끝에 inline 버튼 자동 동봉:
          <span className="ml-1 px-1.5 py-0.5 bg-zinc-800 rounded">🔄</span> (새로고침),
          <span className="ml-1 px-1.5 py-0.5 bg-zinc-800 rounded">🛣 거리</span>,
          <span className="ml-1 px-1.5 py-0.5 bg-zinc-800 rounded">🔌 충전기</span> 등 — 컨텍스트 기반 인접 명령.
        </div>
      </div>

      <div>
        <div className="font-medium mb-1">8. 공통 명령 (누구나)</div>
        <ul className="text-zinc-400 list-disc list-inside space-y-0.5">
          <li><code className="text-blue-300">/help</code> — 본인 권한 기준 도움말 + Reply 키보드</li>
          <li><code className="text-blue-300">/whoami</code> — 이름·역할·권한 (root 만 chat_id)</li>
          <li><code className="text-blue-300">/categories</code> — 보유 카테고리 목록</li>
        </ul>
      </div>

      <div>
        <div className="font-medium mb-1">9. 자연어 — 미지원</div>
        <div className="text-zinc-400 text-[11px]">
          정규식 기반 자연어 매칭은 정확도 부족으로 제거. 슬래시 명령 또는 키보드 버튼만 동작.
          잘못된 입력은 친근한 안내로 폴백 + 학습 로그(<code className="text-blue-300">hub_unmatched_inputs</code>) 적재.
        </div>
      </div>

      <div>
        <div className="font-medium mb-1">10. 활용도 리포트 (대시보드)</div>
        <div className="text-zinc-400 text-[11px]">
          <code className="text-blue-300">/v2/chargers</code> 하단의 라이브 패널 — 단지 충전기 활용도 한 화면 요약 (외부 근거자료용). KPI · 주별 추이 · 동별 가동률.
        </div>
      </div>

      <div className="text-[11px] text-zinc-500 border-t border-white/[0.04] pt-2">
        권한 없는 명령은 "이 기능은 아직 권한이 없어요" 안내. 관리자 명령(/pending /setgroup /deny)은 root 만 보임.
      </div>
    </div>
  );
}
