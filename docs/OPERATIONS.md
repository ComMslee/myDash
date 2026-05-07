# 운영 가이드

## 재부팅 안전성 (자동 복구)

**결론: 인스턴스 재부팅/시작 시 모든 서비스가 자동으로 복구됩니다.**

| 항목 | 메커니즘 |
|---|---|
| Docker 데몬 | `systemctl enable docker` → 부팅 시 시작 |
| 4개 컨테이너 | `docker-compose.yml`의 `restart: always` |
| 스왑 4GB | `/etc/fstab` 등록 |
| UFW 방화벽 | `systemctl enable ufw` |
| fail2ban | `systemctl enable fail2ban` |
| unattended-upgrades | systemd timer |

### 재부팅 테스트
```bash
# 인스턴스 재부팅
aws --profile mydash lightsail reboot-instance --instance-name mydash-prod --region ap-northeast-2

# 2~3분 후 확인
ssh -i lightsail-seoul.pem ubuntu@43.202.133.239 'sudo docker compose -f myDash/docker-compose.yml ps'
```

## 서비스 관리

### 컨테이너 상태
```bash
ssh -i lightsail-seoul.pem ubuntu@43.202.133.239 'cd myDash && sudo docker compose ps'
```

### 로그
```bash
# 실시간
ssh -i lightsail-seoul.pem ubuntu@43.202.133.239 'cd myDash && sudo docker compose logs -f dashboard'

# 최근 100줄
ssh -i lightsail-seoul.pem ubuntu@43.202.133.239 'cd myDash && sudo docker compose logs --tail 100 dashboard'
```

### 재시작
```bash
ssh -i lightsail-seoul.pem ubuntu@43.202.133.239 'cd myDash && sudo docker compose restart dashboard'
```

### 전체 재기동
```bash
ssh -i lightsail-seoul.pem ubuntu@43.202.133.239 'cd myDash && sudo docker compose down && sudo docker compose up -d'
```

## 백업 & 복구

### 자동 스냅샷
- 매일 **19:00 KST** 자동 생성 (AWS Managed)
- 기본 7일 보관

### 수동 스냅샷
```bash
aws --profile mydash lightsail create-instance-snapshot \
  --instance-snapshot-name manual-$(date +%Y%m%d-%H%M) \
  --instance-name mydash-prod \
  --region ap-northeast-2
```

### 복구
스냅샷에서 새 인스턴스 생성 (원본 덮어쓰기 불가):
```bash
aws --profile mydash lightsail create-instances-from-snapshot \
  --instance-snapshot-name <스냅샷이름> \
  --instance-names mydash-prod-restored \
  --availability-zone ap-northeast-2a \
  --bundle-id micro_3_0 \
  --region ap-northeast-2
```

### DB만 백업 (논리 덤프)
```bash
ssh -i lightsail-seoul.pem ubuntu@43.202.133.239 'sudo docker exec mydash-database-1 pg_dump -U teslamate -Fc teslamate' > backup-$(date +%Y%m%d).dump
```

## 모니터링

### 메모리
```bash
ssh -i lightsail-seoul.pem ubuntu@43.202.133.239 'free -m && echo --- && top -bn1 | head -20'
```

### 디스크
```bash
ssh -i lightsail-seoul.pem ubuntu@43.202.133.239 'df -h / && sudo du -sh /var/lib/docker'
```

### Lightsail 지표 (CPU/네트워크)
```bash
aws --profile mydash lightsail get-instance-metric-data \
  --instance-name mydash-prod \
  --metric-name CPUUtilization \
  --period 300 --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --unit Percent --statistics Average \
  --region ap-northeast-2
```

## 트러블슈팅

### 컨테이너가 죽었다 (OOM)
1GB RAM은 타이트 — Postgres가 자주 killed 될 수 있음.

```bash
# 스왑 사용량 확인
ssh -i lightsail-seoul.pem ubuntu@43.202.133.239 'free -m'

# dmesg로 OOM 확인
ssh -i lightsail-seoul.pem ubuntu@43.202.133.239 'sudo dmesg -T | grep -i "killed process" | tail -10'

# 개별 재시작
ssh -i lightsail-seoul.pem ubuntu@43.202.133.239 'cd myDash && sudo docker compose restart database'
```

지속적 OOM이면 `$12 번들(2GB)` 업그레이드 고려:
```bash
# 새 스냅샷 → $12로 복구 후 원본 삭제
```

### 디스크가 가득참
Docker 정리:
```bash
ssh -i lightsail-seoul.pem ubuntu@43.202.133.239 'sudo docker system prune -a -f && sudo docker volume prune -f'
```

### Dashboard 빌드 실패
로컬에서 빌드 확인:
```bash
cd dashboard && docker build -t test .
```

### GHA 배포 실패
Secrets 3개 재확인: `LIGHTSAIL_HOST`, `LIGHTSAIL_USER`, `LIGHTSAIL_SSH_KEY` ([DEPLOY.md](./DEPLOY.md))

## 비용 관리

- **예산 알림**: `mydash-monthly` $10/월 등록됨
- **현재 비용 확인** (24시간 후부터 집계):
  ```bash
  aws --profile mydash ce get-cost-and-usage \
    --time-period Start=$(date -u -d '7 days ago' +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
    --granularity DAILY --metrics UnblendedCost
  ```
- **90일 무료 종료 예상**: 2026년 7월 ~ (생성일 기준)

## 인스턴스 정리 (삭제 시)

```bash
# Static IP 분리 & 삭제
aws --profile mydash lightsail detach-static-ip --static-ip-name StaticIp-1 --region ap-northeast-2
aws --profile mydash lightsail release-static-ip --static-ip-name StaticIp-1 --region ap-northeast-2

# 인스턴스 삭제
aws --profile mydash lightsail delete-instance --instance-name mydash-prod --region ap-northeast-2
```
