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
        user_email TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Run migration in case trips table already existed without user_email
    try:
        cursor.execute("ALTER TABLE trips ADD COLUMN user_email TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    # Update any legacy trips without owner to traveler@tripgenius.ai
    cursor.execute("UPDATE trips SET user_email = 'traveler@tripgenius.ai' WHERE user_email IS NULL OR user_email = ''")
    
    # 2. Expenses table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id INTEGER,
        title TEXT,
        amount REAL,
        category TEXT,
        date TEXT,
        paid_by TEXT,
        split_details TEXT,
        FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
    )
    """)
    
    # Run migration in case expenses table already existed without new columns
    try:
        cursor.execute("ALTER TABLE expenses ADD COLUMN paid_by TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    try:
        cursor.execute("ALTER TABLE expenses ADD COLUMN split_details TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    
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
    
    # 4. Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        home_airport TEXT,
        avatar TEXT,
        password TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Run migration in case users table already existed without password
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN password TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    # Import hashlib for seeding
    import hashlib
    def get_password_hash(pwd):
        return hashlib.sha256(pwd.encode()).hexdigest()
    
    # Seed default user if empty
    cursor.execute("SELECT COUNT(*) FROM users WHERE email = 'traveler@tripgenius.ai'")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            INSERT INTO users (name, email, home_airport, avatar, password)
            VALUES ('Traveler Genius', 'traveler@tripgenius.ai', 'Mumbai (BOM)', 
                    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80', ?)
        """, (get_password_hash("password123"),))
    else:
        # Update traveler's password to default if it's null/empty
        cursor.execute("UPDATE users SET password = ? WHERE email = 'traveler@tripgenius.ai' AND (password IS NULL OR password = '')", (get_password_hash("password123"),))
        
    # Seed default admin if empty
    cursor.execute("SELECT COUNT(*) FROM users WHERE email = 'admin@tripgenius.ai'")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            INSERT INTO users (name, email, home_airport, avatar, password)
            VALUES ('Platform Admin', 'admin@tripgenius.ai', 'Mumbai (BOM)', 
                    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80', ?)
        """, (get_password_hash("admin123"),))
    
    # 5. Collaborators Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS collaborators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id INTEGER,
        email TEXT,
        role TEXT DEFAULT 'editor',
        FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
    )
    """)
    
    # 6. Stories Table (Community Posts)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS stories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        author_name TEXT,
        likes INTEGER DEFAULT 0,
        image_url TEXT,
        trip_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE SET NULL
    )
    """)
    
    # Insert default mock stories if empty to seed the feed
    cursor.execute("SELECT COUNT(*) FROM stories")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            INSERT INTO stories (title, content, author_name, likes, image_url)
            VALUES ('Sunsets & Beaches in North Goa', 'Spent 5 days traveling around Vagator, Arambol, and Panaji. Highlights included snorkeling, visiting old churches, and eating local fish thali!', 'Jane Doe', 12, 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80')
        """)
        cursor.execute("""
            INSERT INTO stories (title, content, author_name, likes, image_url)
            VALUES ('Exploring the Palaces of Rajasthan', 'A visual journey through Jaipur and Udaipur. Visited the Amber Fort, City Palace, and took a boat tour on Lake Pichola at sunset.', 'Alex Explorer', 24, 'https://images.unsplash.com/photo-1477584322813-acced97ad76e?auto=format&fit=crop&w=800&q=80')
        """)
    
    conn.commit()
    conn.close()
    print("✓ SQLite Database Initialized.")

def save_trip(trip_data, user_email=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
    INSERT INTO trips (
        origin, destination, start_date, end_date, days, budget, travelers, style, interests,
        latitude, longitude, itinerary, hotels, attractions, restaurants, selected_hotel, 
        weather, weather_forecast, packing_list, user_email
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        trip_data.get("packing_list", ""),
        user_email
    ))
    
    trip_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return trip_id

def get_all_trips(user_email=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    if user_email:
        cursor.execute("""
            SELECT DISTINCT t.id, t.destination, t.start_date, t.end_date, t.days, t.budget, t.travelers, t.style 
            FROM trips t
            LEFT JOIN collaborators c ON t.id = c.trip_id
            WHERE t.user_email = ? OR c.email = ?
            ORDER BY t.created_at DESC
        """, (user_email, user_email))
    else:
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

def add_expense(trip_id, title, amount, category, date, paid_by=None, split_details=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO expenses (trip_id, title, amount, category, date, paid_by, split_details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (trip_id, title, amount, category, date, paid_by, split_details))
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

def update_expense(expense_id, title, amount, category, date, paid_by=None, split_details=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE expenses 
        SET title = ?, amount = ?, category = ?, date = ?, paid_by = ?, split_details = ? 
        WHERE id = ?
    """, (title, amount, category, date, paid_by, split_details, expense_id))
    conn.commit()
    conn.close()

# ==========================================
# SAAS MODULES DATABASE HELPERS
# ==========================================

def get_user_profile(email=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    if email:
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    else:
        cursor.execute("SELECT * FROM users ORDER BY id ASC LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def update_user_profile(name, email, home_airport, avatar):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Check if a user exists by email
    cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
    row = cursor.fetchone()
    if row:
        cursor.execute("""
            UPDATE users 
            SET name = ?, home_airport = ?, avatar = ?
            WHERE id = ?
        """, (name, home_airport, avatar, row['id']))
    else:
        cursor.execute("""
            INSERT INTO users (name, email, home_airport, avatar)
            VALUES (?, ?, ?, ?)
        """, (name, email, home_airport, avatar))
    conn.commit()
    conn.close()

def add_collaborator(trip_id, email):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Check if duplicate exists
    cursor.execute("SELECT id FROM collaborators WHERE trip_id = ? AND email = ?", (trip_id, email))
    if not cursor.fetchone():
        cursor.execute("""
            INSERT INTO collaborators (trip_id, email)
            VALUES (?, ?)
        """, (trip_id, email))
        conn.commit()
    conn.close()

def get_collaborators(trip_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM collaborators WHERE trip_id = ?", (trip_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def delete_collaborator(trip_id, email):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM collaborators WHERE trip_id = ? AND email = ?", (trip_id, email))
    conn.commit()
    conn.close()

def get_stories():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM stories ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_story(title, content, author_name, image_url, trip_id=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO stories (title, content, author_name, image_url, trip_id)
        VALUES (?, ?, ?, ?, ?)
    """, (title, content, author_name, image_url, trip_id))
    story_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return story_id

def like_story(story_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE stories SET likes = likes + 1 WHERE id = ?", (story_id,))
    conn.commit()
    conn.close()

def update_trip_coordinates(trip_id, lat, lon):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE trips SET latitude = ?, longitude = ? WHERE id = ?", (lat, lon, trip_id))
    conn.commit()
    conn.close()


