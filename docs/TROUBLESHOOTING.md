# 트러블슈팅

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
