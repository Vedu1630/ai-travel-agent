import sqlite3
import json
import os

DB_PATH = "travel_planner.db"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Trips table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS trips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origin TEXT,
        destination TEXT,
        start_date TEXT,
        end_date TEXT,
        days INTEGER,
        budget INTEGER,
        travelers INTEGER,
        style TEXT,
        interests TEXT,
        latitude REAL,
        longitude REAL,
        itinerary TEXT,
        hotels TEXT,
        attractions TEXT,
        restaurants TEXT,
        selected_hotel TEXT,
        weather TEXT,
        weather_forecast TEXT,
        packing_list TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # 2. Expenses table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id INTEGER,
        title TEXT,
        amount REAL,
        category TEXT,
        date TEXT,
        FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
    )
    """)
    
    # 3. Chat History table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id INTEGER,
        role TEXT,
        content TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
    )
    """)
    
    conn.commit()
    conn.close()
    print("✓ SQLite Database Initialized.")

def save_trip(trip_data):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
    INSERT INTO trips (
        origin, destination, start_date, end_date, days, budget, travelers, style, interests,
        latitude, longitude, itinerary, hotels, attractions, restaurants, selected_hotel, 
        weather, weather_forecast, packing_list
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        trip_data.get("origin", ""),
        trip_data.get("destination", ""),
        trip_data.get("start_date", ""),
        trip_data.get("end_date", ""),
        trip_data.get("days", 0),
        trip_data.get("budget", 0),
        trip_data.get("travelers", 1),
        trip_data.get("style", "comfort"),
        trip_data.get("interests", ""),
        trip_data.get("latitude"),
        trip_data.get("longitude"),
        trip_data.get("itinerary", ""),
        trip_data.get("hotels", ""),
        trip_data.get("attractions", ""),
        trip_data.get("restaurants", ""),
        trip_data.get("selected_hotel", ""),
        trip_data.get("weather", ""),
        trip_data.get("weather_forecast", ""),
        trip_data.get("packing_list", "")
    ))
    
    trip_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return trip_id

def get_all_trips():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, destination, start_date, end_date, days, budget, travelers, style 
        FROM trips ORDER BY created_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_trip(trip_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM trips WHERE id = ?", (trip_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def delete_trip(trip_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM trips WHERE id = ?", (trip_id,))
    # Delete related expenses & chats
    cursor.execute("DELETE FROM expenses WHERE trip_id = ?", (trip_id,))
    cursor.execute("DELETE FROM chat_history WHERE trip_id = ?", (trip_id,))
    conn.commit()
    conn.close()

def add_expense(trip_id, title, amount, category, date):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO expenses (trip_id, title, amount, category, date)
        VALUES (?, ?, ?, ?, ?)
    """, (trip_id, title, amount, category, date))
    expense_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return expense_id

def get_expenses(trip_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM expenses WHERE trip_id = ? ORDER BY date DESC, id DESC", (trip_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def delete_expense(expense_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
    conn.commit()
    conn.close()

def add_chat_message(trip_id, role, content):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO chat_history (trip_id, role, content)
        VALUES (?, ?, ?)
    """, (trip_id, role, content))
    conn.commit()
    conn.close()

def get_chat_history(trip_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT role, content, timestamp FROM chat_history WHERE trip_id = ? ORDER BY id ASC", (trip_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def update_trip_itinerary(trip_id, itinerary):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE trips SET itinerary = ? WHERE id = ?", (itinerary, trip_id))
    conn.commit()
    conn.close()

def update_trip_hotel(trip_id, hotel):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE trips SET selected_hotel = ? WHERE id = ?", (hotel, trip_id))
    conn.commit()
    conn.close()

def update_trip_budget(trip_id, new_budget):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE trips SET budget = ? WHERE id = ?", (new_budget, trip_id))
    conn.commit()
    conn.close()

def update_trip_packing_list(trip_id, packing_list):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE trips SET packing_list = ? WHERE id = ?", (packing_list, trip_id))
    conn.commit()
    conn.close()

def update_expense(expense_id, title, amount, category, date):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE expenses 
        SET title = ?, amount = ?, category = ?, date = ? 
        WHERE id = ?
    """, (title, amount, category, date, expense_id))
    conn.commit()
    conn.close()
