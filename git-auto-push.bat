@echo off
setlocal enabledelayedexpansion

echo.
echo === Git Auto Commit ^& Push ===
echo.

REM Get current timestamp
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c-%%a-%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a:%%b)

set commit_message=Auto commit - !mydate! !mytime!

echo Commit message: !commit_message!
echo.

echo Adding files...
git add .

echo Committing...
git commit -m "!commit_message!"
if errorlevel 1 (
    echo No changes to commit.
    pause
    exit /b 1
)

echo Pushing to remote...
git push

echo.
echo Success! Changes committed and pushed.
echo.
pause
