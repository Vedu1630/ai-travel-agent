import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from fastapi import FastAPI, HTTPException, Depends, Cookie, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
import uvicorn
import json
import traceback

from state import AgentState
from agent import TripPlannerAgent
import database

app = FastAPI(title="TripGenius AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SQLite database initialization
@app.on_event("startup")
def startup_event():
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
    selected_hotel: str = None
    latitude: float = None
    longitude: float = None

class ChatRequest(BaseModel):
    message: str

class ProfileUpdate(BaseModel):
    name: str
    email: str
    home_airport: str
    avatar: str

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str

async def get_current_user_email(session_email: Optional[str] = Cookie(None)):
    if not session_email:
        raise HTTPException(status_code=401, detail="Unauthorized: Please log in")
    return session_email

def check_trip_auth(trip_id: int, user_email: str):
    trip = database.get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.get("user_email") == user_email:
        return trip
    collaborators = database.get_collaborators(trip_id)
    if any(c.get("email") == user_email for c in collaborators):
        return trip
    raise HTTPException(status_code=403, detail="Forbidden: You do not have access to this trip")

class CollaboratorRequest(BaseModel):
    email: str

class StoryRequest(BaseModel):
    title: str
    content: str
    author_name: str
    image_url: str
    trip_id: int = None

class SplitExpenseRequest(BaseModel):
    title: str
    amount: float
    category: str
    date: str
    paid_by: str = None
    split_details: str = None

# ==========================================
# AUTHENTICATION ROUTING
# ==========================================

@app.post("/api/auth/register")
async def register(req: RegisterRequest, response: Response):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE email = ?", (req.email,))
    row = cursor.fetchone()
    if row:
        conn.close()
        raise HTTPException(status_code=400, detail="User already registered with this email")
        
    import hashlib
    hashed = hashlib.sha256(req.password.encode()).hexdigest()
    
    try:
        cursor.execute("""
            INSERT INTO users (name, email, password, home_airport, avatar)
            VALUES (?, ?, ?, 'Mumbai (BOM)', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80')
        """, (req.name, req.email, hashed))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))
        
    conn.close()
    response.set_cookie(key="session_email", value=req.email, httponly=False, max_age=86400 * 30, path="/")
    return {"status": "success", "email": req.email}

@app.post("/api/auth/login")
async def login(req: LoginRequest, response: Response):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT password FROM users WHERE email = ?", (req.email,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=400, detail="Invalid email or password")
        
    import hashlib
    hashed = hashlib.sha256(req.password.encode()).hexdigest()
    if row['password'] != hashed:
        raise HTTPException(status_code=400, detail="Invalid email or password")
        
    response.set_cookie(key="session_email", value=req.email, httponly=False, max_age=86400 * 30, path="/")
    return {"status": "success", "email": req.email}

@app.post("/api/auth/logout")
async def logout(response: Response):
    response.delete_cookie(key="session_email", path="/")
    return {"status": "success"}

@app.get("/api/auth/me")
async def get_me(session_email: Optional[str] = Cookie(None)):
    if not session_email:
        return {"authenticated": False}
    profile = database.get_user_profile(session_email)
    if not profile:
        return {"authenticated": False}
    return {"authenticated": True, "email": session_email, "name": profile.get("name")}

# API Endpoints
@app.post("/api/plan")
async def generate_trip_plan(req: TripRequest, user_email: str = Depends(get_current_user_email)):
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
        
        trip_id = database.save_trip(trip_data, user_email)
        return {"id": trip_id, **trip_data}
        
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/trips")
async def list_saved_trips(user_email: str = Depends(get_current_user_email)):
    try:
        return database.get_all_trips(user_email)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/trips/{id}")
async def get_trip_details(id: int, user_email: str = Depends(get_current_user_email)):
    try:
        trip = check_trip_auth(id, user_email)
        expenses = database.get_expenses(id)
        return {**trip, "expenses": expenses}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/trips/{id}")
