import unittest
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from database import init_db

class TestSecurityAndPrivacy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db(drop_existing=True)

    def setUp(self):
        self.client = app.test_client()

    def login_as(self, role, username=None):
        if username:
            # Login with specific credentials
            passwords = {
                'student1': 'Student@123',
                'student2': 'Student@123',
                'warden1': 'Warden@123',
                'maint1': 'Maint@123',
                'mess1': 'Mess@123',
                'counsel1': 'Counsel@123',
                'admin1': 'Admin@123'
            }
            res = self.client.post('/api/auth/login', 
                                   data=json.dumps({'username': username, 'password': passwords.get(username)}),
                                   content_type='application/json')
            self.assertEqual(res.status_code, 200)
            return res.get_json()['user']
        else:
            res = self.client.post('/api/auth/quick-switch', 
                                   data=json.dumps({'role': role}),
                                   content_type='application/json')
            self.assertEqual(res.status_code, 200)
            return res.get_json()['user']

    def logout(self):
        self.client.post('/api/auth/logout')

    # --- Unauthorized Routes (401) ---

    def test_unauthorized_routes_return_401(self):
        """Verify unauthenticated requests are rejected with 401 Unauthorized"""
        self.logout()
        protected_endpoints = [
            ('GET', '/api/auth/me'),
            ('GET', '/api/complaints'),
            ('POST', '/api/complaints'),
            ('GET', '/api/leave-requests'),
            ('POST', '/api/leave-requests'),
            ('GET', '/api/mess/menu'),
            ('PUT', '/api/mess/menu'),
            ('GET', '/api/facilities/available'),
            ('POST', '/api/facilities/book'),
            ('GET', '/api/admin/rooms'),
            ('POST', '/api/admin/rooms'),
            ('GET', '/api/wellness/appointments'),
            ('POST', '/api/wellness/appointments')
        ]
        for method, path in protected_endpoints:
            if method == 'GET':
                res = self.client.get(path)
            elif method == 'POST':
                res = self.client.post(path, data=json.dumps({}), content_type='application/json')
            elif method == 'PUT':
                res = self.client.put(path, data=json.dumps({}), content_type='application/json')
            self.assertEqual(res.status_code, 401, f"Expected 401 for unauthenticated {method} {path}, got {res.status_code}")
        print("[PASS] Verified all 13 protected endpoints reject unauthenticated access with 401 Unauthorized")

    # --- Role-Based Access Control (403) ---

    def test_student_forbidden_from_admin_and_staff_actions(self):
        """Verify student cannot execute admin, warden, or mess manager actions"""
        self.login_as('student')

        # 1. Student cannot assign staff to complaints (Warden action)
        res1 = self.client.put('/api/complaints/1/assign', data=json.dumps({'staff_id': 4}), content_type='application/json')
        self.assertEqual(res1.status_code, 403, "Student should not be able to assign staff")

        # 2. Student cannot review leave requests (Warden action)
        res2 = self.client.put('/api/leave-requests/1/review', data=json.dumps({'decision': 'Approved'}), content_type='application/json')
        self.assertEqual(res2.status_code, 403, "Student should not be able to approve leave")

        # 3. Student cannot update mess menu (Mess Manager action)
        res3 = self.client.put('/api/mess/menu', data=json.dumps({'day_of_week': 'Monday', 'meal_type': 'Lunch', 'items': 'Burgers'}), content_type='application/json')
        self.assertEqual(res3.status_code, 403, "Student should not be able to update mess menu")

        # 4. Student cannot add rooms or allocate beds (Admin action)
        res4 = self.client.post('/api/admin/rooms', data=json.dumps({'room_number': 'X-999'}), content_type='application/json')
        self.assertEqual(res4.status_code, 403, "Student should not be able to create rooms")

        print("[PASS] Verified Student role receives 403 Forbidden on all administrative actions")

    def test_maintenance_staff_forbidden_from_unrelated_routes(self):
        """Verify maintenance staff cannot approve leave or modify mess menus"""
        self.login_as('maintenance')

        res1 = self.client.put('/api/leave-requests/1/review', data=json.dumps({'decision': 'Approved'}), content_type='application/json')
        self.assertEqual(res1.status_code, 403)

        res2 = self.client.put('/api/mess/menu', data=json.dumps({'day_of_week': 'Monday', 'meal_type': 'Breakfast', 'items': 'Toast'}), content_type='application/json')
        self.assertEqual(res2.status_code, 403)

        print("[PASS] Verified Maintenance role receives 403 Forbidden on unauthorized modules")

    # --- PRIVACY OF WELLNESS RECORDS (CRITICAL SECURITY) ---

    def test_privacy_of_wellness_records_strict_isolation(self):
        """
        CRITICAL PRIVACY TEST:
        Wellness / counselling appointments contain sensitive mental health information.
        They must ONLY be accessible to the student owner and authorized counsellors.
        Wardens, Maintenance staff, Mess managers, and Administrators MUST receive 403 Forbidden!
        """
        # Step 1: Student 1 files a confidential wellness request
        self.login_as('student', username='student1')
        res_submit = self.client.post('/api/wellness/appointments', data=json.dumps({
            'preferred_date': '2026-11-10',
            'preferred_time': '11:30 AM',
            'session_mode': 'In-Person',
            'issue_category': 'Anxiety & Overwhelm',
            'confidential_notes': 'Sensitive medical anxiety and panic attacks during exams.'
        }), content_type='application/json')
        self.assertEqual(res_submit.status_code, 201)
        apt_id = res_submit.get_json()['appointment']['id']

        # Step 2: Warden tries to access wellness appointments -> MUST BE REJECTED 403
        self.login_as('warden')
        res_warden = self.client.get('/api/wellness/appointments')
        self.assertEqual(res_warden.status_code, 403, "PRIVACY LEAK: Warden was allowed to access wellness records!")
        self.assertIn("PRIVACY VIOLATION", res_warden.get_json()['error'])

        # Step 3: Maintenance staff tries to access wellness appointments -> MUST BE REJECTED 403
        self.login_as('maintenance')
        res_maint = self.client.get('/api/wellness/appointments')
        self.assertEqual(res_maint.status_code, 403, "PRIVACY LEAK: Maintenance staff accessed wellness records!")

        # Step 4: Mess manager tries to access wellness appointments -> MUST BE REJECTED 403
        self.login_as('mess_manager')
        res_mess = self.client.get('/api/wellness/appointments')
        self.assertEqual(res_mess.status_code, 403, "PRIVACY LEAK: Mess manager accessed wellness records!")

        # Step 5: Admin tries to access wellness appointments -> MUST BE REJECTED 403
        self.login_as('admin')
        res_admin = self.client.get('/api/wellness/appointments')
        self.assertEqual(res_admin.status_code, 403, "PRIVACY LEAK: Admin accessed confidential wellness records!")

        # Step 6: Student 2 (another student) checks appointments -> Must NOT see Student 1's record!
        self.login_as('student', username='student2')
        res_s2 = self.client.get('/api/wellness/appointments')
        self.assertEqual(res_s2.status_code, 200)
        s2_records = res_s2.get_json()['appointments']
        s1_in_s2 = [a for a in s2_records if a['id'] == apt_id]
        self.assertEqual(len(s1_in_s2), 0, "PRIVACY LEAK: Student 2 could see Student 1's mental health appointment!")

        # Step 7: Authorized Counsellor checks appointments -> CAN view the appointment
        self.login_as('counsellor')
        res_counsel = self.client.get('/api/wellness/appointments')
        self.assertEqual(res_counsel.status_code, 200)
        counsel_records = res_counsel.get_json()['appointments']
        matching = [a for a in counsel_records if a['id'] == apt_id]
        self.assertEqual(len(matching), 1, "Counsellor should be able to view wellness appointment")

        print("[PASS] Verified Strict Privacy of Wellness Records across all unauthorized roles and peer students")

if __name__ == '__main__':
    unittest.main()
