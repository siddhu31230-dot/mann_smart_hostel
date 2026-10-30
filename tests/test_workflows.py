import unittest
import json
import os
import sys

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from database import init_db

class TestHostelWorkflows(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db(drop_existing=True)

    def setUp(self):
        self.client = app.test_client()

    def login_as(self, role):
        """Helper to switch role via quick-switch session"""
        res = self.client.post('/api/auth/quick-switch', 
                               data=json.dumps({'role': role}),
                               content_type='application/json')
        self.assertEqual(res.status_code, 200, f"Failed to login as {role}")
        return res.get_json()['user']

    def test_workflow_01_student_submits_complaint(self):
        """Workflow 1: Student submits a complaint"""
        self.login_as('student')
        payload = {
            'category': 'Electrical',
            'title': 'Ceiling fan making vibrating sound',
            'description': 'The fan vibrates vigorously at speed 3 and smells hot.',
            'room_number': 'A-204',
            'urgency': 'High'
        }
        res = self.client.post('/api/complaints', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        self.assertIn('complaint', data)
        self.assertEqual(data['complaint']['status'], 'Open')
        self.assertEqual(data['complaint']['title'], payload['title'])
        self.assertEqual(data['complaint']['urgency'], 'High')
        TestHostelWorkflows.complaint_id = data['complaint']['id']
        print(f"\n[PASS] Workflow 1: Student submitted complaint #{TestHostelWorkflows.complaint_id}")

    def test_workflow_02_warden_receives_complaint(self):
        """Workflow 2: Warden receives and views the complaint"""
        self.login_as('warden')
        res = self.client.get('/api/complaints')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        complaints = data['complaints']
        matching = [c for c in complaints if c['id'] == TestHostelWorkflows.complaint_id]
        self.assertTrue(len(matching) > 0, "Warden could not find the submitted complaint")
        c = matching[0]
        self.assertEqual(c['status'], 'Open')
        self.assertEqual(c['room_number'], 'A-204')
        print(f"[PASS] Workflow 2: Warden successfully received and inspected complaint #{c['id']}")

    def test_workflow_03_warden_assigns_maintenance_staff(self):
        """Workflow 3: Warden assigns maintenance staff"""
        self.login_as('warden')
        # Get maintenance staff
        staff_res = self.client.get('/api/admin/maintenance-staff')
        self.assertEqual(staff_res.status_code, 200)
        staff_list = staff_res.get_json()['staff']
        self.assertTrue(len(staff_list) > 0, "No maintenance staff available")
        tech_id = staff_list[0]['id']
        TestHostelWorkflows.assigned_staff_id = tech_id

        payload = {
            'staff_id': tech_id,
            'warden_notes': 'Please inspect capacitor and bearings before 4 PM.'
        }
        res = self.client.put(f'/api/complaints/{TestHostelWorkflows.complaint_id}/assign',
                              data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data['complaint']['status'], 'Assigned')
        self.assertEqual(data['complaint']['assigned_staff_id'], tech_id)
        print(f"[PASS] Workflow 3: Warden assigned staff #{tech_id} to complaint #{TestHostelWorkflows.complaint_id}")

    def test_workflow_04_maintenance_staff_updates_complaint(self):
        """Workflow 4: Maintenance staff updates complaint to In Progress then Resolved"""
        self.login_as('maintenance')

        # 4a: Update to In Progress
        payload_progress = {
            'status': 'In Progress',
            'resolution_notes': 'Disassembled fan motor and diagnosed bad capacitor.'
        }
        res1 = self.client.put(f'/api/complaints/{TestHostelWorkflows.complaint_id}/progress',
                               data=json.dumps(payload_progress), content_type='application/json')
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(res1.get_json()['complaint']['status'], 'In Progress')

        # 4b: Update to Resolved
        payload_resolved = {
            'status': 'Resolved',
            'resolution_notes': 'Replaced 2.5uF capacitor and lubricated ball bearings. Fan tested smooth on all speeds.'
        }
        res2 = self.client.put(f'/api/complaints/{TestHostelWorkflows.complaint_id}/progress',
                               data=json.dumps(payload_resolved), content_type='application/json')
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.get_json()['complaint']['status'], 'Resolved')
        print(f"[PASS] Workflow 4: Maintenance staff marked complaint #{TestHostelWorkflows.complaint_id} as Resolved")

    def test_workflow_05_student_confirms_resolution(self):
        """Workflow 5: Student confirms resolution and provides 5-star rating"""
        self.login_as('student')
        payload = {
            'action': 'confirm',
            'rating': 5,
            'feedback': 'Fixed promptly! Fan is completely silent and running great.'
        }
        res = self.client.put(f'/api/complaints/{TestHostelWorkflows.complaint_id}/resolve-confirm',
                              data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, 200)
        c = res.get_json()['complaint']
        self.assertEqual(c['status'], 'Closed')
        self.assertEqual(c['student_rating'], 5)
        self.assertEqual(c['student_feedback'], payload['feedback'])
        print(f"[PASS] Workflow 5: Student confirmed resolution and closed ticket #{c['id']}")

    def test_workflow_06_student_submits_leave_request(self):
        """Workflow 6: Student submits a leave request"""
        self.login_as('student')
        payload = {
            'leave_type': 'Home Visit',
            'departure_date': '2026-11-05 18:00',
            'return_date': '2026-11-09 20:00',
            'reason': 'Visiting family in Jaipur for family ceremony',
            'parent_contact': '+91 98290 12345',
            'destination_address': 'Flat 302, Royal Residency, Vaishali Nagar, Jaipur'
        }
        res = self.client.post('/api/leave-requests', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        self.assertIn('leave_request', data)
        self.assertEqual(data['leave_request']['status'], 'Pending')
        TestHostelWorkflows.leave_id = data['leave_request']['id']
        print(f"[PASS] Workflow 6: Student submitted leave request #{TestHostelWorkflows.leave_id}")

    def test_workflow_07_warden_approves_request(self):
        """Workflow 7: Warden approves the leave request"""
        self.login_as('warden')
        payload = {
            'decision': 'Approved',
            'remarks': 'Approved. Parent contact verified. Ensure biometric punch upon return.'
        }
        res = self.client.put(f'/api/leave-requests/{TestHostelWorkflows.leave_id}/review',
                              data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data['leave_request']['status'], 'Approved')
        self.assertEqual(data['leave_request']['warden_remarks'], payload['remarks'])
        print(f"[PASS] Workflow 7: Warden approved leave request #{TestHostelWorkflows.leave_id}")

    def test_workflow_08_mess_manager_updates_menu(self):
        """Workflow 8: Mess manager updates daily menu"""
        self.login_as('mess_manager')
        payload = {
            'day_of_week': 'Wednesday',
            'meal_type': 'Dinner',
            'items': 'Butter Chicken / Paneer Lababdar, Dal Makhani, Garlic Naan, Veg Pulao, Rasmalai',
            'dietary_type': 'Non-Veg',
            'special_notes': 'Chef special banquet dinner for Mid-Term celebration'
        }
        res = self.client.put('/api/mess/menu', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, 200)
        item = res.get_json()['menu_item']
        self.assertEqual(item['day_of_week'], 'Wednesday')
        self.assertEqual(item['meal_type'], 'Dinner')
        self.assertIn('Butter Chicken', item['items'])
        print("[PASS] Workflow 8: Mess manager updated Wednesday dinner menu")

    def test_workflow_09_student_submits_food_feedback(self):
        """Workflow 9: Student submits food feedback"""
        self.login_as('student')
        payload = {
            'meal_type': 'Dinner',
            'rating': 5,
            'hygiene_rating': 5,
            'comments': 'The banquet dinner was exceptional! Paneer was fresh and naan was hot.'
        }
        res = self.client.post('/api/mess/feedback', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, 201)
        fb = res.get_json()['feedback']
        self.assertEqual(fb['rating'], 5)
        self.assertEqual(fb['hygiene_rating'], 5)

        # Verify Mess Manager can inspect feedback analytics
        self.login_as('mess_manager')
        stats_res = self.client.get('/api/mess/feedback')
        self.assertEqual(stats_res.status_code, 200)
        stats = stats_res.get_json()
        self.assertTrue(len(stats['feedback']) > 0)
        print("[PASS] Workflow 9: Student submitted food feedback and Mess Manager inspected analytics")

    def test_workflow_10_student_books_facility(self):
        """Workflow 10: Student books a hostel facility with collision prevention"""
        self.login_as('student')
        payload = {
            'facility_name': 'Badminton Court',
            'booking_date': '2026-11-06',
            'slot_time': '18:00 - 19:00'
        }
        res = self.client.post('/api/facilities/book', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, 201)
        booking = res.get_json()['booking']
        self.assertEqual(booking['facility_name'], 'Badminton Court')
        self.assertEqual(booking['status'], 'Confirmed')

        # Test collision: Attempt to double-book the same facility and slot
        res_collision = self.client.post('/api/facilities/book', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res_collision.status_code, 409, "Double booking was not prevented!")
        self.assertIn('already booked', res_collision.get_json()['error'])
        print("[PASS] Workflow 10: Student booked facility and system correctly prevented duplicate collision")

    def test_workflow_11_admin_adds_room_and_allocates_bed(self):
        """Workflow 11: Admin adds a room and allocates a bed"""
        self.login_as('admin')

        # 11a: Add room
        room_payload = {
            'room_number': 'C-405',
            'block': 'Block C',
            'floor': 4,
            'capacity': 2,
            'room_type': 'AC'
        }
        res_room = self.client.post('/api/admin/rooms', data=json.dumps(room_payload), content_type='application/json')
        self.assertEqual(res_room.status_code, 201)
        new_room = res_room.get_json()['room']
        room_id = new_room['id']

        # 11b: Allocate bed in new room to student2
        # First get student2 id
        s_res = self.client.get('/api/admin/students')
        students = s_res.get_json()['students']
        s2 = [s for s in students if s['username'] == 'student2'][0]

        alloc_payload = {
            'room_id': room_id,
            'bed_label': 'Bed A',
            'student_id': s2['id']
        }
        res_alloc = self.client.post('/api/admin/allocate-bed', data=json.dumps(alloc_payload), content_type='application/json')
        self.assertEqual(res_alloc.status_code, 200)

        # 11c: Verify room list shows allocation
        rooms_res = self.client.get('/api/admin/rooms?block=Block C')
        matching_room = [r for r in rooms_res.get_json()['rooms'] if r['room_number'] == 'C-405'][0]
        self.assertEqual(matching_room['allocated_beds'], 1)
        self.assertEqual(matching_room['occupancy_status'], 'Partially Occupied')
        print(f"[PASS] Workflow 11: Admin created Room C-405 and allocated Bed A to student {s2['full_name']}")

    def test_workflow_12_counsellor_receives_appointment_request(self):
        """Workflow 12: Counsellor receives appointment request and confirms schedule"""
        # 12a: Student requests confidential session
        self.login_as('student')
        payload = {
            'preferred_date': '2026-11-04',
            'preferred_time': '02:30 PM',
            'session_mode': 'In-Person',
            'issue_category': 'Academic Stress',
            'confidential_notes': 'Feeling severe burnout before major project submission deadlines.'
        }
        res = self.client.post('/api/wellness/appointments', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, 201)
        apt_id = res.get_json()['appointment']['id']

        # 12b: Counsellor receives appointment
        self.login_as('counsellor')
        res_c = self.client.get('/api/wellness/appointments')
        self.assertEqual(res_c.status_code, 200)
        appointments = res_c.get_json()['appointments']
        matching = [a for a in appointments if a['id'] == apt_id]
        self.assertTrue(len(matching) > 0, "Counsellor could not view appointment request")
        self.assertEqual(matching[0]['status'], 'Pending')

        # 12c: Counsellor confirms session
        status_payload = {
            'status': 'Confirmed',
            'counsellor_remarks': 'Session scheduled at Wellness Center Room 104. Prepared stress management framework.'
        }
        res_update = self.client.put(f'/api/wellness/appointments/{apt_id}/status',
                                     data=json.dumps(status_payload), content_type='application/json')
        self.assertEqual(res_update.status_code, 200)
        updated_apt = res_update.get_json()['appointment']
        self.assertEqual(updated_apt['status'], 'Confirmed')
        print(f"[PASS] Workflow 12: Counsellor received confidential appointment #{apt_id} and confirmed schedule")

if __name__ == '__main__':
    unittest.main()
