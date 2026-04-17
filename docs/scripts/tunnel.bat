@echo off
REM Dashboard(5000) + TeslaMate(4000)를 localhost로 포트포워딩
REM 종료: Ctrl+C
REM 실행 후 브라우저에서 http://localhost:5000 / http://localhost:4000
ssh -i "%~dp0..\..\lightsail-seoul.pem" -N ^
    -L 5000:localhost:5000 ^
    -L 4000:localhost:4000 ^
    ubuntu@43.202.133.239
