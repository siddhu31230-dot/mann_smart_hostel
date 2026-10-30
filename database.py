import sqlite3
import os
import hashlib
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hostel.db')

def get_db_path():
    return os.environ.get('HOSTEL_DB_PATH', DB_PATH)

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def get_db():
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db(drop_existing=False):
    conn = get_db()
    cursor = conn.cursor()

    if drop_existing:
        cursor.execute("PRAGMA foreign_keys = OFF")
        tables = ['wellness_appointments', 'facility_bookings', 'food_feedback', 'mess_menu', 
                  'leave_requests', 'complaints', 'bed_allocations', 'rooms', 'users']
        for t in tables:
            cursor.execute(f"DROP TABLE IF EXISTS {t}")
        cursor.execute("PRAGMA foreign_keys = ON")

    # 1. Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('student', 'warden', 'maintenance', 'mess_manager', 'counsellor', 'admin')),
        email TEXT UNIQUE NOT NULL,
        room_number TEXT,
        bed_number TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 2. Rooms table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_number TEXT UNIQUE NOT NULL,
        block TEXT NOT NULL,
        floor INTEGER NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 2,
        room_type TEXT NOT NULL DEFAULT 'AC',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 3. Bed Allocations table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS bed_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        bed_label TEXT NOT NULL,
        student_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'Vacant' CHECK(status IN ('Vacant', 'Allocated')),
        allocated_at TIMESTAMP,
        UNIQUE(room_id, bed_label)
    )
    """)

    # 4. Complaints table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS complaints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES users(id),
        category TEXT NOT NULL CHECK(category IN ('Electrical', 'Plumbing', 'Carpentry', 'Appliance', 'Cleanliness', 'Internet')),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        room_number TEXT NOT NULL,
        urgency TEXT NOT NULL DEFAULT 'Medium' CHECK(urgency IN ('Low', 'Medium', 'High', 'Emergency')),
        status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open', 'Assigned', 'In Progress', 'Resolved', 'Closed')),
        assigned_staff_id INTEGER REFERENCES users(id),
        warden_notes TEXT,
        resolution_notes TEXT,
        student_rating INTEGER CHECK(student_rating IS NULL OR (student_rating >= 1 AND student_rating <= 5)),
        student_feedback TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 5. Leave Requests table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS leave_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES users(id),
        leave_type TEXT NOT NULL CHECK(leave_type IN ('Home Visit', 'Medical', 'Emergency', 'Academic')),
        departure_date TEXT NOT NULL,
        return_date TEXT NOT NULL,
        reason TEXT NOT NULL,
        parent_contact TEXT NOT NULL,
        destination_address TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Rejected')),
        reviewed_by INTEGER REFERENCES users(id),
        warden_remarks TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP
    )
    """)

    # 6. Mess Menu table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS mess_menu (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day_of_week TEXT NOT NULL CHECK(day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
        meal_type TEXT NOT NULL CHECK(meal_type IN ('Breakfast', 'Lunch', 'Snacks', 'Dinner')),
        items TEXT NOT NULL,
        dietary_type TEXT NOT NULL DEFAULT 'Veg' CHECK(dietary_type IN ('Veg', 'Non-Veg', 'Jain')),
        special_notes TEXT,
        updated_by INTEGER REFERENCES users(id),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(day_of_week, meal_type)
    )
    """)

    # 7. Food Feedback table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS food_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES users(id),
        meal_type TEXT NOT NULL CHECK(meal_type IN ('Breakfast', 'Lunch', 'Snacks', 'Dinner')),
        rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
        hygiene_rating INTEGER NOT NULL CHECK(hygiene_rating >= 1 AND hygiene_rating <= 5),
        comments TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 8. Facility Bookings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS facility_bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES users(id),
        facility_name TEXT NOT NULL CHECK(facility_name IN ('Study Room', 'Table Tennis', 'Badminton Court', 'Gym Slot', 'Music Room', 'Laundry Slot')),
        booking_date TEXT NOT NULL,
        slot_time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Confirmed' CHECK(status IN ('Confirmed', 'Cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(facility_name, booking_date, slot_time)
    )
    """)

    # 9. Wellness Appointments (Confidential)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS wellness_appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES users(id),
        counsellor_id INTEGER REFERENCES users(id),
        preferred_date TEXT NOT NULL,
        preferred_time TEXT NOT NULL,
        session_mode TEXT NOT NULL CHECK(session_mode IN ('In-Person', 'Online')),
        issue_category TEXT NOT NULL CHECK(issue_category IN ('Academic Stress', 'Anxiety & Overwhelm', 'Homesickness', 'Interpersonal Conflict', 'General Well-being')),
        confidential_notes TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Confirmed', 'Completed', 'Cancelled')),
        counsellor_remarks TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()
    seed_demo_data(conn)
    conn.close()

