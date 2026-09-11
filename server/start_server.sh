#!/bin/bash
cd "/Users/jeedijoshua/Documents/Karunya 25-29/SIH-2026/Prototype/server"
source .venv/bin/activate || python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --env-file .env
