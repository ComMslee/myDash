# Deep Interview Spec: TeslaMate 커스텀 모바일 대시보드

## Metadata
- Interview ID: teslamate-dashboard-001
- Rounds: 6
- Final Ambiguity Score: 16%
- Type: greenfield (TeslaMate DB 연동)
- Generated: 2026-04-13
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 40% | 0.36 |
| Constraint Clarity | 0.85 | 30% | 0.255 |
| Success Criteria | 0.75 | 30% | 0.225 |
| **Total Clarity** | | | **0.84** |
| **Ambiguity** | | | **16%** |

## Goal
TeslaMate PostgreSQL DB에서 Tesla 차량 데이터를 읽어 모바일 브라우저에 최적화된 대시보드 웹앱을 제공한다. Grafana를 대체하며 더 깔끔하고 모바일 친화적인 UI를 목표로 한다.

## Constraints
- 플랫폼: 모바일 브라우저 (Safari/Chrome) 우선
- 데이터 소스: TeslaMate PostgreSQL DB (직접 연결)
- 기술 스택: Next.js + Tailwind CSS
- 배포: Docker 컨테이너 (기존 docker-compose.yml에 추가)
- 접속: Tailscale VPN (100.106.206.9)
- DB 접속 정보: docker-compose 내부 네트워크 (host: database, port: 5432)

## Non-Goals
- Tesla API 직접 호출 (TeslaMate가 담당)
- 데이터 수집/저장 기능
- 사용자 인증 (로컬 네트워크 + Tailscale로 보안 대체)
- Grafana 호환성 유지

## Acceptance Criteria
- [ ] 모바일 브라우저에서 접속 시 반응형 레이아웃으로 표시
- [ ] 메인 대시보드에 배터리 % 및 주행가능 거리(km) 표시
- [ ] 현재 충전 상태(충전 중/완료, 충전 속도 kW, 남은 시간) 표시
- [ ] 주행 통계(오늘/이번 주 주행거리, 에너지 효율) 표시
- [ ] 충전 이력 목록 표시
- [ ] 충전 비용 통계 표시 (월별/총 충전 비용 집계)
- [ ] 주행 경로를 지도에 표시 (Leaflet.js + OpenStreetMap)
- [ ] 자주 방문하는 장소 히트맵 표시
- [ ] Docker 컨테이너로 실행되며 재부팅 후 자동 시작
- [ ] Tailscale IP(100.106.206.9)로 폰에서 접속 가능

## Technical Context
- TeslaMate DB: PostgreSQL 16, host=database (docker 내부 네트워크)
- DB 자격증명: .env 파일 참조 (TM_DB_USER, TM_DB_PASS, TM_DB_NAME=teslamate)
- 주요 테이블: cars, drives, charges, charging_processes, positions, states
- 포트: 새 컨테이너는 5000번 포트 사용 (4000은 TeslaMate, 3000은 제거됨)

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Car | core domain | id, name, battery_level, est_battery_range, state | has many Drives, Charges |
| Drive | core domain | id, start_date, end_date, distance, efficiency | belongs to Car |
| ChargingProcess | core domain | id, start_date, end_date, charge_energy_added, cost | belongs to Car |
| State | supporting | id, state(driving/charging/parked), start_date | belongs to Car |

## Interview Transcript
<details>
<summary>Full Q&A (6 rounds)</summary>

### Round 1
**Q:** 이 대시보드 앱을 주로 어디서 사용할 건가요?
**A:** 모바일 브라우저
**Ambiguity:** 75%

### Round 2
**Q:** 앱을 열면 첫 화면에서 가장 먼저 보고 싶은 게 뭐예요?
**A:** 대시보드 (복합) - 상태 + 통계 한 눈에
**Ambiguity:** 60%

### Round 3
**Q:** 데이터가 얼마나 실시간으로 업데이트되어야 해요?
**A:** TeslaMate에서 가져오는 것 아닌지? → TeslaMate DB 폴링 방식으로 확정
**Ambiguity:** 50%

### Round 4
**Q:** 대시보드에 보여줄 항목을 모두 골라주세요.
**A:** 배터리 % 및 주행가능 km, 충전 상태, 주행 통계, 충전 이력 (모두 선택)
**Ambiguity:** 35%

### Round 5
**Q:** 앱 기술 스택은 어떻게 할까요?
**A:** 추천에 맡겨 → Next.js + Tailwind 확정
**Ambiguity:** 25%

### Round 6
**Q:** 앱을 어떻게 실행할까요?
**A:** Docker 컨테이너로 추가
**Ambiguity:** 16%
</details>
