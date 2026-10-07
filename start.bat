@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================================
echo   Хроники Подземелий — прототип
echo ============================================================
echo.

rem --- ключи: .env или keys.bat из папки теста моделей
if not exist .env copy /y .env.example .env >nul
if "%YANDEX_API_KEY%"=="" if exist keys.bat call keys.bat
if "%YANDEX_API_KEY%"=="" if exist "..\dm-model-test\keys.bat" call "..\dm-model-test\keys.bat"

rem --- Node.js 22.18 или новее
set "NODE=node"
call :checknode
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE=%ProgramFiles%\nodejs\node.exe"
  call :checknode
)
if errorlevel 1 (
  echo Нужен Node.js 22.18 или новее. Устанавливаю Node.js LTS через winget...
  echo Это займёт 1-3 минуты. Если Windows спросит разрешение — согласитесь.
  winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
  set "NODE=%ProgramFiles%\nodejs\node.exe"
  call :checknode
)
if errorlevel 1 (
  echo.
  echo Не удалось установить Node.js автоматически.
  echo Скачайте LTS-версию с https://nodejs.org/ru и запустите этот файл снова.
  pause
  exit /b 1
)

echo Node.js:
"%NODE%" --version
echo.
echo Если Windows спросит про брандмауэр — разрешите доступ в ЧАСТНЫХ сетях,
echo иначе телефон не увидит игру.
echo.
"%NODE%" --disable-warning=ExperimentalWarning src/server.ts
echo.
echo Сервер остановлен.
pause
exit /b 0

:checknode
"%NODE%" -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)" >nul 2>nul
exit /b %errorlevel%
