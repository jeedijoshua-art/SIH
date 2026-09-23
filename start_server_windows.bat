@echo off
echo Starting Backend Server...
cd server
uvicorn app.main:app --reload
pause
