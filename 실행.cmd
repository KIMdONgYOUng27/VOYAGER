@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" launcher.cjs
  ) else (
    echo Node.js 22.13 or newer is required.
    pause
    exit /b 1
  )
) else (
  node launcher.cjs
)
if errorlevel 1 pause
