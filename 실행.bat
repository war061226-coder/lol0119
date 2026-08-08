@echo off
setlocal

cd /d "%~dp0"
title LoL 커스텀 게임 밸런서

if exist "LoL-커스텀-밸런서.exe" (
  start "" "LoL-커스텀-밸런서.exe"
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [오류] Node.js가 설치되어 있지 않습니다.
  echo https://nodejs.org/ 에서 LTS 버전을 설치한 뒤 다시 실행해주세요.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo [오류] npm을 찾을 수 없습니다. Node.js를 다시 설치해주세요.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\tsx\dist\cli.mjs" (
  echo 필요한 프로그램을 처음 한 번 설치하는 중입니다...
  call npm install
  if errorlevel 1 (
    echo.
    echo [오류] 필요한 패키지 설치에 실패했습니다.
    pause
    exit /b 1
  )
)

if not exist "data" mkdir "data"

echo LoL 커스텀 게임 밸런서를 시작하는 중입니다...
echo 이 창을 닫거나 Ctrl+C를 누르면 프로그램이 종료됩니다.
echo.

set "NODE_ENV=development"

start "" powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='http://localhost:5000'; for($i=0; $i -lt 60; $i++){ try { $response=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1; if($response.StatusCode -ge 200){ Start-Process $url; break } } catch {} Start-Sleep -Milliseconds 500 }"

call npx tsx server/index.ts

echo.
echo 프로그램이 종료되었습니다.
pause