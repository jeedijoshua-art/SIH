#!/bin/bash
echo "Starting Backend Server..."
cd server
source .venv/bin/activate
uvicorn app.main:app --reload
