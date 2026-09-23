@echo off
echo Setting up LocalSight for Windows...

echo 1. Setting up Backend (Server)...
cd server
pip install -r requirements.txt
cd ..

echo 2. Setting up Frontend/Extension...
cd extension
call npm install
cd ..

echo Setup Complete! Make sure to copy server\.env.example to server\.env and add your API keys.
pause
