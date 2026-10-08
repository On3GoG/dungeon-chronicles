@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if "%YANDEX_API_KEY%"=="" if exist keys.bat call keys.bat
if "%YANDEX_API_KEY%"=="" if exist "..\dm-model-test\keys.bat" call "..\dm-model-test\keys.bat"
set "NODE=node"
node --version >nul 2>nul || set "NODE=%ProgramFiles%\nodejs\node.exe"
echo Проверка кэша Yandex AI Studio (около 1-2 рублей из гранта)...
echo.
"%NODE%" --disable-warning=ExperimentalWarning tools/cache_probe.ts
echo.
"%NODE%" --disable-warning=ExperimentalWarning tools/cache_probe.ts aliceai-llm
pause
