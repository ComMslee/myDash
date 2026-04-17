#!/usr/bin/env bash
# 인스턴스 재부팅 (AWS API)
AWS="C:/Program Files/Amazon/AWSCLIV2/aws.exe"
"$AWS" --profile mydash lightsail reboot-instance \
  --instance-name mydash-prod --region ap-northeast-2
echo "재부팅 요청 완료. 2~3분 후 status.sh 로 확인."
