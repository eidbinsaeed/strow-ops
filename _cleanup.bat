@echo off
cd /d C:\Users\eidbi\Projects\strow-ops
if exist .git\index.lock del .git\index.lock
del _commit.bat
git add -A
git commit -m "chore: drop _commit.bat helper"
git push
del _cleanup.bat
