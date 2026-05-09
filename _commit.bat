@echo off
cd /d C:\Users\eidbi\Projects\strow-ops
if exist .git\index.lock del .git\index.lock
git add -A
git commit -m "feat(audit,owner-auth): wire audit_log writes + Supabase magic-link gate on /owner/**"
git push
