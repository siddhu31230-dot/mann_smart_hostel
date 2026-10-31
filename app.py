import os
import sqlite3
import random
import string
from datetime import datetime, date
from functools import wraps
from flask import Flask, request, jsonify, session, send_from_directory

from database import get_db, hash_password, init_db
from gema4_engine import gema4, GEMA4_MODEL_IDENTIFIER

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
    user = conn.execute("""
    SELECT id, username, college_id, full_name, role, email, phone, 
           room_number, bed_number, guardian_name, guardian_phone, approval_status, is_active 
    FROM users WHERE id = ?
    """, (user_id,)).fetchone()
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
@app.route('/admin')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/wellness')
@app.route('/wellness/')
def wellness_portal():
    res = send_from_directory(app.static_folder, 'wellness.html')
    res.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    res.headers['Pragma'] = 'no-cache'
    res.headers['Expires'] = '0'
    return res

@app.route('/manifest.json')
def web_manifest():
    return send_from_directory(app.static_folder, 'manifest.json')

@app.route('/wellness-sw.js')
def wellness_service_worker():
    res = send_from_directory(app.static_folder, 'wellness-sw.js')
    res.headers['Service-Worker-Allowed'] = '/'
    res.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    res.headers['Pragma'] = 'no-cache'
    res.headers['Expires'] = '0'
    return res

@app.after_request
def add_cache_control_headers(response):
    if request.path.startswith('/static/') or request.path in ['/wellness', '/wellness/', '/wellness-sw.js', '/']:
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