def seed_demo_data(conn):
    cursor = conn.cursor()
    # Check if users already seeded
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] > 0:
        return

    # Seed users for each role
    demo_users = [
        ('student1', hash_password('Student@123'), 'Aarav Sharma', 'student', 'aarav.sharma@hostel.mann.edu', 'A-204', 'Bed A'),
        ('student2', hash_password('Student@123'), 'Diya Patel', 'student', 'diya.patel@hostel.mann.edu', 'B-102', 'Bed B'),
        ('warden1', hash_password('Warden@123'), 'Col. Rajesh Verma', 'warden', 'warden@hostel.mann.edu', None, None),
        ('maint1', hash_password('Maint@123'), 'Ramesh Kumar (Electrician)', 'maintenance', 'ramesh.maint@hostel.mann.edu', None, None),
        ('maint2', hash_password('Maint@123'), 'Suresh Verma (Plumber)', 'maintenance', 'suresh.maint@hostel.mann.edu', None, None),
        ('mess1', hash_password('Mess@123'), 'Chef Anand Joshi', 'mess_manager', 'mess.manager@hostel.mann.edu', None, None),
        ('counsel1', hash_password('Counsel@123'), 'Dr. Priya Nair', 'counsellor', 'priya.counsellor@hostel.mann.edu', None, None),
        ('admin1', hash_password('Admin@123'), 'Dr. Vikram Malhotra', 'admin', 'admin@hostel.mann.edu', None, None)
    ]

    cursor.executemany("""
    INSERT INTO users (username, password_hash, full_name, role, email, room_number, bed_number)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, demo_users)

    # Seed initial rooms and beds
    rooms_data = [
        ('A-201', 'Block A', 2, 2, 'AC'),
        ('A-202', 'Block A', 2, 2, 'AC'),
        ('A-204', 'Block A', 2, 2, 'AC'),
        ('B-101', 'Block B', 1, 3, 'Non-AC'),
        ('B-102', 'Block B', 1, 3, 'Non-AC'),
        ('C-301', 'Block C', 3, 2, 'AC')
    ]

    for r in rooms_data:
        cursor.execute("INSERT INTO rooms (room_number, block, floor, capacity, room_type) VALUES (?, ?, ?, ?, ?)", r)
        room_id = cursor.lastrowid
        # Add beds
        for idx in range(r[3]):
            bed_label = f"Bed {chr(65 + idx)}"
            cursor.execute("INSERT INTO bed_allocations (room_id, bed_label, status) VALUES (?, ?, 'Vacant')", (room_id, bed_label))

    # Allocate A-204 Bed A to student1 and B-102 Bed B to student2
    cursor.execute("SELECT id FROM rooms WHERE room_number = 'A-204'")
    room_a204 = cursor.fetchone()[0]
    cursor.execute("SELECT id FROM users WHERE username = 'student1'")
    s1_id = cursor.fetchone()[0]
    cursor.execute("""
    UPDATE bed_allocations SET student_id = ?, status = 'Allocated', allocated_at = CURRENT_TIMESTAMP
    WHERE room_id = ? AND bed_label = 'Bed A'
    """, (s1_id, room_a204))

    cursor.execute("SELECT id FROM rooms WHERE room_number = 'B-102'")
    room_b102 = cursor.fetchone()[0]
    cursor.execute("SELECT id FROM users WHERE username = 'student2'")
    s2_id = cursor.fetchone()[0]
    cursor.execute("""
    UPDATE bed_allocations SET student_id = ?, status = 'Allocated', allocated_at = CURRENT_TIMESTAMP
    WHERE room_id = ? AND bed_label = 'Bed B'
    """, (s2_id, room_b102))

    # Seed weekly mess menu
    days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    menu_templates = {
        'Breakfast': ('Poha, Boiled Eggs / Sprouts, Masala Chai, Fresh Banana', 'Veg', 'Fresh fruit stall open till 9:30 AM'),
        'Lunch': ('Paneer Butter Masala, Yellow Dal Tadka, Jeera Rice, Tandoori Roti, Boondi Raita', 'Veg', 'Special dessert: Gulab Jamun'),
        'Snacks': ('Samosa with Mint Chutney, Ginger Tea, Marie Biscuits', 'Veg', 'Snacks served 5:00 PM - 6:30 PM'),
        'Dinner': ('Kadhai Chicken / Shahi Paneer, Dal Makhani, Phulka, Steamed Basmati Rice, Salad', 'Non-Veg', 'Non-veg counter separate')
    }

    cursor.execute("SELECT id FROM users WHERE username = 'mess1'")
    mess_admin_id = cursor.fetchone()[0]

    for day in days:
        for meal, (items, diet, notes) in menu_templates.items():
            cursor.execute("""
            INSERT INTO mess_menu (day_of_week, meal_type, items, dietary_type, special_notes, updated_by)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (day, meal, items, diet, notes, mess_admin_id))

    conn.commit()

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully at", DB_PATH)
