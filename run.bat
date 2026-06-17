@echo off
set PYTHONIOENCODING=utf-8
echo Starting AI Trip Planner Web App...
echo Please wait a moment, then open your browser to: http://localhost:8000
python -m uvicorn api:app --reload --host 0.0.0.0 --port 8000
pause
