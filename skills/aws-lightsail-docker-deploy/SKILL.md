---
name: aws-lightsail-docker-deploy
description: docker-compose로 돌아가는 앱을 AWS Lightsail 단일 인스턴스에 저렴하게 ($7/월) 배포. Seoul 리전 + 정적 IP + 자동 스냅샷 + 스왑 + UFW + GHA SSH 배포까지 엔드투엔드.
---

# AWS Lightsail Docker-compose 배포

## 언제 사용
- 로컬/자체 호스팅 docker-compose 앱을 클라우드로 이전
- 예산 $10/월 이내 단일 VM 운영
- RDS/ALB/ECS 같은 관리형 서비스가 과도할 때
- EC2 대비 단순 + 번들 가격 원할 때

## 전제
- AWS 계정 (신규면 Lightsail 90일 무료 적용)
- 로컬에 `aws` CLI + `ssh`
- 대상 앱의 `docker-compose.yml` 준비

## 단계

### 1. 인스턴스 생성 (Seoul, Ubuntu 22.04, $7 번들)
```bash
aws --profile <PROFILE> lightsail create-instances \
  --instance-names mydash-prod \
  --availability-zone ap-northeast-2a \
  --blueprint-id ubuntu_22_04 \
  --bundle-id micro_3_0 \
  --region ap-northeast-2
```

### 2. 정적 IP 할당
```bash
aws --profile <PROFILE> lightsail allocate-static-ip --static-ip-name mydash-ip --region ap-northeast-2
aws --profile <PROFILE> lightsail attach-static-ip \
  --static-ip-name mydash-ip --instance-name mydash-prod --region ap-northeast-2
STATIC_IP=$(aws --profile <PROFILE> lightsail get-static-ip --static-ip-name mydash-ip \
  --region ap-northeast-2 --query 'staticIp.ipAddress' --output text)
echo "Static IP: $STATIC_IP"
```

### 3. 기본 SSH 키 다운로드
```bash
aws --profile <PROFILE> lightsail download-default-key-pair \
  --region ap-northeast-2 --output text --query 'privateKeyBase64' > lightsail-key.pem
chmod 600 lightsail-key.pem
```

### 4. OS 세팅 (스왑 4GB + Docker + UFW + fail2ban)
`references/remote-setup.sh` 를 인스턴스에 업로드 후 실행.
```bash
scp -i lightsail-key.pem references/remote-setup.sh ubuntu@$STATIC_IP:~/
ssh -i lightsail-key.pem ubuntu@$STATIC_IP 'bash ~/remote-setup.sh'
```

### 5. 프로젝트 배포
```bash
ssh -i lightsail-key.pem ubuntu@$STATIC_IP '
  git clone <REPO_URL> ~/app
  cd ~/app
  cat > .env <<EOF
  KEY1=value1
  ...
  EOF
  chmod 600 .env
  sudo docker compose up -d
'
```

### 6. 방화벽 최소화
```bash
aws --profile <PROFILE> lightsail put-instance-public-ports \
  --instance-name mydash-prod --region ap-northeast-2 \
  --port-infos fromPort=22,toPort=22,protocol=tcp fromPort=80,toPort=80,protocol=tcp
```

### 7. 자동 스냅샷
```bash
aws --profile <PROFILE> lightsail enable-add-on \
  --region ap-northeast-2 --resource-name mydash-prod \
  --add-on-request 'addOnType=AutoSnapshot,autoSnapshotAddOnRequest={snapshotTimeOfDay=19:00}'
```

### 8. 예산 알림
```bash
aws --profile <PROFILE> budgets create-budget \
  --account-id <ACCOUNT_ID> --budget file://references/budget.json
```

## 비용 (Seoul 기준)
- 첫 90일 Lightsail 무료
- 이후 $7/월 (1GB RAM, 2vCPU, 40GB SSD, 2TB 전송)
- 자동 스냅샷 ~$0.20/월

## 관련 스킬
- `aws-iam-cli-bootstrap` — CLI 프로파일 먼저 세팅
- `gha-ssh-deploy` — CI/CD 전환
- `lightsail-firewall-cli` — 포트 관리
