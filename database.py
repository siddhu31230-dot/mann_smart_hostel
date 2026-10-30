import sqlite3
import os
import hashlib
from datetime import datetime, date

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
        tables = [
            'hostel_settings', 'community_posts', 'fee_payments', 'visitor_requests',
            'cleaning_requests', 'laundry_requests', 'announcements',
            'wellness_appointments', 'facility_bookings', 'food_feedback', 'mess_menu', 
            'leave_requests', 'complaints', 'bed_allocations', 'rooms', 'users'
        ]
        for t in tables:
            cursor.execute(f"DROP TABLE IF EXISTS {t}")
        cursor.execute("PRAGMA foreign_keys = ON")

    # 1. Users table (With College ID, Approval Status, Phone, and Guardian Info)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        college_id TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('student', 'warden', 'maintenance', 'mess_manager', 'counsellor', 'admin')),
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        room_number TEXT,
        bed_number TEXT,
        guardian_name TEXT,
        guardian_phone TEXT,
        approval_status TEXT NOT NULL DEFAULT 'approved' CHECK(approval_status IN ('pending', 'approved', 'rejected')),
        is_active INTEGER NOT NULL DEFAULT 1,
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
        amenities TEXT DEFAULT 'Study Desks, High-Speed Wi-Fi, Storage Wardrobes, Attached Washroom',
        inspection_status TEXT DEFAULT 'Passed - Ready for Occupancy',
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

    # 10. Announcements table (MANN 2.0)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('General', 'Urgent', 'Event', 'Maintenance', 'Academic')),
        priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Normal', 'High', 'Critical')),
        created_by INTEGER REFERENCES users(id),
        target_audience TEXT NOT NULL DEFAULT 'All',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 11. Laundry Requests table (MANN 2.0)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS laundry_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES users(id),
        service_type TEXT NOT NULL CHECK(service_type IN ('Wash & Fold', 'Wash & Iron', 'Dry Cleaning', 'Express Wash')),
        item_count INTEGER NOT NULL CHECK(item_count > 0),
        special_instructions TEXT,
        pickup_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Requested' CHECK(status IN ('Requested', 'In Washing', 'Ready for Pickup', 'Delivered', 'Cancelled')),
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 12. Cleaning Requests table (MANN 2.0)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cleaning_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES users(id),
        cleaning_type TEXT NOT NULL CHECK(cleaning_type IN ('Room Dusting & Mopping', 'Washroom Deep Clean', 'Full Room Sanitization', 'Balcony / Window Cleaning')),
        preferred_date TEXT NOT NULL,
        preferred_slot TEXT NOT NULL,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'Scheduled' CHECK(status IN ('Scheduled', 'In Progress', 'Completed', 'Cancelled')),
        assigned_staff TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 13. Visitor Requests table (MANN 2.0)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS visitor_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES users(id),
        visitor_name TEXT NOT NULL,
        relation TEXT NOT NULL,
        contact_number TEXT NOT NULL,
        visit_date TEXT NOT NULL,
        expected_duration TEXT NOT NULL,
        purpose TEXT NOT NULL,
        pass_code TEXT UNIQUE,
        status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Rejected', 'Checked In', 'Checked Out')),
        reviewed_by INTEGER REFERENCES users(id),
        remarks TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 14. Fee Payments table (MANN 2.0)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS fee_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES users(id),
        fee_type TEXT NOT NULL,
        semester TEXT NOT NULL,
        amount REAL NOT NULL,
        due_date TEXT NOT NULL,
        payment_status TEXT NOT NULL DEFAULT 'Pending' CHECK(payment_status IN ('Paid', 'Pending', 'Overdue')),
        transaction_id TEXT,
        payment_method TEXT,
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 15. Community Posts table (MANN 2.0)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS community_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        club_category TEXT NOT NULL CHECK(club_category IN ('General Discussion', 'Coding & Hackathons', 'Sports & Fitness', 'Cultural & Music', 'Study Groups', 'Lost & Found')),
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        likes_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 16. Hostel Settings table (MANN 2.0)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS hostel_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
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

    # Seed users for each role with College IDs
    demo_users = [
        ('student1', 'NST2026-042', hash_password('Student@123'), 'Aarav Sharma', 'student', 'aarav.sharma@hostel.mann.edu', '+91 98765 12042', 'A-204', 'Bed A', 'Dr. Ramesh Sharma', '+91 98290 11223', 'approved'),
        ('student2', 'NST2026-088', hash_password('Student@123'), 'Diya Patel', 'student', 'diya.patel@hostel.mann.edu', '+91 98765 12088', 'B-102', 'Bed B', 'Mrs. Sunita Patel', '+91 98290 33445', 'approved'),
        ('student_pending', 'NST2026-105', hash_password('Student@123'), 'Rohan Verma', 'student', 'rohan.verma@hostel.mann.edu', '+91 98765 12105', None, None, 'Mr. Alok Verma', '+91 98290 55667', 'pending'),
        ('admin1', 'ADMIN-001', hash_password('Admin@123'), 'Dr. Vikram Malhotra', 'admin', 'admin@hostel.mann.edu', '+91 99990 00001', None, None, None, None, 'approved'),
        ('warden1', 'WARDEN-001', hash_password('Warden@123'), 'Col. Rajesh Verma', 'warden', 'warden@hostel.mann.edu', '+91 99990 00002', None, None, None, None, 'approved'),
        ('maint1', 'STAFF-ELEC-01', hash_password('Maint@123'), 'Ramesh Kumar (Chief Electrician)', 'maintenance', 'ramesh.maint@hostel.mann.edu', '+91 99990 00003', None, None, None, None, 'approved'),
        ('maint2', 'STAFF-PLUMB-01', hash_password('Maint@123'), 'Suresh Verma (Master Plumber)', 'maintenance', 'suresh.maint@hostel.mann.edu', '+91 99990 00004', None, None, None, None, 'approved'),
        ('mess1', 'MESS-DIR-01', hash_password('Mess@123'), 'Chef Anand Joshi', 'mess_manager', 'mess.manager@hostel.mann.edu', '+91 99990 00005', None, None, None, None, 'approved'),
        ('counsel1', 'CARE-PSY-01', hash_password('Counsel@123'), 'Dr. Priya Nair', 'counsellor', 'priya.counsellor@hostel.mann.edu', '+91 99990 00006', None, None, None, None, 'approved')
    ]

    cursor.executemany("""
    INSERT INTO users (username, college_id, password_hash, full_name, role, email, phone, room_number, bed_number, guardian_name, guardian_phone, approval_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, demo_users)

    # Seed initial rooms and beds
    rooms_data = [
        ('A-201', 'Block A', 2, 2, 'AC', 'Study Desks, High-Speed Wi-Fi, Balcony, Attached Washroom', 'Passed'),
        ('A-202', 'Block A', 2, 2, 'AC', 'Study Desks, High-Speed Wi-Fi, Air Conditioning, Wardrobes', 'Passed'),
        ('A-204', 'Block A', 2, 2, 'AC', 'Dual Ergonomic Chairs, LAN Ports, Balcony Garden View, AC', 'Passed'),
        ('B-101', 'Block B', 1, 3, 'Non-AC', 'Study Desks, Ceiling Fans, Courtyard View, Lockers', 'Passed'),
        ('B-102', 'Block B', 1, 3, 'Non-AC', 'Study Desks, Large Bookshelf, East Facing Windows', 'Passed'),
        ('C-301', 'Block C', 3, 2, 'AC', 'Corner Suite, AC, Study Desks, Private Balcony', 'Passed')
    ]

    for r in rooms_data:
        cursor.execute("INSERT INTO rooms (room_number, block, floor, capacity, room_type, amenities, inspection_status) VALUES (?, ?, ?, ?, ?, ?, ?)", r)
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
        'Breakfast': ('Poha, Boiled Eggs / Sprouts, Masala Chai, Fresh Banana', 'Veg', 'Fresh fruit counter open till 9:30 AM'),
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

    # Seed initial Announcements
    cursor.execute("SELECT id FROM users WHERE username = 'admin1'")
    admin_id = cursor.fetchone()[0]

    initial_announcements = [
        ('Mandatory Energy Conservation & Air Conditioning Hours', 'All residents are advised that central AC chillers will operate between 10:00 PM and 7:00 AM, and 1:00 PM and 4:00 PM to support campus sustainability targets. Please switch off study lamps when leaving your rooms.', 'General', 'Normal', admin_id, 'All'),
        ('Annual Inter-Hostel Athletics & Badminton Championship', 'Registrations are now open for the 2026 Campus Sports League. Badminton singles, doubles, and Table Tennis tournaments begin next Friday in the indoor sports complex.', 'Event', 'Normal', admin_id, 'All'),
        ('Routine Water Supply Maintenance (Block A & B)', 'Overhead tanks in Block A and B will undergo semi-annual cleaning and UV sterilisation on Sunday from 9:00 AM to 1:00 PM. Emergency backup tanks will supply drinking water purifiers.', 'Maintenance', 'High', admin_id, 'All'),
        ('Diwali Break Special Gate Outpass Protocol', 'Students planning home visits for the upcoming Diwali holidays must submit digital outpass applications at least 48 hours in advance to ensure prompt parental SMS confirmation.', 'Urgent', 'Critical', admin_id, 'All')
    ]

    for ann in initial_announcements:
        cursor.execute("""
        INSERT INTO announcements (title, content, category, priority, created_by, target_audience)
        VALUES (?, ?, ?, ?, ?, ?)
        """, ann)

    # Seed initial Fee Payments for student1 and student2
    fee_records = [
        (s1_id, 'Hostel Accommodation', 'Autumn Semester 2026', 45000.0, '2026-08-15', 'Paid', 'TXN-HOSTEL-882194', 'Net Banking (HDFC Bank)', '2026-08-10 14:32:00'),
        (s1_id, 'Mess Dining Charges', 'Autumn Semester 2026', 22000.0, '2026-08-15', 'Paid', 'TXN-MESS-992143', 'UPI (Google Pay)', '2026-08-11 11:20:00'),
        (s1_id, 'Utility & Amenities Fee', 'Autumn Semester 2026', 5000.0, '2026-11-15', 'Pending', None, None, None),
        (s2_id, 'Hostel Accommodation', 'Autumn Semester 2026', 45000.0, '2026-08-15', 'Paid', 'TXN-HOSTEL-771120', 'UPI (PhonePe)', '2026-08-12 16:45:00'),
        (s2_id, 'Mess Dining Charges', 'Autumn Semester 2026', 22000.0, '2026-08-15', 'Overdue', None, None, None)
    ]

    for fee in fee_records:
        cursor.execute("""
        INSERT INTO fee_payments (student_id, fee_type, semester, amount, due_date, payment_status, transaction_id, payment_method, paid_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, fee)

    # Seed initial Laundry Requests
    cursor.execute("""
    INSERT INTO laundry_requests (student_id, service_type, item_count, special_instructions, pickup_date, status, admin_notes)
    VALUES (?, 'Wash & Fold', 12, 'Separate colored shirts and delicate knitwear.', '2026-10-29', 'In Washing', 'Batch #B-14 assigned to laundry attendant Mohan.')
    """, (s1_id,))

    # Seed initial Cleaning Request
    cursor.execute("""
    INSERT INTO cleaning_requests (student_id, cleaning_type, preferred_date, preferred_slot, notes, status, assigned_staff)
    VALUES (?, 'Washroom Deep Clean', '2026-10-31', 'Morning (9 AM - 12 PM)', 'Please inspect sink drain and restock hand sanitizer.', 'Scheduled', 'Sunita Bai (Housekeeping)')
    """, (s1_id,))

    # Seed initial Visitor Request
    cursor.execute("""
    INSERT INTO visitor_requests (student_id, visitor_name, relation, contact_number, visit_date, expected_duration, purpose, pass_code, status, reviewed_by, remarks)
    VALUES (?, 'Dr. Ramesh Sharma', 'Father', '+91 98290 11223', '2026-11-02', '3 Hours (2 PM - 5 PM)', 'Delivering winter clothing and family visit.', 'VP-7821', 'Approved', ?, 'Parent visitor pass approved for Guest Lounge.')
    """, (s1_id, admin_id))

    # Seed initial Community Posts
    community_seeds = [
        (s1_id, 'Coding & Hackathons', 'Forming Team for Smart City Autonomous Robotics Hackathon!', 'Hey everyone! Looking for 2 teammates with React / Python / ROS experience for the upcoming hackathon next weekend. Let us connect in Study Room 2 today at 8 PM!'),
        (s2_id, 'Sports & Fitness', 'Evening Badminton Games at 6:30 PM (Court 1)', 'Anyone up for intermediate doubles matches this evening? We have 2 slots open. Bring your own racquets!'),
        (s1_id, 'Lost & Found', 'Found: Scientific Calculator (Casio fx-991EX) in Library Ground Floor', 'Found a silver Casio calculator left on table 4 in the quiet study zone. Deposited at the hostel security desk.')
    ]

    for post in community_seeds:
        cursor.execute("""
        INSERT INTO community_posts (user_id, club_category, title, content, likes_count)
        VALUES (?, ?, ?, ?, 4)
        """, post)

    # Seed Hostel Settings
    settings_seeds = [
        ('gate_curfew_weekday', '10:00 PM'),
        ('gate_curfew_weekend', '11:00 PM'),
        ('emergency_medical_hotline', '+91 99990 10808 (Campus Medical Center)'),
        ('warden_duty_number', '+91 99990 00002 (Warden Central Desk)'),
        ('mess_breakfast_hours', '07:30 AM - 09:30 AM'),
        ('mess_lunch_hours', '12:30 PM - 02:30 PM'),
        ('mess_snacks_hours', '05:00 PM - 06:30 PM'),
        ('mess_dinner_hours', '07:30 PM - 09:30 PM'),
        ('laundry_operating_days', 'Monday, Wednesday, Friday')
    ]

    for k, v in settings_seeds:
        cursor.execute("INSERT OR REPLACE INTO hostel_settings (key, value) VALUES (?, ?)", (k, v))

    conn.commit()

if __name__ == '__main__':
    init_db(drop_existing=True)
    print("MANN 2.0 Database initialized and seeded successfully at", get_db_path())
