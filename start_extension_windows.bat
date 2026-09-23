@echo off
echo Building Extension...
cd extension
call npm run build
echo Extension built in extension\dist\
pause
