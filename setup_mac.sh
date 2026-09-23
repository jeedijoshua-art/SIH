#!/bin/bash
echo "Setting up LocalSight for Mac..."

echo "1. Setting up Backend (Server)..."
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..

echo "2. Setting up Frontend/Extension..."
cd extension
npm install
cd ..

echo "Setup Complete! Make sure to copy server/.env.example to server/.env and add your API keys."
