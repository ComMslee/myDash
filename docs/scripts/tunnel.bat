@echo off
setlocal
set KEY=%~dp0..\..\lightsail-seoul.pem
set HOST=ubuntu@43.202.133.239

title myDash SSH Tunnel

echo ================================================
echo  myDash SSH Tunnel
echo ================================================
echo  Dashboard  http://localhost:5000
echo  TeslaMate  http://localhost:4000
echo ------------------------------------------------
echo  * Keep this window OPEN while using tunnel
echo  * Press Ctrl+C then Y to stop
echo ================================================
echo.

if not exist "%KEY%" (
  echo [ERROR] Key file not found:
  echo   %KEY%
  echo.
  pause
  exit /b 1
)

echo Connecting... (will look blank once connected)
echo.

ssh -i "%KEY%" ^
    -o StrictHostKeyChecking=no ^
    -o ServerAliveInterval=30 ^
    -o ExitOnForwardFailure=yes ^
    -N ^
    -L 5000:localhost:5000 ^
    -L 4000:localhost:4000 ^
    %HOST%

echo.
echo ================================================
echo  Tunnel closed (exit %ERRORLEVEL%).
echo ================================================
pause