async def delete_saved_trip(id: int, user_email: str = Depends(get_current_user_email)):
    try:
        trip = database.get_trip(id)
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        if trip.get("user_email") != user_email:
            raise HTTPException(status_code=403, detail="Forbidden: Only the trip owner can delete this trip")
        database.delete_trip(id)
        return {"status": "success"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/trips/{id}/expenses")
async def log_trip_expense(id: int, req: SplitExpenseRequest, user_email: str = Depends(get_current_user_email)):
    try:
        check_trip_auth(id, user_email)
        exp_id = database.add_expense(id, req.title, req.amount, req.category, req.date, req.paid_by, req.split_details)
        return {
            "id": exp_id,
            "trip_id": id,
            "title": req.title,
            "amount": req.amount,
            "category": req.category,
            "date": req.date,
            "paid_by": req.paid_by,
            "split_details": req.split_details
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/expenses/{id}")
async def remove_logged_expense(id: int, user_email: str = Depends(get_current_user_email)):
    try:
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT trip_id FROM expenses WHERE id = ?", (id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Expense not found")
        
        check_trip_auth(row['trip_id'], user_email)
        database.delete_expense(id)
        return {"status": "success"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/trips/{id}/chat")
async def fetch_chat_log(id: int, user_email: str = Depends(get_current_user_email)):
    try:
        check_trip_auth(id, user_email)
        return database.get_chat_history(id)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/trips/{id}/chat")
async def chat_with_agent(id: int, req: ChatRequest, user_email: str = Depends(get_current_user_email)):
    try:
        trip = check_trip_auth(id, user_email)
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
        
        def force_string(val):
            if val is None:
                return ""
            if isinstance(val, list):
                return "\n".join(force_string(item) for item in val)
            if isinstance(val, dict):
                return json.dumps(val, indent=2)
            return str(val)

        assistant_msg = force_string(res_data.get("message", ""))
        updated_it = force_string(res_data.get("updated_itinerary", ""))
        updated_ht = force_string(res_data.get("updated_selected_hotel", ""))
        
        raw_bg = res_data.get("updated_budget")
        updated_bg = None
        if raw_bg is not None and raw_bg != "":
            try:
                if isinstance(raw_bg, list) and len(raw_bg) > 0:
                    raw_bg = raw_bg[0]
                updated_bg = int(float(str(raw_bg).replace("INR", "").replace(",", "").strip()))
            except Exception:
                pass
        
        # Update Database fields if changed by the agent
        if updated_it:
            database.update_trip_itinerary(id, updated_it)
        if updated_bg:
            database.update_trip_budget(id, updated_bg)
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
async def update_trip_fields(id: int, req: TripUpdate, user_email: str = Depends(get_current_user_email)):
    try:
        check_trip_auth(id, user_email)
        if req.packing_list is not None:
            database.update_trip_packing_list(id, req.packing_list)
        if req.itinerary is not None:
            database.update_trip_itinerary(id, req.itinerary)
        if req.selected_hotel is not None:
            database.update_trip_hotel(id, req.selected_hotel)
        if req.latitude is not None and req.longitude is not None:
            database.update_trip_coordinates(id, req.latitude, req.longitude)
        return {"status": "success"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/expenses/{id}")
async def edit_expense(id: int, req: SplitExpenseRequest, user_email: str = Depends(get_current_user_email)):
    try:
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT trip_id FROM expenses WHERE id = ?", (id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Expense not found")
        check_trip_auth(row['trip_id'], user_email)
        database.update_expense(id, req.title, req.amount, req.category, req.date, req.paid_by, req.split_details)
        return {"status": "success"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# SAAS APP MODULES API ROUTING
# ==========================================

@app.get("/api/profile")
async def get_profile(user_email: str = Depends(get_current_user_email)):
    try:
        profile = database.get_user_profile(user_email)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        return profile
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/profile")
async def update_profile(req: ProfileUpdate, user_email: str = Depends(get_current_user_email)):
    try:
        database.update_user_profile(req.name, user_email, req.home_airport, req.avatar)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/trips/{id}/collaborators")
async def get_collaborators(id: int, user_email: str = Depends(get_current_user_email)):
    try:
        check_trip_auth(id, user_email)
        return database.get_collaborators(id)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/trips/{id}/collaborators")
async def add_collaborator(id: int, req: CollaboratorRequest, user_email: str = Depends(get_current_user_email)):
    try:
        trip = check_trip_auth(id, user_email)
        if trip.get("user_email") != user_email:
            raise HTTPException(status_code=403, detail="Forbidden: Only the owner can manage collaborators")
        database.add_collaborator(id, req.email)
        return database.get_collaborators(id)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/trips/{id}/collaborators/{email}")
async def remove_collaborator(id: int, email: str, user_email: str = Depends(get_current_user_email)):
    try:
        trip = check_trip_auth(id, user_email)
        if trip.get("user_email") != user_email:
            raise HTTPException(status_code=403, detail="Forbidden: Only the owner can manage collaborators")
        database.delete_collaborator(id, email)
        return {"status": "success"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stories")
async def get_stories():
    try:
        return database.get_stories()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/stories")
async def add_story(req: StoryRequest):
    try:
        story_id = database.add_story(req.title, req.content, req.author_name, req.image_url, req.trip_id)
        return {"status": "success", "id": story_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/stories/{id}/like")
async def like_story(id: int):
    try:
        database.like_story(id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/trips/{id}/clone")
async def clone_trip(id: int, user_email: str = Depends(get_current_user_email)):
    try:
        check_trip_auth(id, user_email)
        trip = database.get_trip(id)
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        
        new_trip = dict(trip)
        new_trip.pop("id", None)
        new_trip.pop("created_at", None)
        new_trip["destination"] = f"{new_trip['destination']} (Cloned)"
        
        new_id = database.save_trip(new_trip, user_email)
        return {"status": "success", "id": new_id}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/metrics")
async def get_admin_metrics(user_email: str = Depends(get_current_user_email)):
    # Restrict to admin user
    if user_email != "admin@tripgenius.ai":
        raise HTTPException(status_code=403, detail="Forbidden: Admin access only")
    try:
        conn = database.get_db_connection()
        cursor = conn.cursor()
        
        # 1. Total trips planned
        cursor.execute("SELECT COUNT(*) FROM trips")
        trips_count = cursor.fetchone()[0]
        
        # 2. Total budget spent
        cursor.execute("SELECT SUM(amount) FROM expenses")
        expenses_sum = cursor.fetchone()[0] or 0.0
        
        # 3. Active users
        cursor.execute("SELECT COUNT(*) FROM users")
        users_count = cursor.fetchone()[0]
        
        # 4. Popular destinations list
        cursor.execute("""
            SELECT destination, COUNT(*) as count 
            FROM trips 
            GROUP BY destination 
            ORDER BY count DESC 
            LIMIT 5
        """)
        dest_rows = cursor.fetchall()
        popular_destinations = [{"destination": r['destination'], "count": r['count']} for r in dest_rows]
        
        conn.close()
        
        return {
            "trips_count": trips_count,
            "expenses_sum": expenses_sum,
            "users_count": users_count,
            "popular_destinations": popular_destinations,
            "system_status": "Healthy",
            "active_sessions": 4  # Simulated active browser sessions
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("api:app", host="0.0.0.0", port=port, reload=True)
