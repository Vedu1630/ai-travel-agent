<div align="center">

# ✈️ AI Travel Agent & Trip Planner

**A full-stack generative AI application that designs personalized day-by-day travel itineraries, tracks expenses, maps locations, and curates weather-aware packing lists — all in one place.**

[![Python](https://img.shields.io/badge/Python-3.9%2B-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Gemini](https://img.shields.io/badge/Google%20Gemini-AI%20Core-4285F4?style=flat-square&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![SQLite](https://img.shields.io/badge/SQLite-Storage-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

[Features](#-features) · [Architecture](#-system-architecture) · [Agent Workflow](#-agent-workflow) · [Tech Stack](#️-tech-stack) · [Getting Started](#-getting-started) · [API Reference](#-api-reference) · [Project Structure](#-project-structure)

### 🔗 Live Demo: [ai-travel-agent-2.onrender.com](https://ai-travel-agent-2.onrender.com/)

</div>

---

## 🌟 Overview

Sojourn is a premium generative AI travel planning application. Enter your destination, travel dates, budget, and interests — and the AI agent orchestrates a full pipeline of real-time data collection (geolocation, weather, hotels, attractions, restaurants) before synthesizing a richly detailed, personalized itinerary using Google Gemini.

After planning, a context-aware **AI Chat Assistant** lets you live-modify your trip ("reduce my budget by 20%", "add beach activities on Day 3") and Sojourn updates your itinerary, budget, and hotel selection in real time.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🗓️ **Bespoke Day-by-Day Itinerary** | Meals, sightseeing, transport, and hotel stays tailored to your style and interests |
| 💰 **Budget Tracking** | Projected cost breakdown + real expense logging with category-wise Chart.js visualizations |
| 🗺️ **Interactive Map** | Hotels, attractions, and restaurants pinned live on a Leaflet.js / OpenStreetMap canvas |
| 🌦️ **Weather-Aware Packing** | Checklist generated from a 5-day OpenWeatherMap forecast with add/delete controls |
| 💬 **AI Chat Assistant** | Context-aware chat to replan on the fly — changes persist to the database automatically |
| 🖨️ **PDF / Print Export** | Clean print stylesheets for sharing your itinerary or saving it offline |
| 💾 **Persistent Storage** | All trips, expenses, and chat logs saved to SQLite via FastAPI |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          USER BROWSER                                   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │           Static Frontend  (HTML5 + TailwindCSS + app.js)        │   │
│  │                                                                  │   │
│  │   ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐    │   │
│  │   │  Trip Form  │  │ Leaflet Map  │  │  Chart.js Budgets   │    │   │
│  │   └──────┬──────┘  └──────────────┘  └─────────────────────┘    │   │
│  └──────────┼─────────────────────────────────────────────────────-─┘   │
│             │  HTTP / REST (JSON)                                        │
└─────────────┼───────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        FastAPI Backend  (api.py)                        │
│                                                                         │
│   POST /api/plan  ·  GET /api/trips  ·  POST /api/trips/{id}/chat       │
│   POST /api/trips/{id}/expenses  ·  DELETE /api/trips/{id}  · …        │
│                                                                         │
│              ┌───────────────────────────────┐                          │
│              │      SQLite Database          │                          │
│              │  trips · expenses · chat_log  │                          │
│              └───────────────────────────────┘                          │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │  Invokes
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    TripPlannerAgent  (agent.py)                         │
│                                                                         │
│   ① geocode_city      → Geoapify Geocoding API                         │
│   ② weather_forecast  → OpenWeatherMap Forecast API                    │
│   ③ attraction_tool   → Geoapify Places API (tourism.sights)           │
│   ④ web_search_tool   → DuckDuckGo Search (DDGS)                       │
│   ⑤ hotel_tool        → Geoapify Places API (accommodation.hotel)      │
│   ⑥ restaurant_tool   → Geoapify Places API (catering.restaurant)      │
│   ⑦ travel_profile    → Google Gemini LLM                              │
│   ⑧ hotel_selection   → Google Gemini LLM                              │
│   ⑨ packing_assistant → Google Gemini LLM                              │
│   ⑩ itinerary_tool    → Google Gemini LLM  ──► Final Itinerary         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Agent Workflow

The `TripPlannerAgent` runs a **sequential, multi-step pipeline** every time a trip is planned. Each step enriches the shared `AgentState` object before the final LLM synthesis.

```
User Input
(destination, dates, budget, style, interests)
        │
        ▼
┌───────────────────┐
│  1. Geocoding     │  city name → latitude / longitude (Geoapify)
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  2. Weather       │  5-day forecast from lat/lon (OpenWeatherMap)
└────────┬──────────┘
         │
         ▼
┌───────────────────────────────────────────────────────┐
│  3–6. Parallel Data Collection  (Geoapify + DDG)      │
│                                                       │
│   ├─ Attractions  (top 20 tourism sights, 50km)       │
│   ├─ Web Search   (hotel prices via DuckDuckGo)       │
│   ├─ Hotels       (top 20 hotels, 30km)               │
│   └─ Restaurants  (top 20 restaurants, 30km)          │
└────────┬──────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│  7. Travel Profile (LLM)   │  Persona + daily budget + style mapping
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│  8. Hotel Selection (LLM)  │  Best hotel chosen from real API data
└────────┬───────────────────┘
         │
         ▼
┌──────────────────────────────┐
│  9. Packing Assistant (LLM)  │  Weather-aware, interest-specific checklist
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  10. Itinerary Generation (LLM)                          │
│                                                          │
│  Combines: profile + hotel + attractions + restaurants   │
│  + weather + budget → Full day-by-day plan               │
│  + transport advice + cost breakdown + travel tips       │
└────────┬─────────────────────────────────────────────────┘
         │
         ▼
  Saved to SQLite  →  Returned to Frontend
```

### AI Chat Modification Flow

After a trip is planned, the **Chat Assistant** enables live replanning:

```
User Chat Message
       │
       ▼
FastAPI /api/trips/{id}/chat
       │
       ├─ Load trip context from SQLite
       ├─ Load last 5 messages (conversation memory)
       └─ Call Gemini with system prompt + full trip state
              │
              ▼
       Structured JSON Response:
         ├─ message         → shown in chat UI
         ├─ updated_itinerary → persisted if changed
         ├─ updated_budget    → persisted if changed
         └─ updated_selected_hotel → persisted if changed
```

---

## 🛠️ Tech Stack

**Frontend**
- HTML5 / Vanilla JavaScript (ES6+)
- TailwindCSS (CDN) + custom CSS theme
- [Leaflet.js](https://leafletjs.com/) — interactive maps via OpenStreetMap
- [Chart.js](https://www.chartjs.org/) — budget and expense visualizations
- [Marked.js](https://marked.js.org/) — Markdown rendering for itineraries

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) — REST API framework
- [Uvicorn](https://www.uvicorn.org/) — ASGI server
- [Pydantic](https://docs.pydantic.dev/) — request/response validation
- SQLite3 — persistent trip, expense & chat storage

**AI & External APIs**
- [Google Gemini](https://deepmind.google/technologies/gemini/) (via OpenAI-compatible client) — LLM core
- [Geoapify](https://www.geoapify.com/) — geocoding, hotels, attractions, restaurants
- [OpenWeatherMap](https://openweathermap.org/) — 5-day weather forecast
- [DuckDuckGo Search (DDGS)](https://github.com/deedy5/duckduckgo_search) — live hotel price search

---

## 🚀 Getting Started

### Prerequisites

- Python **3.9+**
- A [Geoapify](https://www.geoapify.com/) API key (free tier available)
- An [OpenWeatherMap](https://openweathermap.org/api) API key (free tier available)
- A [Google Gemini](https://aistudio.google.com/) API key

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/Vedu1630/ai-travel-agent.git
cd ai-travel-agent
```

**2. Create and activate a virtual environment**
```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

**3. Install dependencies**
```bash
pip install -r requirements.txt
```

**4. Configure environment variables**

Create a `.env` file in the project root:
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEOAPIFY_API_KEY=your_geoapify_api_key_here
WEATHER_API_KEY=your_openweathermap_api_key_here
```

**5. Start the server**
```bash
python -m uvicorn api:app --host 127.0.0.1 --port 8000 --reload
```

Open **http://127.0.0.1:8000** in your browser.

> **Windows shortcut:** Run `run.bat` to start the server automatically.

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/plan` | Generate a new trip plan (triggers the full agent pipeline) |
| `GET` | `/api/trips` | List all saved trips |
| `GET` | `/api/trips/{id}` | Get full trip details including expenses |
| `DELETE` | `/api/trips/{id}` | Delete a saved trip |
| `PATCH` | `/api/trips/{id}` | Update packing list or itinerary |
| `POST` | `/api/trips/{id}/expenses` | Log a new expense for a trip |
| `PUT` | `/api/expenses/{id}` | Edit an existing expense |
| `DELETE` | `/api/expenses/{id}` | Remove an expense |
| `GET` | `/api/trips/{id}/chat` | Fetch chat history for a trip |
| `POST` | `/api/trips/{id}/chat` | Send a message to the AI chat assistant |

### Example: Plan a Trip

```bash
curl -X POST http://127.0.0.1:8000/api/plan \
  -H "Content-Type: application/json" \
  -d '{
    "origin": "Mumbai",
    "destination": "Goa",
    "start_date": "2025-12-20",
    "end_date": "2025-12-25",
    "days": 5,
    "budget": 30000,
    "travelers": 2,
    "style": "comfort",
    "interests": "beaches, seafood, nightlife"
  }'
```

---

## 📂 Project Structure

```
ai-travel-agent/
│
├── static/
│   ├── index.html        # Single-page application — UI templates & layout
│   ├── style.css         # CSS theme, custom utility classes, print styles
│   └── app.js            # Frontend router, state manager, API client
│
├── api.py                # FastAPI app — all HTTP routes & endpoints
├── agent.py              # TripPlannerAgent — sequential pipeline orchestrator
├── tools.py              # All external API tool functions (geo, weather, LLM)
├── state.py              # AgentState dataclass — shared pipeline state container
├── database.py           # SQLite schema, init, and CRUD query helpers
├── config.py             # API key & LLM client configuration loader
├── requirements.txt      # Python package dependencies
└── run.bat               # Windows startup script
```

### Key Module Responsibilities

| File | Responsibility |
|---|---|
| `agent.py` | Orchestrates the 10-step planning pipeline in sequence |
| `tools.py` | All external integrations: Geoapify, OpenWeatherMap, DuckDuckGo, Gemini LLM prompts |
| `state.py` | Single `AgentState` object that accumulates data across pipeline steps |
| `api.py` | REST API layer, chat handler with live DB updates, static file serving |
| `database.py` | SQLite schema (trips, expenses, chat_log) and all CRUD helpers |

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push and open a Pull Request

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

<div align="center">
Built with ❤️ by <a href="https://github.com/Vedu1630">Vedu1630</a>
</div>
