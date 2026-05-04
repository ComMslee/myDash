# 트러블슈팅

## 1차 진단 — `/v2/dev/api-status`

이슈 발생 시 **항상 이 페이지부터** 펴서 라이브 상태를 확인. 코드만 읽어선 안 보이는 정보를 한 번에 노출.

- URL: `http://<host>/v2/dev/api-status` (URL 직접 입력 — 하단 탭·전역 헤더 미노출)
- 5개 카테고리 29개 라우트 + 시스템/충전 감지/폴링 진단 통합 뷰
- "전체 재실행" → 22개 동시 호출, 각 행 ▾ 펼침으로 raw peek + (해당되면) 대시보드 뷰

**증상별 1차 진단 매핑**:

| 증상 | 펼쳐 볼 행 | 확인 |
|---|---|---|
| 페이지 전반 느림/안 뜸 | `/api/server-status` | DB latency / pool / host loadavg / TeslaMate 데이터 freshness |
| "충전 안 잡힘", "처음엔 됐다 안 됨" (`charges` 스키마 함정) | `/api/charging-status` | `charging` / `pwr` / `lvl` / `pSig` / `lSig` (헤더 10연타 디버그 바와 동일) |
| 집충전기 데이터 stale | `/api/home-charger/poll-log` | `WarmDiagCard` — 마지막 tick 2분+ 면 ⚠️ |
| 이력 첫 클릭 5xx (`route-map` LRU) | 해당 행 ▶ 반복 | status·ms·KB 추이로 캐시 eviction 작동 확인 |
| TeslaMate 데이터 끊김 | `/api/server-status` | `latest position / drive / charge` 색상 (5분 → 30분 → 그 이상) |

**기존 라이브 진단과의 관계**:
- 헤더 10연타 디버그 바 (`GlobalHeader.js`) — 라이브 충전 신호를 항상 위에 띄우는 용도
- 폴링 로그 팝업 안 `WarmDiagCard` — 집충전기 카드에서 진입
- 이 페이지가 같은 데이터를 한 곳에 통합. 새 라우트 추가 시 `dashboard/app/v2/dev/api-status/page.js` `ROUTES` 배열에도 등록.

## 컨테이너가 죽었다 (OOM)
1GB RAM은 타이트 — Postgres가 자주 killed 될 수 있음.

```bash
# 스왑 사용량 확인
ssh -i lightsail-seoul.pem ubuntu@<LIGHTSAIL_IP> 'free -m'

# dmesg로 OOM 확인
ssh -i lightsail-seoul.pem ubuntu@<LIGHTSAIL_IP> 'sudo dmesg -T | grep -i "killed process" | tail -10'

# 개별 재시작
ssh -i lightsail-seoul.pem ubuntu@<LIGHTSAIL_IP> 'cd myDash && sudo docker compose restart database'
```

지속적 OOM이면 `$12 번들(2GB)` 업그레이드 고려 — 새 스냅샷 → $12로 복구 후 원본 삭제.

## 디스크가 가득참
Docker 정리:
```bash
ssh -i lightsail-seoul.pem ubuntu@<LIGHTSAIL_IP> 'sudo docker system prune -a -f && sudo docker volume prune -f'
```

## Dashboard 빌드 실패
로컬에서 빌드 확인:
```bash
cd dashboard && docker build -t test .
```

## GHA 배포 실패
Secrets 3개 재확인: `LIGHTSAIL_HOST`, `LIGHTSAIL_USER`, `LIGHTSAIL_SSH_KEY` ([DEPLOY.md](./DEPLOY.md))

## 서버 Git 상태 꼬임
```bash
ssh -i lightsail-seoul.pem ubuntu@<LIGHTSAIL_IP> 'cd myDash && git status'
# 필요 시 (배포 스크립트가 reset --hard origin/master 수행하므로 수동 개입은 예외 상황 한정)
ssh -i lightsail-seoul.pem ubuntu@<LIGHTSAIL_IP> 'cd myDash && git reset --hard origin/master'
```
