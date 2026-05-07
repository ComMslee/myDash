# 운영 가이드

장애 대응은 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) 참고.

## 재부팅 안전성 (자동 복구)

**결론: 인스턴스 재부팅/시작 시 모든 서비스가 자동으로 복구됩니다.**

| 항목 | 메커니즘 |
|---|---|
| Docker 데몬 | `systemctl enable docker` → 부팅 시 시작 |
| 5개 컨테이너 | `docker-compose.yml`의 `restart: always` |
| 스왑 4GB | `/etc/fstab` 등록 |
| UFW 방화벽 | `systemctl enable ufw` |
| fail2ban | `systemctl enable fail2ban` |
| unattended-upgrades | systemd timer |

### 재부팅 테스트
```bash
# 인스턴스 재부팅
aws --profile mydash lightsail reboot-instance --instance-name mydash-prod --region ap-northeast-2

# 2~3분 후 확인
ssh -i lightsail-seoul.pem ubuntu@<LIGHTSAIL_IP> 'sudo docker compose -f myDash/docker-compose.yml ps'
```

## 서비스 관리

### 컨테이너 상태
```bash
ssh -i lightsail-seoul.pem ubuntu@<LIGHTSAIL_IP> 'cd myDash && sudo docker compose ps'
```

### 로그
```bash
# 실시간
ssh -i lightsail-seoul.pem ubuntu@<LIGHTSAIL_IP> 'cd myDash && sudo docker compose logs -f dashboard'

# 최근 100줄
ssh -i lightsail-seoul.pem ubuntu@<LIGHTSAIL_IP> 'cd myDash && sudo docker compose logs --tail 100 dashboard'
```

### 재시작
```bash
ssh -i lightsail-seoul.pem ubuntu@<LIGHTSAIL_IP> 'cd myDash && sudo docker compose restart dashboard'
```

### 전체 재기동
```bash
ssh -i lightsail-seoul.pem ubuntu@<LIGHTSAIL_IP> 'cd myDash && sudo docker compose down && sudo docker compose up -d'
```

## 모니터링

### 메모리
```bash
ssh -i lightsail-seoul.pem ubuntu@<LIGHTSAIL_IP> 'free -m && echo --- && top -bn1 | head -20'
```

### 디스크
```bash
ssh -i lightsail-seoul.pem ubuntu@<LIGHTSAIL_IP> 'df -h / && sudo du -sh /var/lib/docker'
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

## 비용 관리

- **예산 알림**: `mydash-monthly` $10/월 등록됨
- **현재 비용 확인** (24시간 후부터 집계):
  ```bash
  aws --profile mydash ce get-cost-and-usage \
    --time-period Start=$(date -u -d '7 days ago' +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
    --granularity DAILY --metrics UnblendedCost
  ```
- **90일 무료 종료 예상**: 2026년 7월 ~ (생성일 기준)

## 백업 & 인스턴스 라이프사이클

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
ssh -i lightsail-seoul.pem ubuntu@<LIGHTSAIL_IP> 'sudo docker exec mydash-database-1 pg_dump -U teslamate -Fc teslamate' > backup-$(date +%Y%m%d).dump
```

### 인스턴스 정리 (삭제 시)

```bash
# Static IP 분리 & 삭제
aws --profile mydash lightsail detach-static-ip --static-ip-name StaticIp-1 --region ap-northeast-2
aws --profile mydash lightsail release-static-ip --static-ip-name StaticIp-1 --region ap-northeast-2

# 인스턴스 삭제
aws --profile mydash lightsail delete-instance --instance-name mydash-prod --region ap-northeast-2
```
