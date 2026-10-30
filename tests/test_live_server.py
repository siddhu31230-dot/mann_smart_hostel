import requests
import json
import sys

BASE_URL = "http://127.0.0.1:5050"

def test_live_site():
    print(f"=== TESTING LIVE SERVER AT {BASE_URL} ===")

    # 1. Health check
    res = requests.get(f"{BASE_URL}/api/health")
    assert res.status_code == 200, f"Health check failed: {res.status_code}"
    print(f"[OK] Health check passed: {res.json()}")

    # 2. Static HTML check
    res_html = requests.get(f"{BASE_URL}/")
    assert res_html.status_code == 200
    assert "MANN" in res_html.text
    assert "SMART HOSTEL OS" in res_html.text
    print("[OK] Public landing and frontend single-page application loaded successfully")

    # 3. Complete live end-to-end scenario using live sessions
    # 3a. Student Session
    student_session = requests.Session()
    login_res = student_session.post(f"{BASE_URL}/api/auth/login", json={'username': 'student1', 'password': 'Student@123'})
    assert login_res.status_code == 200, "Student login failed"
    print(f"[OK] Live Student login: {login_res.json()['user']['full_name']}")

    # Workflow 1: Student lodges complaint
    comp_res = student_session.post(f"{BASE_URL}/api/complaints", json={
        'category': 'Electrical',
        'title': 'Study lamp plug sparking in Room A-204',
        'description': 'Sparking occurs intermittently when turning on study lamp socket.',
        'room_number': 'A-204',
        'urgency': 'Emergency'
    })
    assert comp_res.status_code == 201
    comp_id = comp_res.json()['complaint']['id']
    print(f"[OK] Workflow 1: Student submitted live complaint #{comp_id}")

    # 3b. Warden Session
    warden_session = requests.Session()
    warden_login = warden_session.post(f"{BASE_URL}/api/auth/login", json={'username': 'warden1', 'password': 'Warden@123'})
    assert warden_login.status_code == 200
    print(f"[OK] Live Warden login: {warden_login.json()['user']['full_name']}")

    # Workflow 2: Warden receives complaint
    w_comp = warden_session.get(f"{BASE_URL}/api/complaints?search={comp_id}")
    assert w_comp.status_code == 200
    assert len(w_comp.json()['complaints']) >= 1
    print(f"[OK] Workflow 2: Warden received and inspected complaint #{comp_id}")

    # Workflow 3: Warden assigns maintenance staff
    maint_staff = warden_session.get(f"{BASE_URL}/api/admin/maintenance-staff").json()['staff']
    tech = maint_staff[0]
    assign_res = warden_session.put(f"{BASE_URL}/api/complaints/{comp_id}/assign", json={
        'staff_id': tech['id'],
        'warden_notes': 'Emergency electrical ticket. Immediate attendance required.'
    })
    assert assign_res.status_code == 200
    print(f"[OK] Workflow 3: Warden assigned technician {tech['full_name']} to complaint #{comp_id}")

    # 3c. Maintenance Session
    maint_session = requests.Session()
    maint_session.post(f"{BASE_URL}/api/auth/login", json={'username': 'maint1', 'password': 'Maint@123'})

    # Workflow 4: Maintenance staff updates to Resolved
    prog_res = maint_session.put(f"{BASE_URL}/api/complaints/{comp_id}/progress", json={
        'status': 'Resolved',
        'resolution_notes': 'Isolated circuit, replaced burnt socket terminal, tightened neutral connection. Fully tested.'
    })
    assert prog_res.status_code == 200
    print(f"[OK] Workflow 4: Maintenance staff updated complaint #{comp_id} to Resolved")

    # Workflow 5: Student confirms resolution
    conf_res = student_session.put(f"{BASE_URL}/api/complaints/{comp_id}/resolve-confirm", json={
        'action': 'confirm',
        'rating': 5,
        'feedback': 'Excellent emergency response! Socket is secure and working perfectly.'
    })
    assert conf_res.status_code == 200
    print(f"[OK] Workflow 5: Student confirmed resolution and closed ticket #{comp_id}")

    # Workflow 6: Student submits leave request
    leave_res = student_session.post(f"{BASE_URL}/api/leave-requests", json={
        'leave_type': 'Academic',
        'departure_date': '2026-11-12 09:00',
        'return_date': '2026-11-15 18:00',
        'reason': 'Attending National Autonomous AI Hackathon Hyderabad',
        'parent_contact': '+91 99887 76655',
        'destination_address': 'HITEC City Convention Center, Hyderabad'
    })
    assert leave_res.status_code == 201
    leave_id = leave_res.json()['leave_request']['id']
    print(f"[OK] Workflow 6: Student submitted leave request #{leave_id}")

    # Workflow 7: Warden approves request
    appr_res = warden_session.put(f"{BASE_URL}/api/leave-requests/{leave_id}/review", json={
        'decision': 'Approved',
        'remarks': 'Approved for National AI Hackathon participation. Best of luck.'
    })
    assert appr_res.status_code == 200
    print(f"[OK] Workflow 7: Warden approved outpass #{leave_id}")

    # 3d. Mess Manager Session
    mess_session = requests.Session()
    mess_session.post(f"{BASE_URL}/api/auth/login", json={'username': 'mess1', 'password': 'Mess@123'})

    # Workflow 8: Mess manager updates daily menu
    menu_res = mess_session.put(f"{BASE_URL}/api/mess/menu", json={
        'day_of_week': 'Friday',
        'meal_type': 'Lunch',
        'items': 'Dum Biryani (Veg/Chicken), Mirchi Ka Salan, Onion Raitha, Gulab Jamun',
        'dietary_type': 'Non-Veg',
        'special_notes': 'Friday special Hyderabadi Dum Biryani'
    })
    assert menu_res.status_code == 200
    print("[OK] Workflow 8: Mess manager updated Friday Lunch menu")

    # Workflow 9: Student submits food feedback
    fb_res = student_session.post(f"{BASE_URL}/api/mess/feedback", json={
        'meal_type': 'Lunch',
        'rating': 5,
        'hygiene_rating': 5,
        'comments': 'Authentic Dum Biryani, very flavorful and well prepared.'
    })
    assert fb_res.status_code == 201
    print("[OK] Workflow 9: Student submitted dining feedback")

    # Workflow 10: Student books facility
    book_res = student_session.post(f"{BASE_URL}/api/facilities/book", json={
        'facility_name': 'Gym Slot',
        'booking_date': '2026-11-08',
        'slot_time': '17:00 - 18:00'
    })
    assert book_res.status_code == 201
    # Verify conflict detection
    dup_res = student_session.post(f"{BASE_URL}/api/facilities/book", json={
        'facility_name': 'Gym Slot',
        'booking_date': '2026-11-08',
        'slot_time': '17:00 - 18:00'
    })
    assert dup_res.status_code == 409
    print("[OK] Workflow 10: Student booked facility and system prevented double-booking")

    # 3e. Admin Session
    admin_session = requests.Session()
    admin_session.post(f"{BASE_URL}/api/auth/login", json={'username': 'admin1', 'password': 'Admin@123'})

    # Workflow 11: Admin adds room and allocates bed
    room_res = admin_session.post(f"{BASE_URL}/api/admin/rooms", json={
        'room_number': 'B-303',
        'block': 'Block B',
        'floor': 3,
        'capacity': 2,
        'room_type': 'AC'
    })
    assert room_res.status_code in [201, 409] # 201 or already created
    rooms = admin_session.get(f"{BASE_URL}/api/admin/rooms?block=Block B").json()['rooms']
    target_room = [r for r in rooms if r['room_number'] == 'B-303'][0]

    alloc_res = admin_session.post(f"{BASE_URL}/api/admin/allocate-bed", json={
        'student_id': 1,
        'room_id': target_room['id'],
        'bed_label': 'Bed A'
    })
    assert alloc_res.status_code == 200
    print(f"[OK] Workflow 11: Admin created Room B-303 and allocated Bed A to Student1")

    # 3f. Counsellor Session & Workflow 12: Confidential Wellness Session
    apt_res = student_session.post(f"{BASE_URL}/api/wellness/appointments", json={
        'preferred_date': '2026-11-07',
        'preferred_time': '04:00 PM',
        'session_mode': 'In-Person',
        'issue_category': 'General Well-being',
        'confidential_notes': 'Seeking advice on balancing academic workload and sleep schedule.'
    })
    assert apt_res.status_code == 201
    apt_id = apt_res.json()['appointment']['id']
    print(f"[OK] Workflow 12a: Student requested confidential wellness appointment #{apt_id}")

    # Privacy verification: Warden tries to access wellness appointments
    warden_wellness = warden_session.get(f"{BASE_URL}/api/wellness/appointments")
    assert warden_wellness.status_code == 403, "PRIVACY FAILURE: Warden was able to read wellness records!"
    print("[OK] Workflow 12b (Privacy Check): Warden blocked with 403 Forbidden on wellness records")

    # Counsellor accesses appointment
    counsel_session = requests.Session()
    counsel_session.post(f"{BASE_URL}/api/auth/login", json={'username': 'counsel1', 'password': 'Counsel@123'})
    c_list = counsel_session.get(f"{BASE_URL}/api/wellness/appointments")
    assert c_list.status_code == 200
    c_apt = [a for a in c_list.json()['appointments'] if a['id'] == apt_id][0]
    assert c_apt['status'] == 'Pending'

    # Counsellor confirms appointment
    c_confirm = counsel_session.put(f"{BASE_URL}/api/wellness/appointments/{apt_id}/status", json={
        'status': 'Confirmed',
        'counsellor_remarks': 'Appointment confirmed for Saturday at 4 PM in Counselling Cabin 1.'
    })
    assert c_confirm.status_code == 200
    print(f"[OK] Workflow 12c: Counsellor confirmed appointment #{apt_id}")

    print("\n==========================================")
    print("ALL 12 WORKFLOWS VERIFIED LIVE ON 127.0.0.1:5050")
    print("==========================================")

if __name__ == '__main__':
    test_live_site()
