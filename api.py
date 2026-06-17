import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn
import json
import traceback

from state import AgentState
from agent import TripPlannerAgent
import database

app = FastAPI(title="AI Travel Planner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SQLite database initialization
@app.on_event("startup")
def startup_db():
    database.init_db()

# Pydantic Schemas
class TripRequest(BaseModel):
    origin: str
    destination: str
    start_date: str
    end_date: str
    days: int
    budget: int
    travelers: int = 1
    style: str = "comfort"
    interests: str = ""

class ExpenseRequest(BaseModel):
    title: str
    amount: float
    category: str
    date: str

class ExpenseUpdate(BaseModel):
    title: str
    amount: float
    category: str
    date: str

class TripUpdate(BaseModel):
    packing_list: str = None
    itinerary: str = None

class ChatRequest(BaseModel):
    message: str

# API Endpoints
@app.post("/api/plan")
async def generate_trip_plan(req: TripRequest):
    try:
        state = AgentState()
        state.origin = req.origin
        state.destination = req.destination
        state.start_date = req.start_date
        state.end_date = req.end_date
        state.days = req.days
        state.budget = req.budget
        state.travelers = req.travelers
        state.style = req.style
        state.interests = req.interests
        
        agent = TripPlannerAgent(state)
        itinerary = agent.run()
        
        if itinerary and "ERROR" in itinerary:
            raise HTTPException(status_code=400, detail=itinerary)
            
        # Create dictionary to save to database
        trip_data = {
            "origin": state.origin,
            "destination": state.destination,
            "start_date": state.start_date,
            "end_date": state.end_date,
            "days": state.days,
            "budget": state.budget,
            "travelers": state.travelers,
            "style": state.style,
            "interests": state.interests,
            "latitude": state.latitude,
            "longitude": state.longitude,
            "itinerary": state.itinerary,
            "hotels": state.hotels,
            "attractions": state.attractions,
            "restaurants": state.restaurants,
            "selected_hotel": state.selected_hotel,
            "weather": state.weather,
            "weather_forecast": state.weather_forecast,
            "packing_list": state.packing_list
        }
        
        trip_id = database.save_trip(trip_data)
        return {"id": trip_id, **trip_data}
        
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/trips")
async def list_saved_trips():
    try:
        return database.get_all_trips()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/trips/{id}")
async def get_trip_details(id: int):
    try:
        trip = database.get_trip(id)
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        expenses = database.get_expenses(id)
        return {**trip, "expenses": expenses}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/trips/{id}")
async def delete_saved_trip(id: int):
    try:
        database.delete_trip(id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/trips/{id}/expenses")
async def log_trip_expense(id: int, req: ExpenseRequest):
    try:
        exp_id = database.add_expense(id, req.title, req.amount, req.category, req.date)
        return {
            "id": exp_id,
            "trip_id": id,
            "title": req.title,
            "amount": req.amount,
            "category": req.category,
            "date": req.date
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/expenses/{id}")
async def remove_logged_expense(id: int):
    try:
        database.delete_expense(id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/trips/{id}/chat")
async def fetch_chat_log(id: int):
    try:
        return database.get_chat_history(id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/trips/{id}/chat")
async def chat_with_agent(id: int, req: ChatRequest):
    try:
        trip = database.get_trip(id)
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
            
        history = database.get_chat_history(id)
        
        # Save user message
        database.add_chat_message(id, "user", req.message)
        
        # Build prompt context
        messages = [
            {
                "role": "system",
                "content": f"""You are AI Assistant, a professional AI travel assistant.
You are helping a traveler manage their active trip plan.
Here is the current saved trip details:
- Destination: {trip['destination']}
- Origin: {trip['origin']}
- Budget: {trip['budget']} INR
- Style: {trip['style']}
- Duration: {trip['days']} days
- Dates: {trip['start_date']} to {trip['end_date']}
- Travelers: {trip['travelers']}
- Selected Hotel: {trip['selected_hotel']}
- Attractions: {trip['attractions']}
- Restaurants: {trip['restaurants']}

Current Itinerary:
{trip['itinerary']}

If the user asks to replan (e.g. reduce budget, add adventure, change style, extend days, etc.), you MUST output a JSON response containing:
1. "message": Your direct explanation of the changes made.
2. "updated_itinerary": The complete day-by-day updated itinerary (only if the itinerary changes, otherwise empty).
3. "updated_budget": The new total budget in INR as an integer (only if the budget changes, otherwise empty/null).
4. "updated_selected_hotel": The new selected hotel details (only if the hotel changes, otherwise empty).

If the user is just asking a question (e.g., weather tips, packing advice, local recommendations), output a JSON response containing:
1. "message": Your helpful response written in clean Markdown.
2. "updated_itinerary": ""
3. "updated_budget": null
4. "updated_selected_hotel": ""

Output ONLY raw valid JSON matching this format:
{{
  "message": "...",
  "updated_itinerary": "...",
  "updated_budget": null,
  "updated_selected_hotel": ""
}}
Do NOT output any prefix, suffix, or markdown code fences (like ```json). Just the raw JSON string."""
            }
        ]
        
        # Append last 5 chat messages for context
        for m in history[-5:]:
            messages.append({"role": m["role"], "content": m["content"]})
            
        # Append the new user message
        messages.append({"role": "user", "content": req.message})
        
        from config import client, MODEL
        
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages
        )
        
        reply_text = response.choices[0].message.content.strip()
        
        # Strip markdown fences if present
        if reply_text.startswith("```"):
            reply_text = reply_text.strip("`").replace("json\n", "").strip()
            
        res_data = json.loads(reply_text)
        
        assistant_msg = res_data.get("message", "")
        updated_it = res_data.get("updated_itinerary", "")
        updated_bg = res_data.get("updated_budget")
        updated_ht = res_data.get("updated_selected_hotel", "")
        
        # Update Database fields if changed by the agent
        if updated_it:
            database.update_trip_itinerary(id, updated_it)
        if updated_bg:
            database.update_trip_budget(id, int(updated_bg))
        if updated_ht:
            database.update_trip_hotel(id, updated_ht)
            
        # Save assistant message to DB
        database.add_chat_message(id, "assistant", assistant_msg)
        
        return {
            "message": assistant_msg,
            "updated_itinerary": updated_it,
            "updated_budget": updated_bg,
            "updated_selected_hotel": updated_ht
        }
        
    except Exception as e:
        traceback.print_exc()
        fallback_msg = f"I'm sorry, I encountered an error processing your chat. Details: {str(e)}"
        database.add_chat_message(id, "assistant", fallback_msg)
        return {
            "message": fallback_msg,
            "updated_itinerary": "",
            "updated_budget": None,
            "updated_selected_hotel": ""
        }

@app.patch("/api/trips/{id}")
async def update_trip_fields(id: int, req: TripUpdate):
    try:
        if req.packing_list is not None:
            database.update_trip_packing_list(id, req.packing_list)
        if req.itinerary is not None:
            database.update_trip_itinerary(id, req.itinerary)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/expenses/{id}")
async def edit_expense(id: int, req: ExpenseUpdate):
    try:
        database.update_expense(id, req.title, req.amount, req.category, req.date)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
