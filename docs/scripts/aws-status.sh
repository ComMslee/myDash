#!/usr/bin/env bash
# AWS 리소스 상태 요약
AWS="C:/Program Files/Amazon/AWSCLIV2/aws.exe"
PROFILE="--profile mydash"
REGION="--region ap-northeast-2"

echo "=== INSTANCE ==="
"$AWS" $PROFILE lightsail get-instance --instance-name mydash-prod $REGION \
  --query 'instance.{name:name,state:state.name,ip:publicIpAddress,bundle:bundleId}' --output table

echo "=== FIREWALL ==="
"$AWS" $PROFILE lightsail get-instance-port-states --instance-name mydash-prod $REGION \
  --query 'portStates[*].[fromPort,toPort,protocol,state]' --output table

echo "=== SNAPSHOTS (latest 5) ==="
"$AWS" $PROFILE lightsail get-instance-snapshots $REGION \
  --query 'instanceSnapshots[:5].[name,createdAt,sizeInGb,state]' --output table

echo "=== BUDGET ==="
"$AWS" $PROFILE budgets describe-budgets --account-id 183088117326 \
  --query 'Budgets[*].[BudgetName,BudgetLimit.Amount,CalculatedSpend.ActualSpend.Amount]' --output table