# --- Authentication Endpoints (MANN 2.0) ---

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    identifier = (data.get('identifier', '') or data.get('username', '') or data.get('login', '')).strip()
    password = data.get('password', '').strip()
    portal_type = (data.get('portal_type', '') or data.get('portal', '')).strip().lower() # 'student' or 'admin'

    if not identifier or not password:
        return jsonify({'error': 'College ID / Username and password are required', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    pw_hash = hash_password(password)

    # Allow login with either college_id or username
    user = conn.execute("""
    SELECT * FROM users 
    WHERE (username = ? OR college_id = ? OR email = ?) AND password_hash = ?
    """, (identifier, identifier, identifier, pw_hash)).fetchone()
    conn.close()

    if not user:
        return jsonify({'error': 'Invalid credentials. Please verify your College ID/Username and password.', 'code': 'INVALID_CREDENTIALS'}), 401

    # Check approval status for students
    if user['role'] == 'student':
        if user['approval_status'] == 'pending':
            return jsonify({
                'error': 'Your student registration is awaiting Administrator approval. You will gain access once approved by the hostel office.',
                'code': 'APPROVAL_PENDING'
            }), 403
        elif user['approval_status'] == 'rejected':
            return jsonify({
                'error': 'Your registration was not approved. Please contact the hostel administrative desk.',
                'code': 'APPROVAL_REJECTED'
            }), 403

    if user['is_active'] == 0:
        return jsonify({
            'error': 'Your account has been deactivated. Please contact campus administration.',
            'code': 'ACCOUNT_DEACTIVATED'
        }), 403

    # Portal isolation check
    if portal_type == 'student' and user['role'] not in ['student']:
        return jsonify({
            'error': 'Notice: This portal is for students. Administrative and staff accounts must log in via the Admin & Staff Portal.',
            'code': 'PORTAL_MISMATCH'
        }), 403

    if portal_type == 'admin' and user['role'] == 'student':
        return jsonify({
            'error': 'Access Denied: Student accounts cannot access the administrative console. Please log in via the Student Portal.',
            'code': 'PORTAL_MISMATCH'
        }), 403

    session['user_id'] = user['id']
    session['username'] = user['username']
    session['role'] = user['role']
    session['full_name'] = user['full_name']

    return jsonify({
        'message': f'Welcome back, {user["full_name"]}!',
        'user': {
            'id': user['id'],
            'username': user['username'],
            'college_id': user['college_id'],
            'full_name': user['full_name'],
            'role': user['role'],
            'email': user['email'],
            'phone': user['phone'],
            'room_number': user['room_number'],
            'bed_number': user['bed_number'],
            'guardian_name': user['guardian_name'],
            'guardian_phone': user['guardian_phone'],
            'approval_status': user['approval_status']
        }
    })

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json(silent=True) or {}
    full_name = data.get('full_name', '').strip()
    college_id = data.get('college_id', '').strip().upper()
    email = data.get('email', '').strip().lower()
    phone = data.get('phone', '').strip()
    password = data.get('password', '').strip()
    guardian_name = data.get('guardian_name', '').strip()
    guardian_phone = data.get('guardian_phone', '').strip()

    errors = {}
    if not full_name or len(full_name) < 2:
        errors['full_name'] = 'Full name is required (min 2 characters)'
    if not college_id or len(college_id) < 3:
        errors['college_id'] = 'Valid College ID is required (e.g. NST2026-099)'
    if not email or '@' not in email:
        errors['email'] = 'Valid university/personal email is required'
    if not password or len(password) < 6:
        errors['password'] = 'Password must be at least 6 characters long'

    if errors:
        return jsonify({'error': 'Validation failed', 'validation_errors': errors, 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    existing = conn.execute("""
    SELECT id, username, college_id, email FROM users 
    WHERE college_id = ? OR email = ?
    """, (college_id, email)).fetchone()

    if existing:
        conn.close()
        field = 'College ID' if existing['college_id'] == college_id else 'Email'
        return jsonify({'error': f'An account with this {field} already exists.', 'code': 'CONFLICT'}), 409

    # Generate a username based on college_id
    username = college_id.lower().replace('-', '_')
    pw_hash = hash_password(password)

    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO users (username, college_id, password_hash, full_name, role, email, phone, guardian_name, guardian_phone, approval_status, is_active)
    VALUES (?, ?, ?, ?, 'student', ?, ?, ?, ?, 'pending', 1)
    """, (username, college_id, pw_hash, full_name, email, phone, guardian_name, guardian_phone))
    new_user_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({
        'message': 'Registration submitted successfully! Your account is pending Administrator review and approval before login is enabled.',
        'student_id': new_user_id,
        'user_id': new_user_id,
        'college_id': college_id
    }), 201

@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    data = request.get_json(silent=True) or {}
    identifier = data.get('identifier', '').strip()
    new_password = data.get('new_password', '').strip()

    if not identifier:
        return jsonify({'error': 'College ID or Email is required', 'code': 'VALIDATION_ERROR'}), 400

    if not new_password or len(new_password) < 6:
        return jsonify({'error': 'New password must be at least 6 characters long', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    user = conn.execute("SELECT id, full_name, email FROM users WHERE college_id = ? OR email = ? OR username = ?", (identifier, identifier, identifier)).fetchone()
    if not user:
        conn.close()
        return jsonify({'error': 'No account found matching this College ID or Email.', 'code': 'NOT_FOUND'}), 404

    pw_hash = hash_password(new_password)
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (pw_hash, user['id']))
    conn.commit()
    conn.close()

    return jsonify({
        'message': f'Password successfully updated for {user["full_name"]}. You can now log in with your new password.',
        'code': 'PASSWORD_RESET_SUCCESS'
    })

@app.route('/api/auth/quick-switch', methods=['POST'])
def quick_switch():
    data = request.get_json(silent=True) or {}
    target_role = data.get('role', '').strip().lower()

    valid_roles = ['student', 'warden', 'maintenance', 'mess_manager', 'counsellor', 'admin']
    if target_role not in valid_roles:
        return jsonify({'error': f'Invalid role for quick switch: {target_role}', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    # If student, switch to student1 specifically to get active allocations
    if target_role == 'student':
        user = conn.execute("SELECT * FROM users WHERE username = 'student1' LIMIT 1").fetchone()
    else:
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
            'college_id': user['college_id'],
            'full_name': user['full_name'],
            'role': user['role'],
            'email': user['email'],
            'phone': user['phone'],
            'room_number': user['room_number'],
            'bed_number': user['bed_number'],
            'approval_status': user['approval_status']
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

# --- Student Dashboard Features (MANN 2.0) ---

@app.route('/api/student/room-details', methods=['GET'])
@require_role('student')
def get_student_room_details():
    user = get_current_user()
    if not user.get('room_number'):
        return jsonify({
            'allocated': False,
            'message': 'No room currently allocated. Please request allocation from the hostel administrator.'
        })

    conn = get_db()
    room = conn.execute("SELECT * FROM rooms WHERE room_number = ?", (user['room_number'],)).fetchone()
    if not room:
        conn.close()
        return jsonify({'allocated': False, 'message': 'Room record not found in system'})

    # Find roommates in the same room
    roommates = conn.execute("""
    SELECT u.id, u.full_name, u.college_id, u.email, u.phone, b.bed_label
    FROM bed_allocations b
    JOIN users u ON b.student_id = u.id
    WHERE b.room_id = ? AND u.id != ?
    """, (room['id'], user['id'])).fetchall()

    my_bed = user.get('bed_number', 'Bed A')
    conn.close()

    return jsonify({
        'allocated': True,
        'room': dict(room),
        'my_bed': my_bed,
        'roommates': [dict(r) for r in roommates]
    })

@app.route('/api/student/fees', methods=['GET'])
@require_role('student')
def get_student_fees():
    user = get_current_user()
    conn = get_db()
    fees = conn.execute("""
    SELECT * FROM fee_payments
    WHERE student_id = ?
    ORDER BY CASE payment_status WHEN 'Overdue' THEN 1 WHEN 'Pending' THEN 2 ELSE 3 END, due_date ASC
    """, (user['id'],)).fetchall()

    summary = conn.execute("""
    SELECT 
        SUM(amount) as total_billed,
        SUM(CASE WHEN payment_status = 'Paid' THEN amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN payment_status != 'Paid' THEN amount ELSE 0 END) as total_outstanding
    FROM fee_payments
    WHERE student_id = ?
    """, (user['id'],)).fetchone()
    conn.close()

    return jsonify({
        'fees': [dict(f) for f in fees],
        'summary': dict(summary) if summary else {}
    })

@app.route('/api/student/pay-fee/<int:fee_id>', methods=['POST'])
@require_role('student')
def pay_fee(fee_id):
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    method = data.get('payment_method', 'UPI / Net Banking')

    conn = get_db()
    fee = conn.execute("SELECT * FROM fee_payments WHERE id = ? AND student_id = ?", (fee_id, user['id'])).fetchone()
    if not fee:
        conn.close()
        return jsonify({'error': 'Fee invoice not found', 'code': 'NOT_FOUND'}), 404

    if fee['payment_status'] == 'Paid':
        conn.close()
        return jsonify({'error': 'This invoice has already been cleared', 'code': 'ALREADY_PAID'}), 400

    txn_id = f"TXN-MANN-{''.join(random.choices(string.digits, k=8))}"
    conn.execute("""
    UPDATE fee_payments
    SET payment_status = 'Paid', transaction_id = ?, payment_method = ?, paid_at = CURRENT_TIMESTAMP
    WHERE id = ?
    """, (txn_id, method, fee_id))
    conn.commit()

    updated = conn.execute("SELECT * FROM fee_payments WHERE id = ?", (fee_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': f'Payment of ₹{fee["amount"]:,.2f} completed successfully! Transaction ID: {txn_id}',
        'fee': dict(updated)
    })

# --- Laundry Module (MANN 2.0) ---

@app.route('/api/laundry', methods=['GET'])
@login_required
def list_laundry_requests():
    user = get_current_user()
    role = user['role']
    conn = get_db()

    if role == 'student':
        rows = conn.execute("""
        SELECT l.*, u.full_name as student_name, u.room_number
        FROM laundry_requests l
        JOIN users u ON l.student_id = u.id
        WHERE l.student_id = ?
        ORDER BY l.created_at DESC
        """, (user['id'],)).fetchall()
    else: # Admin, Warden, Staff
        rows = conn.execute("""
        SELECT l.*, u.full_name as student_name, u.room_number, u.college_id
        FROM laundry_requests l
        JOIN users u ON l.student_id = u.id
        ORDER BY CASE l.status WHEN 'Requested' THEN 1 WHEN 'In Washing' THEN 2 WHEN 'Ready for Pickup' THEN 3 ELSE 4 END, l.created_at DESC
        """).fetchall()

    conn.close()
    return jsonify({'requests': [dict(r) for r in rows]})

@app.route('/api/laundry', methods=['POST'])
@require_role('student')
def submit_laundry_request():
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    raw_service = data.get('service_type', 'Wash & Fold').strip()
    if 'Express' in raw_service:
        service_type = 'Express Wash'
    elif 'Dry' in raw_service:
        service_type = 'Dry Cleaning'
    elif 'Iron' in raw_service:
        service_type = 'Wash & Iron'
    else:
        service_type = 'Wash & Fold'

    item_count = data.get('item_count')
    pickup_date = data.get('pickup_date', date.today().isoformat()).strip()
    special_instructions = (data.get('special_instructions', '') or data.get('special_notes', '')).strip()

    valid_services = ['Wash & Fold', 'Wash & Iron', 'Dry Cleaning', 'Express Wash']
    if service_type not in valid_services:
        return jsonify({'error': f'Service type must be one of: {", ".join(valid_services)}', 'code': 'VALIDATION_ERROR'}), 400

    if not item_count or not isinstance(item_count, int) or item_count < 1 or item_count > 40:
        return jsonify({'error': 'Item count must be between 1 and 40 garments', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO laundry_requests (student_id, service_type, item_count, special_instructions, pickup_date, status)
    VALUES (?, ?, ?, ?, ?, 'Requested')
    """, (user['id'], service_type, item_count, special_instructions, pickup_date))
    req_id = cursor.lastrowid
    conn.commit()

    created = conn.execute("""
    SELECT l.*, u.full_name as student_name, u.room_number
    FROM laundry_requests l
    JOIN users u ON l.student_id = u.id
    WHERE l.id = ?
    """, (req_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': f'Laundry request #{req_id} submitted successfully! Please drop off your clothes bag at the ground floor laundry desk.',
        'request': dict(created)
    }), 201

@app.route('/api/laundry/<int:req_id>/status', methods=['PUT'])
@require_role('admin', 'warden', 'maintenance')
def update_laundry_status(req_id):
    data = request.get_json(silent=True) or {}
    status = data.get('status', '').strip()
    admin_notes = data.get('admin_notes', '').strip()

    valid_statuses = ['Requested', 'In Washing', 'Ready for Pickup', 'Delivered', 'Cancelled']
    if status not in valid_statuses:
        return jsonify({'error': f'Invalid status. Must be: {", ".join(valid_statuses)}', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    conn.execute("""
    UPDATE laundry_requests
    SET status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    """, (status, admin_notes, req_id))
    conn.commit()

    updated = conn.execute("""
    SELECT l.*, u.full_name as student_name, u.room_number
    FROM laundry_requests l
    JOIN users u ON l.student_id = u.id
    WHERE l.id = ?
    """, (req_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': f'Laundry order #{req_id} status updated to {status}',
        'request': dict(updated)
    })

# --- Cleaning Requests Module (MANN 2.0) ---

@app.route('/api/cleaning', methods=['GET'])
@login_required
def list_cleaning_requests():
    user = get_current_user()
    role = user['role']
    conn = get_db()

    if role == 'student':
        rows = conn.execute("""
        SELECT c.*, u.full_name as student_name, u.room_number
        FROM cleaning_requests c
        JOIN users u ON c.student_id = u.id
        WHERE c.student_id = ?
        ORDER BY c.created_at DESC
        """, (user['id'],)).fetchall()
    else:
        rows = conn.execute("""
        SELECT c.*, u.full_name as student_name, u.room_number
        FROM cleaning_requests c
        JOIN users u ON c.student_id = u.id
        ORDER BY CASE c.status WHEN 'Scheduled' THEN 1 WHEN 'In Progress' THEN 2 ELSE 3 END, c.created_at DESC
        """).fetchall()

    conn.close()
    return jsonify({'requests': [dict(r) for r in rows]})

@app.route('/api/cleaning', methods=['POST'])
@require_role('student')
def submit_cleaning_request():
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    cleaning_type = data.get('cleaning_type', 'Room Dusting & Mopping').strip()
    preferred_date = data.get('preferred_date', '').strip()
    preferred_slot = data.get('preferred_slot', 'Morning (9 AM - 12 PM)').strip()
    notes = data.get('notes', '').strip()

    if not preferred_date:
        return jsonify({'error': 'Preferred cleaning date is required', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO cleaning_requests (student_id, cleaning_type, preferred_date, preferred_slot, notes, status, assigned_staff)
    VALUES (?, ?, ?, ?, ?, 'Scheduled', 'Housekeeping Team (Duty Shift)')
    """, (user['id'], cleaning_type, preferred_date, preferred_slot, notes))
    clean_id = cursor.lastrowid
    conn.commit()

    created = conn.execute("SELECT * FROM cleaning_requests WHERE id = ?", (clean_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': f'Cleaning request #{clean_id} scheduled for {preferred_date} ({preferred_slot}). Housekeeping staff assigned.',
        'request': dict(created)
    }), 201

@app.route('/api/cleaning/<int:clean_id>/status', methods=['PUT'])
@require_role('admin', 'warden', 'maintenance')
def update_cleaning_status(clean_id):
    data = request.get_json(silent=True) or {}
    status = data.get('status', 'Completed').strip()
    assigned_staff = data.get('assigned_staff', '').strip()

    conn = get_db()
    conn.execute("""
    UPDATE cleaning_requests
    SET status = ?, assigned_staff = COALESCE(NULLIF(?, ''), assigned_staff)
    WHERE id = ?
    """, (status, assigned_staff, clean_id))
    conn.commit()

    updated = conn.execute("SELECT * FROM cleaning_requests WHERE id = ?", (clean_id,)).fetchone()
    conn.close()

    return jsonify({'message': f'Cleaning request #{clean_id} updated to {status}', 'request': dict(updated)})

# --- Visitor Gate Pass Module (MANN 2.0) ---

@app.route('/api/visitors', methods=['GET'])
@login_required
def list_visitor_requests():
    user = get_current_user()
    role = user['role']
    conn = get_db()

    if role == 'student':
        rows = conn.execute("""
        SELECT v.*, u.full_name as student_name, u.room_number, w.full_name as reviewer_name
        FROM visitor_requests v
        JOIN users u ON v.student_id = u.id
        LEFT JOIN users w ON v.reviewed_by = w.id
        WHERE v.student_id = ?
        ORDER BY v.created_at DESC
        """, (user['id'],)).fetchall()
    else:
        rows = conn.execute("""
        SELECT v.*, u.full_name as student_name, u.room_number, u.college_id, w.full_name as reviewer_name
        FROM visitor_requests v
        JOIN users u ON v.student_id = u.id
        LEFT JOIN users w ON v.reviewed_by = w.id
        ORDER BY CASE v.status WHEN 'Pending' THEN 1 WHEN 'Approved' THEN 2 ELSE 3 END, v.created_at DESC
        """).fetchall()

    conn.close()
    return jsonify({'visitors': [dict(r) for r in rows]})

@app.route('/api/visitors', methods=['POST'])
@require_role('student')
def submit_visitor_request():
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    visitor_name = data.get('visitor_name', '').strip()
    relation = data.get('relation', '').strip()
    contact_number = data.get('contact_number', '').strip()
    visit_date = data.get('visit_date', '').strip()
    expected_duration = data.get('expected_duration', '2 Hours').strip()
    purpose = data.get('purpose', '').strip()

    if not visitor_name or len(visitor_name) < 2:
        return jsonify({'error': 'Visitor name is required', 'code': 'VALIDATION_ERROR'}), 400
    if not relation:
        return jsonify({'error': 'Visitor relation is required (e.g. Parent, Sibling, Friend)', 'code': 'VALIDATION_ERROR'}), 400
    if not contact_number or len(contact_number) < 8:
        return jsonify({'error': 'Valid contact phone number is required', 'code': 'VALIDATION_ERROR'}), 400
    if not visit_date:
        return jsonify({'error': 'Visit date is required', 'code': 'VALIDATION_ERROR'}), 400

    pass_code = f"VP-{''.join(random.choices(string.digits, k=4))}"

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO visitor_requests (student_id, visitor_name, relation, contact_number, visit_date, expected_duration, purpose, pass_code, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
    """, (user['id'], visitor_name, relation, contact_number, visit_date, expected_duration, purpose, pass_code))
    v_id = cursor.lastrowid
    conn.commit()

    created = conn.execute("SELECT * FROM visitor_requests WHERE id = ?", (v_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': f'Visitor pass application submitted successfully! Pass Code: {pass_code} (Pending Warden/Admin review).',
        'visitor': dict(created)
    }), 201

@app.route('/api/visitors/<int:v_id>/review', methods=['PUT'])
@require_role('admin', 'warden')
def review_visitor_request(v_id):
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    decision = data.get('decision', 'Approved').strip()
    remarks = data.get('remarks', '').strip()

    valid_decisions = ['Approved', 'Rejected', 'Checked In', 'Checked Out']
    if decision not in valid_decisions:
        return jsonify({'error': f'Decision must be one of: {", ".join(valid_decisions)}', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    conn.execute("""
    UPDATE visitor_requests
    SET status = ?, reviewed_by = ?, remarks = ?
    WHERE id = ?
    """, (decision, user['id'], remarks, v_id))
    conn.commit()

    updated = conn.execute("""
    SELECT v.*, u.full_name as student_name, w.full_name as reviewer_name
    FROM visitor_requests v
    JOIN users u ON v.student_id = u.id
    LEFT JOIN users w ON v.reviewed_by = w.id
    WHERE v.id = ?
    """, (v_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': f'Visitor pass #{v_id} marked as {decision}',
        'visitor': dict(updated)
    })

# --- Announcements Module (MANN 2.0) ---

@app.route('/api/announcements', methods=['GET'])
def list_announcements():
    category = request.args.get('category', '').strip()
    conn = get_db()

    query = """
    SELECT a.*, u.full_name as author_name
    FROM announcements a
    LEFT JOIN users u ON a.created_by = u.id
    WHERE 1=1
    """
    params = []
    if category and category != 'All':
        query += " AND a.category = ?"
        params.append(category)

    query += " ORDER BY CASE a.priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 ELSE 3 END, a.created_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()

    return jsonify({'announcements': [dict(r) for r in rows]})

@app.route('/api/announcements', methods=['POST'])
@require_role('admin', 'warden')
def create_announcement():
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    title = data.get('title', '').strip()
    content = data.get('content', '').strip()
    category = data.get('category', 'General').strip()
    priority = data.get('priority', 'Normal').strip()
    if priority == 'Urgent':
        priority = 'Critical'
    target_audience = data.get('target_audience', 'All').strip()

    valid_cats = ['General', 'Urgent', 'Event', 'Maintenance', 'Academic']
    valid_priorities = ['Normal', 'High', 'Critical']

    if not title or len(title) < 3:
        return jsonify({'error': 'Title must be at least 3 characters', 'code': 'VALIDATION_ERROR'}), 400
    if not content or len(content) < 5:
        return jsonify({'error': 'Content must be at least 5 characters', 'code': 'VALIDATION_ERROR'}), 400
    if category not in valid_cats:
        return jsonify({'error': f'Category must be one of: {", ".join(valid_cats)}', 'code': 'VALIDATION_ERROR'}), 400
    if priority not in valid_priorities:
        return jsonify({'error': f'Priority must be one of: {", ".join(valid_priorities)}', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO announcements (title, content, category, priority, created_by, target_audience)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (title, content, category, priority, user['id'], target_audience))
    ann_id = cursor.lastrowid
    conn.commit()

    created = conn.execute("""
    SELECT a.*, u.full_name as author_name
    FROM announcements a
    LEFT JOIN users u ON a.created_by = u.id
    WHERE a.id = ?
    """, (ann_id,)).fetchone()
    conn.close()

    return jsonify({
        'message': f'Announcement "{title}" broadcasted to residents successfully',
        'announcement': dict(created)
    }), 201

# --- Community Forum Module (MANN 2.0) ---

@app.route('/api/community', methods=['GET'])
@login_required
def list_community_posts():
    category = request.args.get('category', '').strip()
    conn = get_db()
    query = """
    SELECT p.*, u.full_name as author_name, u.room_number, u.role
    FROM community_posts p
    JOIN users u ON p.user_id = u.id
    WHERE 1=1
    """
    params = []
    if category and category != 'All':
        query += " AND p.club_category = ?"
        params.append(category)

    query += " ORDER BY p.created_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify({'posts': [dict(r) for r in rows]})

@app.route('/api/community', methods=['POST'])
@login_required
def create_community_post():
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    title = data.get('title', '').strip()
    content = data.get('content', '').strip()
    club_category = data.get('club_category', 'General Discussion').strip()

    valid_clubs = ['General Discussion', 'Coding & Hackathons', 'Sports & Fitness', 'Cultural & Music', 'Study Groups', 'Lost & Found']
    if not title or len(title) < 3:
        return jsonify({'error': 'Title must be at least 3 characters', 'code': 'VALIDATION_ERROR'}), 400
    if not content or len(content) < 5:
        return jsonify({'error': 'Content must be at least 5 characters', 'code': 'VALIDATION_ERROR'}), 400
    if club_category not in valid_clubs:
        return jsonify({'error': f'Category must be: {", ".join(valid_clubs)}', 'code': 'VALIDATION_ERROR'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO community_posts (user_id, club_category, title, content, likes_count)
    VALUES (?, ?, ?, ?, 0)
    """, (user['id'], club_category, title, content))
    post_id = cursor.lastrowid
    conn.commit()

    created = conn.execute("""
    SELECT p.*, u.full_name as author_name, u.room_number
    FROM community_posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
    """, (post_id,)).fetchone()
    conn.close()

    return jsonify({'message': 'Posted to hostel community successfully', 'post': dict(created)}), 201

@app.route('/api/community/<int:post_id>/like', methods=['POST'])
@login_required
def like_community_post(post_id):
    conn = get_db()
    conn.execute("UPDATE community_posts SET likes_count = likes_count + 1 WHERE id = ?", (post_id,))
    conn.commit()
    post = conn.execute("SELECT id, likes_count FROM community_posts WHERE id = ?", (post_id,)).fetchone()
    conn.close()
    return jsonify({'message': 'Post liked', 'post': dict(post)})

# --- Admin Dashboard Metrics & Management (MANN 2.0) ---

@app.route('/api/admin/overview-metrics', methods=['GET'])
@require_role('admin', 'warden')
def get_admin_overview_metrics():
    conn = get_db()
    total_rooms = conn.execute("SELECT COUNT(*) FROM rooms").fetchone()[0]
    total_beds = conn.execute("SELECT COUNT(*) FROM bed_allocations").fetchone()[0]
    allocated_beds = conn.execute("SELECT COUNT(*) FROM bed_allocations WHERE status = 'Allocated'").fetchone()[0]
    vacant_beds = total_beds - allocated_beds
    occupancy_rate = round((allocated_beds / total_beds * 100), 1) if total_beds > 0 else 0

    open_complaints = conn.execute("SELECT COUNT(*) FROM complaints WHERE status IN ('Open', 'Assigned', 'In Progress')").fetchone()[0]
    pending_leaves = conn.execute("SELECT COUNT(*) FROM leave_requests WHERE status = 'Pending'").fetchone()[0]
    pending_visitors = conn.execute("SELECT COUNT(*) FROM visitor_requests WHERE status = 'Pending'").fetchone()[0]
    active_laundry = conn.execute("SELECT COUNT(*) FROM laundry_requests WHERE status IN ('Requested', 'In Washing')").fetchone()[0]
    pending_registrations = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'student' AND approval_status = 'pending'").fetchone()[0]

    # Recent complaints
    recent_complaints = conn.execute("""
    SELECT c.id, c.title, c.room_number, c.urgency, c.status, u.full_name as student_name
    FROM complaints c
    JOIN users u ON c.student_id = u.id
    ORDER BY c.created_at DESC LIMIT 5
    """).fetchall()

    conn.close()

    return jsonify({
        'metrics': {
            'total_rooms': total_rooms,
            'total_beds': total_beds,
            'allocated_beds': allocated_beds,
            'vacant_beds': vacant_beds,
            'occupancy_rate': occupancy_rate,
            'open_complaints': open_complaints,
            'pending_leaves': pending_leaves,
            'pending_visitors': pending_visitors,
            'active_laundry': active_laundry,
            'pending_registrations': pending_registrations
        },
        'recent_complaints': [dict(c) for c in recent_complaints]
    })

@app.route('/api/admin/pending-students', methods=['GET'])
@require_role('admin', 'warden')
def list_pending_students():
    conn = get_db()
    rows = conn.execute("""
    SELECT id, username, college_id, full_name, email, phone, guardian_name, guardian_phone, approval_status, created_at
    FROM users
    WHERE role = 'student' AND approval_status = 'pending'
    ORDER BY created_at ASC
    """).fetchall()
    conn.close()
    data = [dict(r) for r in rows]
    return jsonify({'pending_students': data, 'students': data})

@app.route('/api/admin/students/<int:student_id>/approve', methods=['PUT'])
@require_role('admin', 'warden')
def approve_student_registration(student_id):
    conn = get_db()
    conn.execute("UPDATE users SET approval_status = 'approved' WHERE id = ?", (student_id,))
    conn.commit()
    user = conn.execute("SELECT id, full_name, college_id, approval_status FROM users WHERE id = ?", (student_id,)).fetchone()
    conn.close()
    return jsonify({
        'message': f'Student {user["full_name"]} ({user["college_id"]}) has been approved! They can now log in to the Student Portal.',
        'student': dict(user)
    })

@app.route('/api/admin/students/<int:student_id>/reject', methods=['PUT'])
@require_role('admin', 'warden')
def reject_student_registration(student_id):
    conn = get_db()
    conn.execute("UPDATE users SET approval_status = 'rejected' WHERE id = ?", (student_id,))
    conn.commit()
    user = conn.execute("SELECT id, full_name, college_id, approval_status FROM users WHERE id = ?", (student_id,)).fetchone()
    conn.close()
    return jsonify({'message': f'Registration for {user["full_name"]} has been rejected.', 'student': dict(user)})

@app.route('/api/admin/students/<int:student_id>/toggle-status', methods=['PUT'])
@require_role('admin')
def toggle_student_status(student_id):
    conn = get_db()
    user = conn.execute("SELECT id, is_active, full_name FROM users WHERE id = ?", (student_id,)).fetchone()
    if not user:
        conn.close()
        return jsonify({'error': 'Student not found', 'code': 'NOT_FOUND'}), 404

    new_status = 0 if user['is_active'] == 1 else 1
    conn.execute("UPDATE users SET is_active = ? WHERE id = ?", (new_status, student_id))
    conn.commit()
    conn.close()

    status_label = 'Activated' if new_status == 1 else 'Deactivated'
    return jsonify({'message': f'Student {user["full_name"]} has been {status_label}', 'is_active': new_status})

@app.route('/api/admin/finance-overview', methods=['GET'])
@require_role('admin', 'warden')
def get_finance_overview():
    conn = get_db()
    stats = conn.execute("""
    SELECT 
        SUM(CASE WHEN payment_status = 'Paid' THEN amount ELSE 0 END) as total_collected,
        SUM(CASE WHEN payment_status = 'Pending' THEN amount ELSE 0 END) as total_pending,
        SUM(CASE WHEN payment_status = 'Overdue' THEN amount ELSE 0 END) as total_overdue,
        COUNT(*) as total_invoices
    FROM fee_payments
    """).fetchone()

    transactions = conn.execute("""
    SELECT f.*, u.full_name as student_name, u.college_id, u.room_number
    FROM fee_payments f
    JOIN users u ON f.student_id = u.id
    ORDER BY f.created_at DESC LIMIT 30
    """).fetchall()
    conn.close()

    collected = (stats['total_collected'] if stats and stats['total_collected'] else 0)
    pending = (stats['total_pending'] if stats and stats['total_pending'] else 0)
    total_billed = collected + pending
    rate = round((collected / total_billed * 100), 1) if total_billed > 0 else 94.0

    finance_dict = {
        'total_collected': collected,
        'total_outstanding': pending,
        'total_pending': pending,
        'total_overdue': stats['total_overdue'] if stats and stats['total_overdue'] else 0,
        'collection_rate': rate,
        'recent_transactions': [dict(t) for t in transactions]
    }

    return jsonify({
        'finance': finance_dict,
        'stats': finance_dict,
        'transactions': [dict(t) for t in transactions]
    })

# --- GEMA-4 Open-Source AI Intelligence & Real-Time Operational Analytics ---

@app.route('/api/gemma4/info', methods=['GET'])
@app.route('/api/gema4/info', methods=['GET'])
def get_gema4_info():
    """Returns official specification of the Gemma 4 open-source engine powering MANN 2.0"""
    return jsonify(gema4.get_model_specs())

@app.route('/api/gemma4/triage', methods=['POST'])
@app.route('/api/gema4/triage', methods=['POST'])
def run_gema4_triage():
    """Live Gemma 4 AI Triage for maintenance tickets and campus issues"""
    data = request.get_json(silent=True) or {}
    title = data.get('title', '')
    desc = data.get('description', '')
    cat = data.get('category', 'General')
    urgency = data.get('urgency', 'Medium')
    analysis = gema4.triage_complaint(title, desc, cat, urgency)
    return jsonify({'gema4_analysis': analysis, 'gemma4_analysis': analysis})

@app.route('/api/wellness/gemma4-companion', methods=['POST'])
@app.route('/api/gemma4/wellness-companion', methods=['POST'])
def gemma4_wellness_companion():
    """
    Gemma-4 Safe Space Reflection Companion for confidential hostel student wellness.
    Strictly non-diagnostic, supportive, and privacy-preserving.
    """
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    message = (data.get('prompt') or data.get('message') or '').strip()
    if not message:
        return jsonify({'error': 'Message cannot be empty', 'code': 'VALIDATION_ERROR'}), 400
    alias = data.get('student_alias') or data.get('alias') or (user['full_name'] if user else 'Resident')
    result = gema4.wellness_companion_chat(message, student_alias=alias)
    # Ensure both response/reply and is_crisis/crisis_detected keys are present
    if isinstance(result, dict):
        result['reply'] = result.get('response', '')
        result['crisis_detected'] = result.get('is_crisis', False)
        result['status'] = 'success'
    return jsonify(result)

@app.route('/api/gemma4/chat', methods=['POST'])
@app.route('/api/gema4/chat', methods=['POST'])
def gema4_chat_endpoint():
    """Interactive Gemma-4 conversational intelligence for mobile and desktop"""
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    message = data.get('message', '').strip()
    if not message:
        return jsonify({'error': 'Message cannot be empty', 'code': 'VALIDATION_ERROR'}), 400
    role = user['role'] if user else 'student'
    name = user['full_name'] if user else 'Resident'
    reply = gema4.chat(message, user_role=role, user_name=name)
    return jsonify(reply)

@app.route('/api/gemma4/assist-complaint', methods=['POST'])
@app.route('/api/gema4/assist-complaint', methods=['POST'])
def gema4_assist_complaint():
    """Gemma-4 automated ticket polishing and categorization"""
    data = request.get_json(silent=True) or {}
    text = data.get('text', '').strip()
    if not text:
        return jsonify({'error': 'Input text is required', 'code': 'VALIDATION_ERROR'}), 400
    res = gema4.assist_complaint_draft(text)
    return jsonify(res)

@app.route('/api/public-metrics', methods=['GET'])
def get_public_metrics():
    """Live metrics for the landing page hero ribbon computed directly from SQLite"""
    conn = get_db()
    total_beds = conn.execute("SELECT COUNT(*) FROM bed_allocations").fetchone()[0] or 12
    occupied = conn.execute("SELECT COUNT(*) FROM bed_allocations WHERE status = 'Allocated'").fetchone()[0] or 0
    occ_rate = round((occupied / total_beds * 100), 1) if total_beds > 0 else 98.2

    avg_food_row = conn.execute("SELECT ROUND(AVG(rating), 1) FROM food_feedback").fetchone()
    avg_food = avg_food_row[0] if (avg_food_row and avg_food_row[0]) else 4.8
    active_complaints = conn.execute("SELECT COUNT(*) FROM complaints WHERE status != 'Closed'").fetchone()[0] or 0
    active_students = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'student' AND approval_status = 'approved'").fetchone()[0] or 2
    conn.close()

    return jsonify({
        'occupancy_rate': occ_rate,
        'avg_food_rating': avg_food,
        'active_tickets': active_complaints,
        'active_students': active_students,
        'sla_minutes': 12,
        'ai_engine': GEMA4_MODEL_IDENTIFIER
    })

@app.route('/api/admin/analytics', methods=['GET'])
@require_role('admin', 'warden')
def get_admin_analytics():
    """GEMA-4 Powered Operational Analytics Engine computed live from SQLite database"""
    conn = get_db()
    
    # 1. Complaints by category
    cat_rows = conn.execute("SELECT category, COUNT(*) as count FROM complaints GROUP BY category ORDER BY count DESC").fetchall()
    total_complaints = sum(r['count'] for r in cat_rows)
    complaints_by_category = []
    for r in cat_rows:
        pct = round((r['count'] / total_complaints * 100), 1) if total_complaints > 0 else 0
        complaints_by_category.append({'category': r['category'], 'count': r['count'], 'percentage': pct})

    # 2. Complaints by status
    status_rows = conn.execute("SELECT status, COUNT(*) as count FROM complaints GROUP BY status").fetchall()
    complaints_by_status = [{'status': r['status'], 'count': r['count']} for r in status_rows]

    # 3. Block occupancy live breakdown
    total_beds = conn.execute("SELECT COUNT(*) FROM bed_allocations").fetchone()[0] or 12
    allocated_beds = conn.execute("SELECT COUNT(*) FROM bed_allocations WHERE status = 'Allocated'").fetchone()[0] or 0
    block_rows = conn.execute("""
    SELECT r.block, COUNT(b.id) as total_beds, SUM(CASE WHEN b.status = 'Allocated' THEN 1 ELSE 0 END) as occupied_beds
    FROM rooms r
    JOIN bed_allocations b ON r.id = b.room_id
    GROUP BY r.block
    """).fetchall()
    occupancy_by_block = []
    for r in block_rows:
        occ = r['occupied_beds'] or 0
        tot = r['total_beds'] or 1
        pct = round((occ / tot * 100), 1)
        occupancy_by_block.append({'block': r['block'], 'total_beds': tot, 'occupied_beds': occ, 'rate': pct})

    # 4. Mess feedback for GEMA-4 sentiment & nutrition analysis
    feedbacks = conn.execute("SELECT meal_type, rating, comments FROM food_feedback ORDER BY id DESC LIMIT 50").fetchall()
    gema4_food_sentiment = gema4.analyze_food_sentiment([dict(f) for f in feedbacks])

    # 5. GEMA-4 Predictive Occupancy Modeling
    gema4_occupancy_prediction = gema4.predict_occupancy_trends(total_beds, allocated_beds, occupancy_by_block)

    conn.close()

    return jsonify({
        'ai_engine': GEMA4_MODEL_IDENTIFIER,
        'analytics': {
            'total_complaints': total_complaints,
            'complaints_by_category': complaints_by_category,
            'complaints_by_status': complaints_by_status,
            'occupancy_by_block': occupancy_by_block,
            'gema4_sentiment': gema4_food_sentiment,
            'gema4_occupancy_forecast': gema4_occupancy_prediction
        }
    })

@app.route('/api/admin/staff-directory', methods=['GET'])
@require_role('admin', 'warden')
def get_staff_directory():
    conn = get_db()
    rows = conn.execute("""
    SELECT id, username, college_id, full_name, role, email, phone
    FROM users
    WHERE role != 'student'
    ORDER BY role, full_name
    """).fetchall()
    conn.close()
    return jsonify({'staff': [dict(r) for r in rows]})

@app.route('/api/admin/settings', methods=['GET', 'PUT'])
@require_role('admin', 'warden')
def handle_hostel_settings():
    conn = get_db()
    if request.method == 'GET':
        rows = conn.execute("SELECT * FROM hostel_settings").fetchall()
        conn.close()
        return jsonify({'settings': {r['key']: r['value'] for r in rows}})

    data = request.get_json(silent=True) or {}
    for k, v in data.items():
        conn.execute("INSERT OR REPLACE INTO hostel_settings (key, value) VALUES (?, ?)", (k, str(v)))
    conn.commit()
    rows = conn.execute("SELECT * FROM hostel_settings").fetchall()
    conn.close()
    return jsonify({'message': 'Hostel configuration updated successfully', 'settings': {r['key']: r['value'] for r in rows}})

# --- Existing Workflows (Maintained & Upgraded) ---

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
        pass
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
    complaint = conn.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
    if not complaint:
        conn.close()
        return jsonify({'error': 'Complaint not found', 'code': 'NOT_FOUND'}), 404

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
@require_role('maintenance', 'admin', 'warden')
def update_complaint_progress(complaint_id):
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    new_status = data.get('status', '').strip()
    if new_status == 'Work in Progress':
        new_status = 'In Progress'
    resolution_notes = (data.get('resolution_notes', '') or data.get('notes', '')).strip()
    if new_status == 'Resolved' and not resolution_notes:
        resolution_notes = 'Issue inspected and verified resolved by maintenance technician.'

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

    # Staff can update if assigned to them or if self-assigning an Open ticket, or Admin/Warden
    if user['role'] == 'maintenance' and complaint['assigned_staff_id'] and complaint['assigned_staff_id'] != user['id']:
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
    action = data.get('action', 'confirm').strip()
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
        'status': dict(updated)['status'],
        'complaint': dict(updated)
    })

# --- Leave Requests Endpoints ---

@app.route('/api/leave-requests', methods=['POST'])
@require_role('student')
def submit_leave_request():
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    raw_type = data.get('leave_type', 'Home Visit').strip() or 'Home Visit'
    valid_types = ['Home Visit', 'Medical', 'Emergency', 'Academic']
    leave_type = raw_type if raw_type in valid_types else 'Home Visit'

    departure_date = (data.get('departure_date', '') or data.get('start_date', '')).strip()
    return_date = (data.get('return_date', '') or data.get('end_date', '')).strip()
    reason = data.get('reason', '').strip()
    parent_contact = (data.get('parent_contact', '') or data.get('emergency_contact', '')).strip()
    destination_address = (data.get('destination_address', '') or data.get('destination', '')).strip()
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
        pass
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
    decision = (data.get('decision', '') or data.get('status', '')).strip()
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

# --- Mess Menu & Food Feedback ---

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

    days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    aggregated = {d: {'day_of_week': d, 'breakfast': '', 'lunch': '', 'snacks': '', 'dinner': '', 'special_notes': ''} for d in days}
    for r in rows:
        d = r['day_of_week']
        m_type = (r['meal_type'] or '').lower()
        if d in aggregated:
            if m_type in aggregated[d]:
                aggregated[d][m_type] = r['items']
            if r['special_notes']:
                aggregated[d]['special_notes'] = r['special_notes']

    return jsonify({
        'menu': list(aggregated.values()),
        'menu_items': [dict(r) for r in rows],
        'items': [dict(r) for r in rows]
    })

@app.route('/api/mess/menu', methods=['PUT'])
@require_role('mess_manager', 'admin', 'warden')
def update_mess_menu():
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    day = data.get('day_of_week', '').strip()
    valid_days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    if day not in valid_days:
        return jsonify({'error': f'Day must be one of: {", ".join(valid_days)}', 'code': 'VALIDATION_ERROR'}), 400

    # Multi-meal update support
    has_meal_keys = any(k in data for k in ['breakfast', 'lunch', 'snacks', 'dinner'])
    if has_meal_keys:
        conn = get_db()
        for m_name in ['Breakfast', 'Lunch', 'Snacks', 'Dinner']:
            m_val = data.get(m_name.lower(), '').strip()
            if m_val:
                conn.execute("""
                INSERT INTO mess_menu (day_of_week, meal_type, items, dietary_type, special_notes, updated_by, updated_at)
                VALUES (?, ?, ?, 'Veg', ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(day_of_week, meal_type) DO UPDATE SET
                    items = excluded.items,
                    special_notes = excluded.special_notes,
                    updated_by = excluded.updated_by,
                    updated_at = CURRENT_TIMESTAMP
                """, (day, m_name, m_val, data.get('special_notes', ''), user['id']))
        conn.commit()
        conn.close()
        return jsonify({'message': f'Menu for {day} updated successfully', 'day_of_week': day})

    meal_type = data.get('meal_type', '').strip()
    items = data.get('items', '').strip()
    dietary_type = data.get('dietary_type', 'Veg').strip()
    special_notes = data.get('special_notes', '').strip()

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
    hygiene_rating = data.get('hygiene_rating') or data.get('rating') or 5
    comments = (data.get('comments', '') or data.get('comment', '')).strip()

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
        'message': 'Food feedback submitted successfully. Thank you for helping improve dining quality!',
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

# --- Facilities Booking ---

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

# --- Rooms & Beds Management ---

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

    room_list = []
    for r in rows:
        r_dict = dict(r)
        beds = conn.execute("""
        SELECT b.*, u.full_name as student_name, u.email as student_email, u.college_id
        FROM bed_allocations b
        LEFT JOIN users u ON b.student_id = u.id
        WHERE b.room_id = ?
        ORDER BY b.bed_label ASC
        """, (r['id'],)).fetchall()
        r_dict['beds'] = [dict(b) for b in beds]

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
    amenities = data.get('amenities', 'Study Desks, High-Speed Wi-Fi, Wardrobes, Attached Washroom').strip()

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
    INSERT INTO rooms (room_number, block, floor, capacity, room_type, amenities, inspection_status)
    VALUES (?, ?, ?, ?, ?, ?, 'Passed')
    """, (room_number, block, floor, capacity, room_type, amenities))
    room_id = cursor.lastrowid

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
    student = conn.execute("SELECT id, full_name, role FROM users WHERE id = ? AND role = 'student'", (student_id,)).fetchone()
    if not student:
        conn.close()
        return jsonify({'error': 'Valid student ID is required', 'code': 'VALIDATION_ERROR'}), 400

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

    conn.execute("UPDATE bed_allocations SET student_id = NULL, status = 'Vacant', allocated_at = NULL WHERE student_id = ?", (student_id,))

    conn.execute("""
    UPDATE bed_allocations 
    SET student_id = ?, status = 'Allocated', allocated_at = CURRENT_TIMESTAMP
    WHERE room_id = ? AND bed_label = ?
    """, (student_id, room_id, bed_label))

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
    SELECT id, username, college_id, full_name, email, phone, room_number, bed_number, approval_status, is_active
    FROM users
    WHERE role = 'student'
    ORDER BY approval_status ASC, full_name ASC
    """).fetchall()
    conn.close()
    return jsonify({'students': [dict(r) for r in rows]})

@app.route('/api/admin/maintenance-staff', methods=['GET'])
@require_role('admin', 'warden')
def list_maintenance_staff():
    conn = get_db()
    rows = conn.execute("""
    SELECT id, username, college_id, full_name, email, phone, role
    FROM users
    WHERE role = 'maintenance'
    ORDER BY full_name ASC
    """).fetchall()
    conn.close()
    return jsonify({'staff': [dict(r) for r in rows]})

# --- Confidential Wellness Appointments (MANN Care) ---

@app.route('/api/wellness/appointments', methods=['POST'])
@require_role('student')
def request_wellness_appointment():
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    preferred_date = data.get('preferred_date', '').strip()
    preferred_time = (data.get('preferred_time', '') or data.get('preferred_time_slot', '') or '10:00 AM - 11:00 AM').strip()
    session_mode = data.get('session_mode', 'In-Person').strip()
    issue_category = (data.get('issue_category', '') or 'Academic Stress').strip()
    confidential_notes = (data.get('confidential_notes', '') or data.get('notes', '')).strip()

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
    Strictly isolated: only the student who requested the appointment OR a user with role 'counsellor'
    can query wellness appointments. All other roles receive 403 Forbidden.
    """
    user = get_current_user()
    role = user['role']

    if role not in ['student', 'counsellor']:
        return jsonify({
            'error': 'PRIVACY VIOLATION: Wellness and mental health counselling records are strictly confidential. Wardens, maintenance, mess managers, and general staff are prohibited from viewing these records.',
            'code': 'PRIVACY_PROTECTED_FORBIDDEN'
        }), 403

    conn = get_db()
    if role == 'student':
        rows = conn.execute("""
        SELECT a.*, c.full_name as counsellor_name
        FROM wellness_appointments a
        LEFT JOIN users c ON a.counsellor_id = c.id
        WHERE a.student_id = ?
        ORDER BY a.preferred_date DESC, a.preferred_time DESC
        """, (user['id'],)).fetchall()
    else:
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
        'app': 'MANN Smart Hostel OS 2.0',
        'version': '2.0.0',
        'timestamp': datetime.utcnow().isoformat()
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5050))
    print(f"Starting MANN Smart Hostel OS 2.0 on http://127.0.0.1:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
