@echo off
REM Auto git add, commit, and push

echo.
echo === Git Auto Commit & Push ===
echo.

REM Check if there are changes
git status --porcelain
if %errorlevel% neq 0 (
    echo Error: Not a git repository
    pause
    exit /b 1
)

REM Ask for commit message
set /p message="Enter commit message (or press Enter for default): "
if "%message%"=="" (
    set message=Auto commit and push
)

REM Add all changes
echo.
echo Adding files...
git add .

REM Commit
echo Committing...
git commit -m "%message%"
if %errorlevel% neq 0 (
    echo No changes to commit
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
echo ✓ Done! Changes pushed successfully.
echo.
pause
