@echo off
chcp 65001 > nul
echo ========================================================
echo   [오토링크 스마트파킹 v2.3] API & 웹 통합 서버 실행
echo ========================================================
echo.
echo 웹 브라우저 접속 주소: http://localhost:8080/
echo 4사 내비 실시간 API:  http://localhost:8080/api/routes/compare
echo.
echo 서버를 종료하려면 이 창을 닫거나 Ctrl+C 를 누르세요.
echo ========================================================
powershell -ExecutionPolicy Bypass -File "%~dp0api_server.ps1" -Port 8080
pause
