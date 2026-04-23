# 백업 & 인스턴스 라이프사이클

## 자동 스냅샷
- 매일 **19:00 KST** 자동 생성 (AWS Managed)
- 기본 7일 보관

## 수동 스냅샷
```bash
aws --profile mydash lightsail create-instance-snapshot \
  --instance-snapshot-name manual-$(date +%Y%m%d-%H%M) \
  --instance-name mydash-prod \
  --region ap-northeast-2
```

## 복구
스냅샷에서 새 인스턴스 생성 (원본 덮어쓰기 불가):
```bash
aws --profile mydash lightsail create-instances-from-snapshot \
  --instance-snapshot-name <스냅샷이름> \
  --instance-names mydash-prod-restored \
  --availability-zone ap-northeast-2a \
  --bundle-id micro_3_0 \
  --region ap-northeast-2
```

## DB만 백업 (논리 덤프)
```bash
ssh -i lightsail-seoul.pem ubuntu@<LIGHTSAIL_IP> 'sudo docker exec mydash-database-1 pg_dump -U teslamate -Fc teslamate' > backup-$(date +%Y%m%d).dump
```

## 인스턴스 정리 (삭제 시)

```bash
# Static IP 분리 & 삭제
aws --profile mydash lightsail detach-static-ip --static-ip-name StaticIp-1 --region ap-northeast-2
aws --profile mydash lightsail release-static-ip --static-ip-name StaticIp-1 --region ap-northeast-2

# 인스턴스 삭제
aws --profile mydash lightsail delete-instance --instance-name mydash-prod --region ap-northeast-2
```
