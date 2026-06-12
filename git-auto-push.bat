@echo off
REM Auto git add, commit, and push (non-interactive)

setlocal enabledelayedexpansion

echo.
echo === Git Auto Commit & Push ===
echo.

REM Get current timestamp for commit message
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c-%%a-%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a:%%b)

set commit_message=Auto commit - %mydate% %mytime%

REM Show what we're doing
echo Commit message: %commit_message%
echo.

REM Add all changes
echo Adding files...
git add .

REM Commit
echo Committing...
git commit -m "%commit_message%"
if %errorlevel% neq 0 (
    echo No changes to commit or commit failed.
    pause
    exit /b 1
)

REM Push
echo Pushing to remote...
git push
if %errorlevel% neq 0 (
    echo Error during push. Check your connection and permissions.
    pause
    exit /b 1
)

echo.
echo ✓ Success! Changes committed and pushed.
echo.
pause
