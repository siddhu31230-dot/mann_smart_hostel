import os
import sqlite3
from datetime import datetime, date
from functools import wraps
from flask import Flask, request, jsonify, session, send_from_directory, render_template

from database import get_db, hash_password, init_db

app = Flask(__name__, static_folder='static', static_url_path='/static')
app.secret_key = os.environ.get('SECRET_KEY', 'mann_smart_hostel_super_secure_key_2026')
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

# Ensure database is initialized on startup
if not os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hostel.db')):
    init_db()

# --- RBAC & Authentication Helpers ---

def get_current_user():
    user_id = session.get('user_id')
    if not user_id:
        return None
    conn = get_db()
    user = conn.execute("SELECT id, username, full_name, role, email, room_number, bed_number FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if user:
        return dict(user)
    return None

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('user_id'):
            return jsonify({'error': 'Authentication required. Please log in.', 'code': 'UNAUTHORIZED'}), 401
        return f(*args, **kwargs)
    return decorated_function

def require_role(*roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not session.get('user_id'):
                return jsonify({'error': 'Authentication required. Please log in.', 'code': 'UNAUTHORIZED'}), 401
            current_role = session.get('role')
            if current_role not in roles:
                return jsonify({
                    'error': f'Access denied. Role "{current_role}" is not authorized for this action. Required: {", ".join(roles)}',
                    'code': 'FORBIDDEN'
                }), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# --- Static UI Routes ---

@app.route('/')
@app.route('/dashboard')
@app.route('/login')
def index():
    return send_from_directory(app.static_folder, 'index.html')

# --- Authentication Endpoints ---

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    if not username or not password:
        return jsonify({'error': 'Username and password are required', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    pw_hash = hash_password(password)
    user = conn.execute("SELECT * FROM users WHERE username = ? AND password_hash = ?", (username, pw_hash)).fetchone()
    conn.close()

    if not user:
        return jsonify({'error': 'Invalid username or password', 'code': 'INVALID_CREDENTIALS'}), 401

    session['user_id'] = user['id']
    session['username'] = user['username']
    session['role'] = user['role']
    session['full_name'] = user['full_name']

    return jsonify({
        'message': 'Login successful',
        'user': {
            'id': user['id'],
            'username': user['username'],
            'full_name': user['full_name'],
            'role': user['role'],
            'email': user['email'],
            'room_number': user['room_number'],
            'bed_number': user['bed_number']
        }
    })

@app.route('/api/auth/quick-switch', methods=['POST'])
def quick_switch():
    data = request.get_json(silent=True) or {}
    target_role = data.get('role', '').strip().lower()

    valid_roles = ['student', 'warden', 'maintenance', 'mess_manager', 'counsellor', 'admin']
    if target_role not in valid_roles:
        return jsonify({'error': f'Invalid role for quick switch: {target_role}', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE role = ? ORDER BY id ASC LIMIT 1", (target_role,)).fetchone()
    conn.close()

    if not user:
        return jsonify({'error': f'No user found with role: {target_role}', 'code': 'NOT_FOUND'}), 404

    session['user_id'] = user['id']
    session['username'] = user['username']
    session['role'] = user['role']
    session['full_name'] = user['full_name']

    return jsonify({
        'message': f'Switched to {user["full_name"]} ({target_role})',
        'user': {
            'id': user['id'],
            'username': user['username'],
            'full_name': user['full_name'],
            'role': user['role'],
            'email': user['email'],
            'room_number': user['room_number'],
            'bed_number': user['bed_number']
        }
    })

@app.route('/api/auth/me', methods=['GET'])
def get_current_user_profile():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Not authenticated', 'code': 'UNAUTHORIZED'}), 401
    return jsonify({'user': user})

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out successfully'})

# --- Workflow 1-5: Complaints & Redressal ---

@app.route('/api/complaints', methods=['POST'])
@require_role('student')
def submit_complaint():
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    category = data.get('category', '').strip()
    title = data.get('title', '').strip()
    description = data.get('description', '').strip()
    room_number = data.get('room_number', user.get('room_number') or '').strip()
    urgency = data.get('urgency', 'Medium').strip()

    valid_categories = ['Electrical', 'Plumbing', 'Carpentry', 'Appliance', 'Cleanliness', 'Internet']
    valid_urgencies = ['Low', 'Medium', 'High', 'Emergency']

    errors = {}
    if not title or len(title) < 3:
        errors['title'] = 'Title must be at least 3 characters long'
    if not description or len(description) < 5:
        errors['description'] = 'Description must be at least 5 characters long'
    if category not in valid_categories:
        errors['category'] = f'Category must be one of: {", ".join(valid_categories)}'
    if not room_number:
        errors['room_number'] = 'Room number is required'
    if urgency not in valid_urgencies:
        errors['urgency'] = f'Urgency must be one of: {", ".join(valid_urgencies)}'

    if errors:
        return jsonify({'error': 'Validation failed', 'validation_errors': errors, 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO complaints (student_id, category, title, description, room_number, urgency, status)
    VALUES (?, ?, ?, ?, ?, ?, 'Open')
    """, (user['id'], category, title, description, room_number, urgency))
    complaint_id = cursor.lastrowid
    conn.commit()

    created_complaint = conn.execute("""
    SELECT c.*, u.full_name as student_name, u.email as student_email
    FROM complaints c
    JOIN users u ON c.student_id = u.id
    WHERE c.id = ?
    """, (complaint_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': 'Complaint submitted successfully',
        'complaint': dict(created_complaint)
    }), 201

@app.route('/api/complaints', methods=['GET'])
@login_required
def list_complaints():
    user = get_current_user()
    role = user['role']
    status_filter = request.args.get('status', '').strip()
    category_filter = request.args.get('category', '').strip()
    urgency_filter = request.args.get('urgency', '').strip()
    search_query = request.args.get('search', '').strip()

    query = """
    SELECT c.*, 
           u.full_name as student_name, u.email as student_email,
           m.full_name as staff_name, m.email as staff_email
    FROM complaints c
    JOIN users u ON c.student_id = u.id
    LEFT JOIN users m ON c.assigned_staff_id = m.id
    WHERE 1=1
    """
    params = []

    # Role-based scoping
    if role == 'student':
        query += " AND c.student_id = ?"
        params.append(user['id'])
    elif role == 'maintenance':
        query += " AND (c.assigned_staff_id = ? OR (c.assigned_staff_id IS NULL AND c.status = 'Open'))"
        params.append(user['id'])
    elif role in ['warden', 'admin']:
        pass # Wardens and Admins can view all complaints
    else:
        return jsonify({'error': 'Forbidden. Role not permitted to view complaints.', 'code': 'FORBIDDEN'}), 403

    if status_filter and status_filter != 'All':
        query += " AND c.status = ?"
        params.append(status_filter)
    if category_filter and category_filter != 'All':
        query += " AND c.category = ?"
        params.append(category_filter)
    if urgency_filter and urgency_filter != 'All':
        query += " AND c.urgency = ?"
        params.append(urgency_filter)
    if search_query:
        clean_search = search_query.lstrip('#').strip()
        query += " AND (CAST(c.id AS TEXT) LIKE ? OR c.title LIKE ? OR c.description LIKE ? OR c.room_number LIKE ? OR u.full_name LIKE ?)"
        s = f"%{clean_search}%"
        params.extend([s, s, s, s, s])

    query += " ORDER BY CASE c.urgency WHEN 'Emergency' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, c.created_at DESC"

    conn = get_db()
    rows = conn.execute(query, params).fetchall()
    conn.close()

    return jsonify({'complaints': [dict(r) for r in rows]})

@app.route('/api/complaints/<int:complaint_id>/assign', methods=['PUT'])
@require_role('warden', 'admin')
def assign_complaint(complaint_id):
    data = request.get_json(silent=True) or {}
    staff_id = data.get('staff_id')
    warden_notes = data.get('warden_notes', '').strip()

    if not staff_id:
        return jsonify({'error': 'Maintenance staff ID is required', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    # Check complaint exists
    complaint = conn.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
    if not complaint:
        conn.close()
        return jsonify({'error': 'Complaint not found', 'code': 'NOT_FOUND'}), 404

    # Check staff exists and is maintenance
    staff = conn.execute("SELECT id, full_name, role FROM users WHERE id = ? AND role = 'maintenance'", (staff_id,)).fetchone()
    if not staff:
        conn.close()
        return jsonify({'error': 'Invalid staff ID. Assigned user must have "maintenance" role.', 'code': 'VALIDATION_ERROR'}), 400

    conn.execute("""
    UPDATE complaints 
    SET assigned_staff_id = ?, warden_notes = ?, status = 'Assigned', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    """, (staff_id, warden_notes, complaint_id))
    conn.commit()

    updated = conn.execute("""
    SELECT c.*, u.full_name as student_name, m.full_name as staff_name
    FROM complaints c
    JOIN users u ON c.student_id = u.id
    LEFT JOIN users m ON c.assigned_staff_id = m.id
    WHERE c.id = ?
    """, (complaint_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': f'Complaint #{complaint_id} assigned to {staff["full_name"]}',
        'complaint': dict(updated)
    })

@app.route('/api/complaints/<int:complaint_id>/progress', methods=['PUT'])
@require_role('maintenance')
def update_complaint_progress(complaint_id):
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    new_status = data.get('status', '').strip()
    resolution_notes = data.get('resolution_notes', '').strip()

    valid_statuses = ['In Progress', 'Resolved']
    if new_status not in valid_statuses:
        return jsonify({'error': f'Status must be one of: {", ".join(valid_statuses)}', 'code': 'VALIDATION_ERROR'}), 400

    if new_status == 'Resolved' and (not resolution_notes or len(resolution_notes) < 5):
        return jsonify({'error': 'Resolution notes must be at least 5 characters when resolving complaint', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    complaint = conn.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
    if not complaint:
        conn.close()
        return jsonify({'error': 'Complaint not found', 'code': 'NOT_FOUND'}), 404

    # Staff can update if assigned to them or if self-assigning an Open ticket
    if complaint['assigned_staff_id'] and complaint['assigned_staff_id'] != user['id']:
        conn.close()
        return jsonify({'error': 'You can only update complaints assigned to you.', 'code': 'FORBIDDEN'}), 403

    conn.execute("""
    UPDATE complaints 
    SET status = ?, resolution_notes = ?, assigned_staff_id = COALESCE(assigned_staff_id, ?), updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    """, (new_status, resolution_notes, user['id'], complaint_id))
    conn.commit()

    updated = conn.execute("""
    SELECT c.*, u.full_name as student_name, m.full_name as staff_name
    FROM complaints c
    JOIN users u ON c.student_id = u.id
    LEFT JOIN users m ON c.assigned_staff_id = m.id
    WHERE c.id = ?
    """, (complaint_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': f'Complaint #{complaint_id} updated to {new_status}',
        'complaint': dict(updated)
    })

@app.route('/api/complaints/<int:complaint_id>/resolve-confirm', methods=['PUT'])
@require_role('student')
def confirm_complaint_resolution(complaint_id):
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    action = data.get('action', 'confirm').strip() # 'confirm' or 'reopen'
    rating = data.get('rating')
    feedback = data.get('feedback', '').strip()

    conn = get_db()
    complaint = conn.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
    if not complaint:
        conn.close()
        return jsonify({'error': 'Complaint not found', 'code': 'NOT_FOUND'}), 404

    if complaint['student_id'] != user['id']:
        conn.close()
        return jsonify({'error': 'You can only confirm resolution for your own complaints.', 'code': 'FORBIDDEN'}), 403

    if complaint['status'] != 'Resolved':
        conn.close()
        return jsonify({'error': f'Cannot confirm resolution. Current complaint status is "{complaint["status"]}", expected "Resolved".', 'code': 'INVALID_STATE'}), 400

    if action == 'confirm':
        if rating is not None and (not isinstance(rating, int) or rating < 1 or rating > 5):
            conn.close()
            return jsonify({'error': 'Rating must be an integer between 1 and 5', 'code': 'VALIDATION_ERROR'}), 400

        conn.execute("""
        UPDATE complaints
        SET status = 'Closed', student_rating = ?, student_feedback = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """, (rating, feedback, complaint_id))
        msg = f'Resolution confirmed for complaint #{complaint_id}. Ticket is now Closed.'
    elif action == 'reopen':
        conn.execute("""
        UPDATE complaints
        SET status = 'Open', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """, (complaint_id,))
        msg = f'Complaint #{complaint_id} has been reopened.'
    else:
        conn.close()
        return jsonify({'error': 'Action must be "confirm" or "reopen"', 'code': 'VALIDATION_ERROR'}), 400

    conn.commit()
    updated = conn.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': msg,
        'complaint': dict(updated)
    })

# --- Workflow 6-7: Leave Requests ---

@app.route('/api/leave-requests', methods=['POST'])
@require_role('student')
def submit_leave_request():
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    leave_type = data.get('leave_type', '').strip()
    departure_date = data.get('departure_date', '').strip()
    return_date = data.get('return_date', '').strip()
    reason = data.get('reason', '').strip()
    parent_contact = data.get('parent_contact', '').strip()
    destination_address = data.get('destination_address', '').strip()

    valid_types = ['Home Visit', 'Medical', 'Emergency', 'Academic']
    errors = {}

    if leave_type not in valid_types:
        errors['leave_type'] = f'Leave type must be one of: {", ".join(valid_types)}'
    if not departure_date:
        errors['departure_date'] = 'Departure date is required'
    if not return_date:
        errors['return_date'] = 'Return date is required'
    if departure_date and return_date and return_date < departure_date:
        errors['return_date'] = 'Return date cannot be earlier than departure date'
    if not reason or len(reason) < 5:
        errors['reason'] = 'Reason must be at least 5 characters long'
    if not parent_contact or len(parent_contact) < 8:
        errors['parent_contact'] = 'Valid parent/guardian contact number is required'
    if not destination_address or len(destination_address) < 5:
        errors['destination_address'] = 'Destination address must be at least 5 characters long'

    if errors:
        return jsonify({'error': 'Validation failed', 'validation_errors': errors, 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO leave_requests (student_id, leave_type, departure_date, return_date, reason, parent_contact, destination_address, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')
    """, (user['id'], leave_type, departure_date, return_date, reason, parent_contact, destination_address))
    leave_id = cursor.lastrowid
    conn.commit()

    created = conn.execute("""
    SELECT l.*, u.full_name as student_name, u.room_number, u.email as student_email
    FROM leave_requests l
    JOIN users u ON l.student_id = u.id
    WHERE l.id = ?
    """, (leave_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': 'Leave request submitted successfully',
        'leave_request': dict(created)
    }), 201

@app.route('/api/leave-requests', methods=['GET'])
@login_required
def list_leave_requests():
    user = get_current_user()
    role = user['role']
    status_filter = request.args.get('status', '').strip()
    search = request.args.get('search', '').strip()

    query = """
    SELECT l.*, 
           u.full_name as student_name, u.room_number, u.email as student_email,
           w.full_name as reviewer_name
    FROM leave_requests l
    JOIN users u ON l.student_id = u.id
    LEFT JOIN users w ON l.reviewed_by = w.id
    WHERE 1=1
    """
    params = []

    if role == 'student':
        query += " AND l.student_id = ?"
        params.append(user['id'])
    elif role in ['warden', 'admin']:
        pass # Warden and Admin see all leave requests
    else:
        return jsonify({'error': 'Forbidden. Role not authorized to view leave requests.', 'code': 'FORBIDDEN'}), 403

    if status_filter and status_filter != 'All':
        query += " AND l.status = ?"
        params.append(status_filter)
    if search:
        clean_search = search.replace('LP-', '').replace('lp-', '').lstrip('#').strip()
        query += " AND (CAST(l.id AS TEXT) LIKE ? OR u.full_name LIKE ? OR u.room_number LIKE ? OR l.reason LIKE ? OR l.destination_address LIKE ?)"
        s = f"%{clean_search}%"
        params.extend([s, s, s, s, s])

    query += " ORDER BY l.created_at DESC"

    conn = get_db()
    rows = conn.execute(query, params).fetchall()
    conn.close()

    return jsonify({'leave_requests': [dict(r) for r in rows]})

@app.route('/api/leave-requests/<int:leave_id>/review', methods=['PUT'])
@require_role('warden', 'admin')
def review_leave_request(leave_id):
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    decision = data.get('decision', '').strip() # 'Approved' or 'Rejected'
    remarks = data.get('remarks', '').strip()

    if decision not in ['Approved', 'Rejected']:
        return jsonify({'error': 'Decision must be "Approved" or "Rejected"', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    leave = conn.execute("SELECT * FROM leave_requests WHERE id = ?", (leave_id,)).fetchone()
    if not leave:
        conn.close()
        return jsonify({'error': 'Leave request not found', 'code': 'NOT_FOUND'}), 404

    conn.execute("""
    UPDATE leave_requests
    SET status = ?, reviewed_by = ?, warden_remarks = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
    """, (decision, user['id'], remarks, leave_id))
    conn.commit()

    updated = conn.execute("""
    SELECT l.*, u.full_name as student_name, w.full_name as reviewer_name
    FROM leave_requests l
    JOIN users u ON l.student_id = u.id
    LEFT JOIN users w ON l.reviewed_by = w.id
    WHERE l.id = ?
    """, (leave_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': f'Leave request #{leave_id} has been {decision.lower()}',
        'leave_request': dict(updated)
    })

# --- Workflow 8-9: Mess Menu & Food Feedback ---

@app.route('/api/mess/menu', methods=['GET'])
@login_required
def get_mess_menu():
    day = request.args.get('day', '').strip()
    conn = get_db()
    if day:
        rows = conn.execute("SELECT * FROM mess_menu WHERE day_of_week = ? ORDER BY CASE meal_type WHEN 'Breakfast' THEN 1 WHEN 'Lunch' THEN 2 WHEN 'Snacks' THEN 3 ELSE 4 END", (day,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM mess_menu ORDER BY day_of_week, CASE meal_type WHEN 'Breakfast' THEN 1 WHEN 'Lunch' THEN 2 WHEN 'Snacks' THEN 3 ELSE 4 END").fetchall()
    conn.close()
    return jsonify({'menu': [dict(r) for r in rows]})

@app.route('/api/mess/menu', methods=['PUT'])
@require_role('mess_manager', 'admin')
def update_mess_menu():
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    day = data.get('day_of_week', '').strip()
    meal_type = data.get('meal_type', '').strip()
    items = data.get('items', '').strip()
    dietary_type = data.get('dietary_type', 'Veg').strip()
    special_notes = data.get('special_notes', '').strip()

    valid_days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    valid_meals = ['Breakfast', 'Lunch', 'Snacks', 'Dinner']
    valid_diets = ['Veg', 'Non-Veg', 'Jain']

    if day not in valid_days:
        return jsonify({'error': f'Day must be one of: {", ".join(valid_days)}', 'code': 'VALIDATION_ERROR'}), 400
    if meal_type not in valid_meals:
        return jsonify({'error': f'Meal type must be one of: {", ".join(valid_meals)}', 'code': 'VALIDATION_ERROR'}), 400
    if not items or len(items) < 3:
        return jsonify({'error': 'Items description must be at least 3 characters long', 'code': 'VALIDATION_ERROR'}), 400
    if dietary_type not in valid_diets:
        return jsonify({'error': f'Dietary type must be one of: {", ".join(valid_diets)}', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    conn.execute("""
    INSERT INTO mess_menu (day_of_week, meal_type, items, dietary_type, special_notes, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(day_of_week, meal_type) DO UPDATE SET
        items = excluded.items,
        dietary_type = excluded.dietary_type,
        special_notes = excluded.special_notes,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    """, (day, meal_type, items, dietary_type, special_notes, user['id']))
    conn.commit()

    updated = conn.execute("SELECT * FROM mess_menu WHERE day_of_week = ? AND meal_type = ?", (day, meal_type)).fetchone()
    conn.close()

    return jsonify({
        'message': f'Menu for {day} {meal_type} updated successfully',
        'menu_item': dict(updated)
    })

@app.route('/api/mess/feedback', methods=['POST'])
@require_role('student')
def submit_food_feedback():
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    meal_type = data.get('meal_type', '').strip()
    rating = data.get('rating')
    hygiene_rating = data.get('hygiene_rating')
    comments = data.get('comments', '').strip()

    valid_meals = ['Breakfast', 'Lunch', 'Snacks', 'Dinner']
    errors = {}
    if meal_type not in valid_meals:
        errors['meal_type'] = f'Meal type must be one of: {", ".join(valid_meals)}'
    if rating is None or not isinstance(rating, int) or rating < 1 or rating > 5:
        errors['rating'] = 'Food quality rating must be an integer between 1 and 5'
    if hygiene_rating is None or not isinstance(hygiene_rating, int) or hygiene_rating < 1 or hygiene_rating > 5:
        errors['hygiene_rating'] = 'Hygiene rating must be an integer between 1 and 5'

    if errors:
        return jsonify({'error': 'Validation failed', 'validation_errors': errors, 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO food_feedback (student_id, meal_type, rating, hygiene_rating, comments)
    VALUES (?, ?, ?, ?, ?)
    """, (user['id'], meal_type, rating, hygiene_rating, comments))
    feedback_id = cursor.lastrowid
    conn.commit()

    created = conn.execute("""
    SELECT f.*, u.full_name as student_name
    FROM food_feedback f
    JOIN users u ON f.student_id = u.id
    WHERE f.id = ?
    """, (feedback_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': 'Food feedback submitted successfully. Thank you for helping improve hostel dining!',
        'feedback': dict(created)
    }), 201

@app.route('/api/mess/feedback', methods=['GET'])
@require_role('mess_manager', 'warden', 'admin')
def list_food_feedback():
    conn = get_db()
    rows = conn.execute("""
    SELECT f.*, u.full_name as student_name, u.room_number
    FROM food_feedback f
    JOIN users u ON f.student_id = u.id
    ORDER BY f.created_at DESC
    """).fetchall()

    # Calculate average ratings
    stats = conn.execute("""
    SELECT 
        COUNT(*) as total_reviews,
        ROUND(AVG(rating), 2) as avg_food_rating,
        ROUND(AVG(hygiene_rating), 2) as avg_hygiene_rating
    FROM food_feedback
    """).fetchone()
    conn.close()

    return jsonify({
        'feedback': [dict(r) for r in rows],
        'stats': dict(stats) if stats else {}
    })

# --- Workflow 10: Facility Booking ---

@app.route('/api/facilities/available', methods=['GET'])
@login_required
def get_facility_availability():
    facility = request.args.get('facility', '').strip()
    booking_date = request.args.get('date', date.today().isoformat()).strip()

    valid_facilities = ['Study Room', 'Table Tennis', 'Badminton Court', 'Gym Slot', 'Music Room', 'Laundry Slot']
    slots = [
        "08:00 - 09:00", "09:00 - 10:00", "10:00 - 11:00", "11:00 - 12:00",
        "16:00 - 17:00", "17:00 - 18:00", "18:00 - 19:00", "19:00 - 20:00",
        "20:00 - 21:00", "21:00 - 22:00"
    ]

    conn = get_db()
    booked_rows = conn.execute("""
    SELECT facility_name, slot_time, student_id, u.full_name as student_name
    FROM facility_bookings b
    JOIN users u ON b.student_id = u.id
    WHERE b.booking_date = ? AND b.status = 'Confirmed'
    """, (booking_date,)).fetchall()
    conn.close()

    booked_map = {(r['facility_name'], r['slot_time']): r['student_name'] for r in booked_rows}

    result = []
    facilities_to_check = [facility] if facility in valid_facilities else valid_facilities

    for fac in facilities_to_check:
        slot_status = []
        for slot in slots:
            is_booked = (fac, slot) in booked_map
            slot_status.append({
                'slot_time': slot,
                'available': not is_booked,
                'booked_by': booked_map.get((fac, slot)) if is_booked else None
            })
        result.append({
            'facility_name': fac,
            'date': booking_date,
            'slots': slot_status
        })

    return jsonify({'facilities': result, 'date': booking_date})

@app.route('/api/facilities/book', methods=['POST'])
@require_role('student')
def book_facility():
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    facility_name = data.get('facility_name', '').strip()
    booking_date = data.get('booking_date', '').strip()
    slot_time = data.get('slot_time', '').strip()

    valid_facilities = ['Study Room', 'Table Tennis', 'Badminton Court', 'Gym Slot', 'Music Room', 'Laundry Slot']
    if facility_name not in valid_facilities:
        return jsonify({'error': f'Facility must be one of: {", ".join(valid_facilities)}', 'code': 'VALIDATION_ERROR'}), 400
    if not booking_date:
        return jsonify({'error': 'Booking date is required', 'code': 'VALIDATION_ERROR'}), 400
    if not slot_time:
        return jsonify({'error': 'Slot time is required', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    # Check for slot collision / duplicate booking
    existing = conn.execute("""
    SELECT b.*, u.full_name as booked_by_name
    FROM facility_bookings b
    JOIN users u ON b.student_id = u.id
    WHERE b.facility_name = ? AND b.booking_date = ? AND b.slot_time = ? AND b.status = 'Confirmed'
    """, (facility_name, booking_date, slot_time)).fetchone()

    if existing:
        conn.close()
        return jsonify({
            'error': f'Facility "{facility_name}" is already booked for {slot_time} on {booking_date}. Please select another slot.',
            'code': 'CONFLICT'
        }), 409

    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO facility_bookings (student_id, facility_name, booking_date, slot_time, status)
    VALUES (?, ?, ?, ?, 'Confirmed')
    """, (user['id'], facility_name, booking_date, slot_time))
    booking_id = cursor.lastrowid
    conn.commit()

    created = conn.execute("SELECT * FROM facility_bookings WHERE id = ?", (booking_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': f'Facility "{facility_name}" booked successfully for {slot_time} on {booking_date}',
        'booking': dict(created)
    }), 201

@app.route('/api/facilities/my-bookings', methods=['GET'])
@require_role('student')
def my_facility_bookings():
    user = get_current_user()
    conn = get_db()
    rows = conn.execute("""
    SELECT * FROM facility_bookings
    WHERE student_id = ?
    ORDER BY booking_date DESC, slot_time ASC
    """, (user['id'],)).fetchall()
    conn.close()
    return jsonify({'bookings': [dict(r) for r in rows]})

# --- Workflow 11: Admin Room & Bed Allocation ---

@app.route('/api/admin/rooms', methods=['GET'])
@require_role('admin', 'warden')
def list_rooms():
    block_filter = request.args.get('block', '').strip()
    status_filter = request.args.get('status', '').strip()

    conn = get_db()
    query = """
    SELECT r.*,
           COUNT(b.id) as total_beds,
           SUM(CASE WHEN b.status = 'Allocated' THEN 1 ELSE 0 END) as allocated_beds,
           SUM(CASE WHEN b.status = 'Vacant' THEN 1 ELSE 0 END) as vacant_beds
    FROM rooms r
    LEFT JOIN bed_allocations b ON r.id = b.room_id
    WHERE 1=1
    """
    params = []
    if block_filter and block_filter != 'All':
        query += " AND r.block = ?"
        params.append(block_filter)

    query += " GROUP BY r.id ORDER BY r.room_number ASC"
    rows = conn.execute(query, params).fetchall()

    # Get beds for each room
    room_list = []
    for r in rows:
        r_dict = dict(r)
        beds = conn.execute("""
        SELECT b.*, u.full_name as student_name, u.email as student_email
        FROM bed_allocations b
        LEFT JOIN users u ON b.student_id = u.id
        WHERE b.room_id = ?
        ORDER BY b.bed_label ASC
        """, (r['id'],)).fetchall()
        r_dict['beds'] = [dict(b) for b in beds]

        # Determine occupancy tag
        if r_dict['allocated_beds'] == 0:
            r_dict['occupancy_status'] = 'Vacant'
        elif r_dict['allocated_beds'] >= r_dict['total_beds']:
            r_dict['occupancy_status'] = 'Full'
        else:
            r_dict['occupancy_status'] = 'Partially Occupied'

        if not status_filter or status_filter == 'All' or r_dict['occupancy_status'] == status_filter:
            room_list.append(r_dict)

    conn.close()
    return jsonify({'rooms': room_list})

@app.route('/api/admin/rooms', methods=['POST'])
@require_role('admin')
def add_room():
    data = request.get_json(silent=True) or {}
    room_number = data.get('room_number', '').strip().upper()
    block = data.get('block', '').strip()
    floor = data.get('floor')
    capacity = data.get('capacity', 2)
    room_type = data.get('room_type', 'AC').strip()

    errors = {}
    if not room_number:
        errors['room_number'] = 'Room number is required (e.g. A-301)'
    if not block:
        errors['block'] = 'Block is required (e.g. Block A)'
    if floor is None or not isinstance(floor, int) or floor < 0:
        errors['floor'] = 'Floor must be a valid non-negative integer'
    if capacity is None or not isinstance(capacity, int) or capacity < 1 or capacity > 6:
        errors['capacity'] = 'Capacity must be between 1 and 6 beds'
    if room_type not in ['AC', 'Non-AC']:
        errors['room_type'] = 'Room type must be "AC" or "Non-AC"'

    if errors:
        return jsonify({'error': 'Validation failed', 'validation_errors': errors, 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    existing = conn.execute("SELECT id FROM rooms WHERE room_number = ?", (room_number,)).fetchone()
    if existing:
        conn.close()
        return jsonify({'error': f'Room "{room_number}" already exists in the system', 'code': 'CONFLICT'}), 409

    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO rooms (room_number, block, floor, capacity, room_type)
    VALUES (?, ?, ?, ?, ?)
    """, (room_number, block, floor, capacity, room_type))
    room_id = cursor.lastrowid

    # Create bed slots
    for i in range(capacity):
        bed_label = f"Bed {chr(65 + i)}"
        cursor.execute("""
        INSERT INTO bed_allocations (room_id, bed_label, status)
        VALUES (?, ?, 'Vacant')
        """, (room_id, bed_label))

    conn.commit()
    new_room = conn.execute("SELECT * FROM rooms WHERE id = ?", (room_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': f'Room {room_number} added successfully with {capacity} bed slots',
        'room': dict(new_room)
    }), 201

@app.route('/api/admin/allocate-bed', methods=['POST'])
@require_role('admin', 'warden')
def allocate_bed():
    data = request.get_json(silent=True) or {}
    room_id = data.get('room_id')
    bed_label = data.get('bed_label', '').strip()
    student_id = data.get('student_id')

    if not room_id or not bed_label or not student_id:
        return jsonify({'error': 'room_id, bed_label, and student_id are required', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    # Check student
    student = conn.execute("SELECT id, full_name, role FROM users WHERE id = ? AND role = 'student'", (student_id,)).fetchone()
    if not student:
        conn.close()
        return jsonify({'error': 'Valid student ID is required', 'code': 'VALIDATION_ERROR'}), 400

    # Check room and bed
    bed = conn.execute("""
    SELECT b.*, r.room_number 
    FROM bed_allocations b
    JOIN rooms r ON b.room_id = r.id
    WHERE b.room_id = ? AND b.bed_label = ?
    """, (room_id, bed_label)).fetchone()

    if not bed:
        conn.close()
        return jsonify({'error': f'Bed slot "{bed_label}" not found in specified room', 'code': 'NOT_FOUND'}), 404

    if bed['status'] == 'Allocated' and bed['student_id'] != student_id:
        conn.close()
        return jsonify({'error': f'Bed slot "{bed_label}" in Room {bed["room_number"]} is already allocated to another resident', 'code': 'CONFLICT'}), 409

    # Free any previously allocated bed for this student
    conn.execute("UPDATE bed_allocations SET student_id = NULL, status = 'Vacant', allocated_at = NULL WHERE student_id = ?", (student_id,))

    # Allocate bed
    conn.execute("""
    UPDATE bed_allocations 
    SET student_id = ?, status = 'Allocated', allocated_at = CURRENT_TIMESTAMP
    WHERE room_id = ? AND bed_label = ?
    """, (student_id, room_id, bed_label))

    # Update user's profile with room and bed
    conn.execute("""
    UPDATE users 
    SET room_number = ?, bed_number = ?
    WHERE id = ?
    """, (bed['room_number'], bed_label, student_id))
    conn.commit()

    conn.close()
    return jsonify({
        'message': f'Allocated Room {bed["room_number"]} {bed_label} to {student["full_name"]}',
        'allocation': {
            'room_id': room_id,
            'room_number': bed['room_number'],
            'bed_label': bed_label,
            'student_id': student_id,
            'student_name': student['full_name']
        }
    })

@app.route('/api/admin/students', methods=['GET'])
@require_role('admin', 'warden')
def list_students():
    conn = get_db()
    rows = conn.execute("""
    SELECT id, username, full_name, email, room_number, bed_number
    FROM users
    WHERE role = 'student'
    ORDER BY full_name ASC
    """).fetchall()
    conn.close()
    return jsonify({'students': [dict(r) for r in rows]})

@app.route('/api/admin/maintenance-staff', methods=['GET'])
@require_role('admin', 'warden')
def list_maintenance_staff():
    conn = get_db()
    rows = conn.execute("""
    SELECT id, username, full_name, email, role
    FROM users
    WHERE role = 'maintenance'
    ORDER BY full_name ASC
    """).fetchall()
    conn.close()
    return jsonify({'staff': [dict(r) for r in rows]})

# --- Workflow 12: Wellness Appointments & Privacy of Wellness Records ---

@app.route('/api/wellness/appointments', methods=['POST'])
@require_role('student')
def request_wellness_appointment():
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    preferred_date = data.get('preferred_date', '').strip()
    preferred_time = data.get('preferred_time', '').strip()
    session_mode = data.get('session_mode', 'In-Person').strip()
    issue_category = data.get('issue_category', '').strip()
    confidential_notes = data.get('confidential_notes', '').strip()

    valid_modes = ['In-Person', 'Online']
    valid_categories = ['Academic Stress', 'Anxiety & Overwhelm', 'Homesickness', 'Interpersonal Conflict', 'General Well-being']

    errors = {}
    if not preferred_date:
        errors['preferred_date'] = 'Preferred appointment date is required'
    if not preferred_time:
        errors['preferred_time'] = 'Preferred appointment time is required'
    if session_mode not in valid_modes:
        errors['session_mode'] = f'Session mode must be: {", ".join(valid_modes)}'
    if issue_category not in valid_categories:
        errors['issue_category'] = f'Category must be one of: {", ".join(valid_categories)}'
    if not confidential_notes or len(confidential_notes) < 5:
        errors['confidential_notes'] = 'Confidential notes must be at least 5 characters long'

    if errors:
        return jsonify({'error': 'Validation failed', 'validation_errors': errors, 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    # Find counsellor user
    counsellor = conn.execute("SELECT id FROM users WHERE role = 'counsellor' LIMIT 1").fetchone()
    counsellor_id = counsellor['id'] if counsellor else None

    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO wellness_appointments (student_id, counsellor_id, preferred_date, preferred_time, session_mode, issue_category, confidential_notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')
    """, (user['id'], counsellor_id, preferred_date, preferred_time, session_mode, issue_category, confidential_notes))
    appointment_id = cursor.lastrowid
    conn.commit()

    created = conn.execute("""
    SELECT a.*, u.full_name as student_name, u.email as student_email
    FROM wellness_appointments a
    JOIN users u ON a.student_id = u.id
    WHERE a.id = ?
    """, (appointment_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': 'Confidential wellness appointment request submitted. Your counsellor will review this with strict privacy.',
        'appointment': dict(created)
    }), 201

@app.route('/api/wellness/appointments', methods=['GET'])
@login_required
def list_wellness_appointments():
    """
    CRITICAL PRIVACY OF WELLNESS RECORDS:
    Only the student who booked the appointment (sees ONLY their own)
    OR an authorized Counsellor (sees appointments assigned to counselling desk)
    can view these records.
    Wardens, Maintenance staff, Mess managers, and other roles MUST receive HTTP 403 Forbidden!
    """
    user = get_current_user()
    role = user['role']

    # Strict Privacy Gate
    if role not in ['student', 'counsellor']:
        return jsonify({
            'error': 'PRIVACY VIOLATION: Wellness and mental health counselling records are strictly confidential. Wardens, maintenance, mess managers, and general staff are prohibited from viewing these records.',
            'code': 'PRIVACY_PROTECTED_FORBIDDEN'
        }), 403

    conn = get_db()
    if role == 'student':
        # Student sees only their own appointments
        rows = conn.execute("""
        SELECT a.*, c.full_name as counsellor_name
        FROM wellness_appointments a
        LEFT JOIN users c ON a.counsellor_id = c.id
        WHERE a.student_id = ?
        ORDER BY a.preferred_date DESC, a.preferred_time DESC
        """, (user['id'],)).fetchall()
    else: # role == 'counsellor'
        # Counsellor sees all appointments requested by students
        rows = conn.execute("""
        SELECT a.*, u.full_name as student_name, u.email as student_email, u.room_number, c.full_name as counsellor_name
        FROM wellness_appointments a
        JOIN users u ON a.student_id = u.id
        LEFT JOIN users c ON a.counsellor_id = c.id
        ORDER BY CASE a.status WHEN 'Pending' THEN 1 WHEN 'Confirmed' THEN 2 ELSE 3 END, a.preferred_date ASC
        """).fetchall()

    conn.close()
    return jsonify({'appointments': [dict(r) for r in rows]})

@app.route('/api/wellness/appointments/<int:appointment_id>/status', methods=['PUT'])
@require_role('counsellor')
def update_wellness_appointment_status(appointment_id):
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    status = data.get('status', '').strip()
    remarks = data.get('counsellor_remarks', '').strip()

    valid_statuses = ['Confirmed', 'Completed', 'Cancelled']
    if status not in valid_statuses:
        return jsonify({'error': f'Status must be one of: {", ".join(valid_statuses)}', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    apt = conn.execute("SELECT * FROM wellness_appointments WHERE id = ?", (appointment_id,)).fetchone()
    if not apt:
        conn.close()
        return jsonify({'error': 'Appointment not found', 'code': 'NOT_FOUND'}), 404

    conn.execute("""
    UPDATE wellness_appointments
    SET status = ?, counsellor_remarks = ?, counsellor_id = ?
    WHERE id = ?
    """, (status, remarks, user['id'], appointment_id))
    conn.commit()

    updated = conn.execute("""
    SELECT a.*, u.full_name as student_name, c.full_name as counsellor_name
    FROM wellness_appointments a
    JOIN users u ON a.student_id = u.id
    LEFT JOIN users c ON a.counsellor_id = c.id
    WHERE a.id = ?
    """, (appointment_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': f'Wellness appointment #{appointment_id} marked as {status}',
        'appointment': dict(updated)
    })

# --- Health Check ---
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'app': 'MANN Smart Hostel OS',
        'version': '1.0.0',
        'timestamp': datetime.utcnow().isoformat()
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5050))
    print(f"Starting MANN Smart Hostel OS on http://127.0.0.1:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
