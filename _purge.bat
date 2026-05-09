@echo off
cd /d C:\Users\eidbi\Projects\strow-ops
if exist .git\index.lock del .git\index.lock
if exist _commit.bat del _commit.bat
if exist _cleanup.bat del _cleanup.bat
git add -A
git commit -m "chore: drop helper bats"
git push
