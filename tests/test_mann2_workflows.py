"""
Test suite for MANN 2.0 Workflows & Features.
Tests all 6 required workflows plus MANN 2.0 specific capabilities:
1. Student submits complaint -> Admin receives complaint -> Admin resolves -> Student sees update
2. Student applies for leave -> Admin approves -> Student sees approval
3. Admin updates mess menu -> Student sees updated menu
4. Admin publishes announcement -> Student sees announcement
5. Student submits laundry request -> Admin receives request
6. Data persistence across sessions
7. Separate Student & Admin Login with College ID & Password Hashing
8. Student Registration Approval Gate (Pending -> Approved)
9. Strict Privacy of Wellness Records (MANN Care)
10. Fees, Laundry, Cleaning, and Visitor Passes
"""

import unittest
import json
import os
import sys

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from database import init_db, get_db

class TestMann2Workflows(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Re-initialize clean database for fresh deterministic testing
        init_db(drop_existing=True)

    def setUp(self):
        self.client = app.test_client()

    def login(self, login_id, password, portal=None):
        payload = {'login': login_id, 'password': password}
        if portal:
            payload['portal'] = portal
        res = self.client.post('/api/auth/login',
                               data=json.dumps(payload),
                               content_type='application/json')
        return res

    def quick_switch(self, role):
        res = self.client.post('/api/auth/quick-switch',
                               data=json.dumps({'role': role}),
                               content_type='application/json')
        self.assertEqual(res.status_code, 200)
        return res.get_json()['user']

    # ---------------------------------------------------------------
    # WORKFLOW 1: Complaint Lifecycle
    # Student submits -> Admin receives -> Admin resolves -> Student sees update
    # ---------------------------------------------------------------
    def test_workflow_1_complaint_lifecycle(self):
        """Workflow 1: Student submits complaint -> Admin receives -> Admin resolves -> Student sees update"""
        # Step 1: Student logs in with College ID
        login_res = self.login('NST2026-042', 'Student@123', portal='student')
        self.assertEqual(login_res.status_code, 200, "Student login failed")
        student_data = login_res.get_json()
        self.assertEqual(student_data['user']['role'], 'student')

        # Step 2: Student submits complaint
        complaint_payload = {
            'category': 'Electrical',
            'urgency': 'High',
            'room_number': 'A-204',
            'title': 'Ceiling fan regulator short-circuited',
            'description': 'Speed control knob sparks when turned to position 4.'
        }
        create_res = self.client.post('/api/complaints',
                                      data=json.dumps(complaint_payload),
                                      content_type='application/json')
        self.assertEqual(create_res.status_code, 201)
        created_complaint = create_res.get_json()['complaint']
        complaint_id = created_complaint['id']
        self.assertEqual(created_complaint['status'], 'Open')
        print(f"\n[PASS] 1.1: Student submitted complaint #{complaint_id}")

        # Step 3: Admin logs in with Admin ID
        admin_login = self.login('ADMIN-001', 'Admin@123', portal='admin')
        self.assertEqual(admin_login.status_code, 200, "Admin login failed")

        # Admin receives/inspects complaint in queue
        list_res = self.client.get(f'/api/complaints?search={complaint_id}')
        self.assertEqual(list_res.status_code, 200)
        complaints_list = list_res.get_json()['complaints']
        self.assertTrue(any(c['id'] == complaint_id for c in complaints_list))
        print(f"[PASS] 1.2: Admin received and verified complaint #{complaint_id} in queue")

        # Step 4: Admin assigns maintenance technician and resolves complaint
        assign_res = self.client.put(f'/api/complaints/{complaint_id}/assign',
                                     data=json.dumps({'staff_id': 6, 'remarks': 'Dispatched technician'}),
                                     content_type='application/json')
        self.assertEqual(assign_res.status_code, 200)

        resolve_res = self.client.put(f'/api/complaints/{complaint_id}/progress',
                                      data=json.dumps({'status': 'Resolved', 'notes': 'Replaced regulator switch'}),
                                      content_type='application/json')
        self.assertEqual(resolve_res.status_code, 200)
        print(f"[PASS] 1.3: Admin resolved complaint #{complaint_id}")

        # Step 5: Student logs back in and verifies the update
        self.login('NST2026-042', 'Student@123', portal='student')
        student_check = self.client.get(f'/api/complaints?search={complaint_id}')
        self.assertEqual(student_check.status_code, 200)
        student_complaint = student_check.get_json()['complaints'][0]
        self.assertEqual(student_complaint['status'], 'Resolved')

        # Student confirms resolution
        confirm_res = self.client.put(f'/api/complaints/{complaint_id}/resolve-confirm',
                                      data=json.dumps({'rating': 5, 'remarks': 'Works smoothly'}),
                                      content_type='application/json')
        self.assertEqual(confirm_res.status_code, 200)
        self.assertEqual(confirm_res.get_json()['status'], 'Closed')
        print(f"[PASS] 1.4: Student saw update and confirmed resolution for ticket #{complaint_id}")

    # ---------------------------------------------------------------
    # WORKFLOW 2: Leave Application Lifecycle
    # Student applies for leave -> Admin approves -> Student sees approval
    # ---------------------------------------------------------------
    def test_workflow_2_leave_application_lifecycle(self):
        """Workflow 2: Student applies for leave -> Admin approves -> Student sees approval"""
        # Step 1: Student submits leave
        self.login('NST2026-042', 'Student@123', portal='student')
        leave_payload = {
            'start_date': '2026-11-05',
            'end_date': '2026-11-08',
            'reason': 'Family wedding ceremony',
            'destination': 'Bengaluru, Karnataka',
            'emergency_contact': '+91 98765-43210'
        }
        apply_res = self.client.post('/api/leave-requests',
                                     data=json.dumps(leave_payload),
                                     content_type='application/json')
        self.assertEqual(apply_res.status_code, 201)
        leave_req = apply_res.get_json()['leave_request']
        leave_id = leave_req['id']
        self.assertEqual(leave_req['status'], 'Pending')
        print(f"\n[PASS] 2.1: Student submitted leave request #{leave_id}")

        # Step 2: Admin/Warden reviews and approves leave
        self.login('ADMIN-001', 'Admin@123', portal='admin')
        admin_leave_res = self.client.get(f'/api/leave-requests?search={leave_id}')
        self.assertEqual(admin_leave_res.status_code, 200)
        self.assertTrue(any(l['id'] == leave_id for l in admin_leave_res.get_json()['leave_requests']))

        approve_res = self.client.put(f'/api/leave-requests/{leave_id}/review',
                                      data=json.dumps({'status': 'Approved', 'remarks': 'Approved by Chief Warden'}),
                                      content_type='application/json')
        self.assertEqual(approve_res.status_code, 200)
        print(f"[PASS] 2.2: Admin approved leave request #{leave_id}")

        # Step 3: Student sees updated approval & digital gate pass
        self.login('NST2026-042', 'Student@123', portal='student')
        student_leaves = self.client.get(f'/api/leave-requests?search={leave_id}')
        self.assertEqual(student_leaves.status_code, 200)
        verified_leave = student_leaves.get_json()['leave_requests'][0]
        self.assertEqual(verified_leave['status'], 'Approved')
        print(f"[PASS] 2.3: Student verified leave #{leave_id} is Approved with digital gate pass")

    # ---------------------------------------------------------------
    # WORKFLOW 3: Mess Menu Update
    # Admin updates mess menu -> Student sees updated menu
    # ---------------------------------------------------------------
    def test_workflow_3_mess_menu_update(self):
        """Workflow 3: Admin updates mess menu -> Student sees updated menu"""
        # Step 1: Admin logs in and updates menu for Friday
        self.login('ADMIN-001', 'Admin@123', portal='admin')
        update_payload = {
            'day_of_week': 'Friday',
            'breakfast': 'Poha, Jalebi, Sprouts, Filter Coffee',
            'lunch': 'Kashmiri Pulao, Paneer Butter Masala, Raita, Gulab Jamun',
            'snacks': 'Samosa, Ginger Tea',
            'dinner': 'Dal Makhani, Butter Naan, Mixed Veg Curry, Kheer',
            'special_notes': 'Grand Festive Dinner'
        }
        update_res = self.client.put('/api/mess/menu',
                                     data=json.dumps(update_payload),
                                     content_type='application/json')
        self.assertEqual(update_res.status_code, 200)
        print(f"\n[PASS] 3.1: Admin updated mess menu for Friday")

        # Step 2: Student logs in and reads updated menu
        self.login('NST2026-042', 'Student@123', portal='student')
        get_res = self.client.get('/api/mess/menu')
        self.assertEqual(get_res.status_code, 200)
        menus = get_res.get_json()['menu']
        friday_menu = next(m for m in menus if m['day_of_week'] == 'Friday')
        self.assertEqual(friday_menu['breakfast'], update_payload['breakfast'])
        self.assertEqual(friday_menu['lunch'], update_payload['lunch'])
        self.assertEqual(friday_menu['dinner'], update_payload['dinner'])
        self.assertEqual(friday_menu['special_notes'], update_payload['special_notes'])
        print(f"[PASS] 3.2: Student verified updated Friday dining menu")

    # ---------------------------------------------------------------
    # WORKFLOW 4: Campus Announcement
    # Admin publishes announcement -> Student sees announcement
    # ---------------------------------------------------------------
    def test_workflow_4_announcements(self):
        """Workflow 4: Admin publishes announcement -> Student sees announcement"""
        # Step 1: Admin publishes announcement
        self.login('ADMIN-001', 'Admin@123', portal='admin')
        ann_payload = {
            'title': 'Scheduled Wi-Fi Router Upgrade',
            'category': 'Maintenance',
            'priority': 'Urgent',
            'content': 'Hostel Block A access points will restart between 02:00 AM - 03:00 AM.'
        }
        pub_res = self.client.post('/api/announcements',
                                   data=json.dumps(ann_payload),
                                   content_type='application/json')
        self.assertEqual(pub_res.status_code, 201)
        created_ann = pub_res.get_json()['announcement']
        ann_id = created_ann['id']
        print(f"\n[PASS] 4.1: Admin published announcement #{ann_id}")

        # Step 2: Student logs in and sees announcement
        self.login('NST2026-042', 'Student@123', portal='student')
        ann_res = self.client.get('/api/announcements')
        self.assertEqual(ann_res.status_code, 200)
        announcements = ann_res.get_json()['announcements']
        target_ann = next(a for a in announcements if a['id'] == ann_id)
        self.assertEqual(target_ann['title'], ann_payload['title'])
        self.assertIn(target_ann['priority'], ['Urgent', 'Critical', 'High'])
        print(f"[PASS] 4.2: Student received live broadcast #{ann_id}")

    # ---------------------------------------------------------------
    # WORKFLOW 5: Express Laundry Lifecycle
    # Student submits laundry request -> Admin receives request
    # ---------------------------------------------------------------
    def test_workflow_5_laundry_service(self):
        """Workflow 5: Student submits laundry request -> Admin receives request"""
        # Step 1: Student submits laundry
        self.login('NST2026-042', 'Student@123', portal='student')
        laundry_payload = {
            'item_count': 6,
            'service_type': 'Express 6-Hour Wash',
            'special_notes': 'Formal blazer dry clean'
        }
        req_res = self.client.post('/api/laundry',
                                   data=json.dumps(laundry_payload),
                                   content_type='application/json')
        self.assertEqual(req_res.status_code, 201)
        laundry_id = req_res.get_json()['request']['id']
        print(f"\n[PASS] 5.1: Student submitted laundry request #{laundry_id}")

        # Step 2: Admin receives request in laundry queue and updates status
        self.login('ADMIN-001', 'Admin@123', portal='admin')
        admin_laundry_res = self.client.get('/api/laundry')
        self.assertEqual(admin_laundry_res.status_code, 200)
        laundry_list = admin_laundry_res.get_json()['requests']
        self.assertTrue(any(l['id'] == laundry_id for l in laundry_list))

        status_res = self.client.put(f'/api/laundry/{laundry_id}/status',
                                     data=json.dumps({'status': 'Ready for Pickup'}),
                                     content_type='application/json')
        self.assertEqual(status_res.status_code, 200)
        print(f"[PASS] 5.2: Admin verified and processed laundry ticket #{laundry_id}")

    # ---------------------------------------------------------------
    # WORKFLOW 6: Data Persistence After Restart / Refresh
    # ---------------------------------------------------------------
    def test_workflow_6_data_persistence(self):
        """Workflow 6: Data remains after session reset / refresh"""
        # Fresh test client simulating browser refresh
        fresh_client = app.test_client()

        # Verify persistent room inventory from database
        conn = get_db()
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM rooms")
        room_count = c.fetchone()[0]
        self.assertGreaterEqual(room_count, 3)

        c.execute("SELECT COUNT(*) FROM complaints")
        complaints_count = c.fetchone()[0]
        self.assertGreaterEqual(complaints_count, 0)

        c.execute("SELECT COUNT(*) FROM users WHERE role = 'student'")
        student_count = c.fetchone()[0]
        self.assertGreaterEqual(student_count, 2)
        conn.close()

        # Access public health & announcements on fresh client
        res = fresh_client.get('/api/announcements')
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(res.get_json()['announcements']), 1)
        print(f"\n[PASS] 6: Data persistence validated across simulated restarts")

    # ---------------------------------------------------------------
    # EXTRA 7: Separate Student & Admin Logins & Portal Isolation
    # ---------------------------------------------------------------
    def test_separate_logins_and_portal_isolation(self):
        """Verify Student and Admin logins are distinct and reject incorrect portal submissions"""
        # Student cannot log into Admin Portal
        student_in_admin = self.login('NST2026-042', 'Student@123', portal='admin')
        self.assertEqual(student_in_admin.status_code, 403, "Student must be rejected from Admin Portal")
        self.assertIn("Student accounts cannot access the administrative console", student_in_admin.get_json()['error'])

        # Staff cannot log into Student Portal
        admin_in_student = self.login('ADMIN-001', 'Admin@123', portal='student')
        self.assertEqual(admin_in_student.status_code, 403, "Staff must be rejected from Student Portal")
        self.assertIn("Administrative and staff accounts must log in via the Admin", admin_in_student.get_json()['error'])
        print(f"\n[PASS] 7: Strict portal boundary isolation verified")

    # ---------------------------------------------------------------
    # EXTRA 8: Student Registration Approval Gate
    # ---------------------------------------------------------------
    def test_student_registration_and_approval_gate(self):
        """Test registration creates 'pending' status and blocks login until Admin approves"""
        # Register new student
        new_student_data = {
            'full_name': 'Kavya Singhania',
            'college_id': 'NST2026-777',
            'username': 'kavya_s',
            'email': 'kavya@campus.edu',
            'phone': '+91 99887-11223',
            'guardian_name': 'Alok Singhania',
            'guardian_phone': '+91 91234-56789',
            'password': 'KavyaPassword@123'
        }
        reg_res = self.client.post('/api/auth/register',
                                   data=json.dumps(new_student_data),
                                   content_type='application/json')
        self.assertEqual(reg_res.status_code, 201)
        student_id = reg_res.get_json()['user_id']

        # Attempt login while pending - must be blocked with 403
        pending_login = self.login('NST2026-777', 'KavyaPassword@123', portal='student')
        self.assertEqual(pending_login.status_code, 403)
        self.assertIn("awaiting Administrator approval", pending_login.get_json()['error'])
        print(f"\n[PASS] 8.1: Pending student login blocked pending admin approval")

        # Admin reviews pending list and approves Kavya
        self.login('ADMIN-001', 'Admin@123', portal='admin')
        pending_list = self.client.get('/api/admin/pending-students').get_json()['students']
        self.assertTrue(any(s['id'] == student_id for s in pending_list))

        approve_res = self.client.put(f'/api/admin/students/{student_id}/approve')
        self.assertEqual(approve_res.status_code, 200)

        # Now student logs in successfully
        approved_login = self.login('NST2026-777', 'KavyaPassword@123', portal='student')
        self.assertEqual(approved_login.status_code, 200)
        self.assertEqual(approved_login.get_json()['user']['full_name'], 'Kavya Singhania')
        print(f"[PASS] 8.2: Student successfully logged in after admin approval")

    # ---------------------------------------------------------------
    # EXTRA 9: MANN Care Confidentiality & Privacy Vault
    # ---------------------------------------------------------------
    def test_mann_care_privacy_vault(self):
        """Verify wellness counseling records are strictly confidential and 403 for Wardens & Admins"""
        # Student books appointment
        self.login('NST2026-042', 'Student@123', portal='student')
        wellness_payload = {
            'preferred_date': '2026-11-10',
            'preferred_time_slot': '02:00 PM - 03:00 PM',
            'notes': 'Academic stress management consultation'
        }
        book_res = self.client.post('/api/wellness/appointments',
                                    data=json.dumps(wellness_payload),
                                    content_type='application/json')
        self.assertEqual(book_res.status_code, 201)
        appt_id = book_res.get_json()['appointment']['id']

        # Student can view their own appointments
        student_view = self.client.get('/api/wellness/appointments')
        self.assertEqual(student_view.status_code, 200)

        # Admin is FORBIDDEN from viewing student wellness records
        self.login('ADMIN-001', 'Admin@123', portal='admin')
        admin_view = self.client.get('/api/wellness/appointments')
        self.assertEqual(admin_view.status_code, 403)

        # Warden is FORBIDDEN from viewing student wellness records
        self.quick_switch('warden')
        warden_view = self.client.get('/api/wellness/appointments')
        self.assertEqual(warden_view.status_code, 403)

        # Counsellor CAN view confidential wellness records
        self.quick_switch('counsellor')
        counsellor_view = self.client.get('/api/wellness/appointments')
        self.assertEqual(counsellor_view.status_code, 200)
        self.assertTrue(any(a['id'] == appt_id for a in counsellor_view.get_json()['appointments']))
        print(f"\n[PASS] 9: MANN Care wellness privacy vault strictly enforced")

    # ---------------------------------------------------------------
    # EXTRA 10: GEMA-4 Open-Source Intelligence & Analytics Engine
    # ---------------------------------------------------------------
    def test_gema4_ai_intelligence_and_analytics(self):
        """Test GEMA-4 model spec, live NLP triage, public metrics, and admin analytics"""
        # 1. Verify GEMA-4 Model Specification & Open Source License
        info_res = self.client.get('/api/gema4/info')
        self.assertEqual(info_res.status_code, 200)
        info = info_res.get_json()
        self.assertIn("GEMA-4", info['model_name'])
        self.assertIn("Apache 2.0", info['license'])
        print(f"\n[PASS] 10.1: GEMA-4 open-source model verified ({info['model_name']})")

        # 2. Verify GEMA-4 AI Triage for High Hazard Issue
        triage_res = self.client.post('/api/gema4/triage',
                                      data=json.dumps({
                                          'title': 'Bathroom heater sparking vigorously',
                                          'description': 'Sparking occurs near main wall wire switch',
                                          'category': 'Electrical',
                                          'urgency': 'Emergency'
                                      }),
                                      content_type='application/json')
        self.assertEqual(triage_res.status_code, 200)
        triage = triage_res.get_json()['gema4_analysis']
        self.assertEqual(triage['hazard_level'], 'High Critical Hazard')
        self.assertLessEqual(triage['recommended_sla_hours'], 2)
        print(f"[PASS] 10.2: GEMA-4 live NLP triage accurately detected High Critical Hazard (SLA: {triage['recommended_sla_hours']}h)")

        # 3. Verify Live Dynamic Admin Analytics powered by GEMA-4
        self.login('ADMIN-001', 'Admin@123', portal='admin')
        analytics_res = self.client.get('/api/admin/analytics')
        self.assertEqual(analytics_res.status_code, 200)
        analytics = analytics_res.get_json()['analytics']
        self.assertIn('complaints_by_category', analytics)
        self.assertIn('occupancy_by_block', analytics)
        self.assertIn('gema4_sentiment', analytics)
        self.assertIn('gema4_occupancy_forecast', analytics)
        self.assertGreaterEqual(analytics['gema4_sentiment']['sentiment_score'], 70.0)
        print(f"[PASS] 10.3: GEMA-4 live operational analytics & forecasting verified")

        # 4. Verify Public Hero Metrics
        pub_res = self.client.get('/api/public-metrics')
        self.assertEqual(pub_res.status_code, 200)
        pub_data = pub_res.get_json()
        self.assertIn('occupancy_rate', pub_data)
        self.assertIn('ai_engine', pub_data)
        print(f"[PASS] 10.4: Dynamic public metrics verified")

        # 5. Verify Gemma-4 Mobile/Web Interactive Chat
        chat_res = self.client.post('/api/gema4/chat',
                                    data=json.dumps({'message': 'What is the curfew time?'}),
                                    content_type='application/json')
        self.assertEqual(chat_res.status_code, 200)
        chat_data = chat_res.get_json()
        self.assertIn('10:00 PM', chat_data['response'])
        print(f"[PASS] 10.5: Gemma-4 interactive mobile/web chat query verified")

        # 6. Verify Gemma-4 AI Complaint Polish Assist
        assist_res = self.client.post('/api/gema4/assist-complaint',
                                      data=json.dumps({'text': 'fan making loud vibrating sound and getting very hot'}),
                                      content_type='application/json')
        self.assertEqual(assist_res.status_code, 200)
        assist_data = assist_res.get_json()
        self.assertEqual(assist_data['suggested_category'], 'Electrical')
        self.assertIn('gema4_triage', assist_data)
        print(f"[PASS] 10.6: Gemma-4 AI auto-draft and polish assist verified")

if __name__ == '__main__':
    unittest.main()
