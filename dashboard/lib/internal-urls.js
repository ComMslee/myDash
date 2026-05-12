// 내부 서비스 URL — docker-compose 네트워크 기준 fallback 포함.
// 컴포즈 외부 배포(예: 다른 호스트) 시 env 로 override.

export const TG_HUB_URL = process.env.TELEGRAM_HUB_URL || 'http://telegram-hub:3000';
