@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE=node"
node --version >nul 2>nul || set "NODE=%ProgramFiles%\nodejs\node.exe"
"%NODE%" --disable-warning=ExperimentalWarning --test "tests/*.test.ts"
pause
