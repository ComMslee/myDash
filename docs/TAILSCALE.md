# Tailscale 설정

외부에서 **공개 IP를 열지 않고** Dashboard에 안전하게 접근하기 위한 설정.

## 왜 Tailscale?

- Lightsail 방화벽은 SSH(22)만 허용
- 5000/4000 포트를 퍼블릭에 노출하면 인증 없이 누구나 접근 가능
- Tailscale은 본인 기기끼리만 통하는 가상 네트워크 (Zero-trust, 무료)

## 사전 준비 (1회)

1. [https://tailscale.com/start](https://tailscale.com/start)에서 계정 생성
2. 로컬 Windows PC에 Tailscale 클라이언트 설치 및 로그인
3. 휴대폰도 동일 계정으로 설치

## Auth Key 발급

1. [Admin → Settings → Keys](https://login.tailscale.com/admin/settings/keys)
2. **Generate auth key**
3. 옵션:
   - ✅ **Reusable** (여러 번 사용)
   - ✅ **Pre-approved**
   - ✅ **Ephemeral** 체크 해제 (재부팅 시 유지)
   - Tags: `tag:server` (선택)
   - Expiration: 90일 (최대)
4. 생성된 `tskey-auth-xxxxxxxxxxxxx` 복사

> ⚠️ **tskey는 비밀키입니다.** 코드/깃에 커밋 금지.

## 서버에 적용

로컬 Windows에서:

```bash
cd C:\Users\lmskn\Downloads\myDash
ssh -i lightsail-seoul.pem ubuntu@43.202.133.239
```

서버 안에서:

```bash
cd ~/myDash
echo 'TS_AUTHKEY=tskey-auth-xxxxxxxxxxxxx' | sudo tee -a .env
sudo docker compose -f docker-compose.yml -f docker-compose.tailscale.yml up -d tailscale
```

상태 확인:
```bash
sudo docker exec -it myDash-tailscale-1 tailscale status
```

## 접속

로그인 성공하면 [Tailscale Admin](https://login.tailscale.com/admin/machines)에 `mydash-aws` 기기가 추가됨.

로컬 브라우저에서:
- `http://mydash-aws:5000` — Dashboard
- `http://mydash-aws:4000` — TeslaMate 관리

또는 할당된 Tailscale IP(`100.x.x.x`) 사용:
- `http://100.x.x.x:5000`

## Tailscale SSH (옵션)

`docker-compose.tailscale.yml`에 `--ssh` 플래그 포함 → SSH 키 없이도 Tailscale 사용자로 SSH 가능:
```bash
tailscale ssh ubuntu@mydash-aws
```

## Auth Key 재발급
키 만료(90일) 시:
1. 새 키 발급
2. 서버 `.env`의 `TS_AUTHKEY=` 값 교체
3. `sudo docker compose ... up -d tailscale` 재실행

## 롤백 / 제거

```bash
ssh -i lightsail-seoul.pem ubuntu@43.202.133.239
cd ~/myDash
sudo docker compose -f docker-compose.yml -f docker-compose.tailscale.yml down tailscale
# .env에서 TS_AUTHKEY 라인 삭제
```
