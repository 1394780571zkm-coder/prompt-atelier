@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\@deepseek-ai\dsh\lib\bin.js" goto install
if not exist "node_modules\@huggingface\transformers\package.json" goto install
goto launch
:install
  call npm ci
  if errorlevel 1 goto failed
:launch
if not exist "node_modules\electron\dist\electron.exe" (
  set "NODE_USE_ENV_PROXY=1"
  call npx --no install-electron
  if errorlevel 1 goto failed
)
start "" "node_modules\electron\dist\electron.exe" "%cd%"
exit /b 0
:failed
echo Could not install dependencies. Check Node.js and your network.
pause
exit /b 1
