import unittest
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from database import init_db, get_db

class TestValidationAndPersistence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db(drop_existing=True)

    def setUp(self):
        self.client = app.test_client()

    def login_as(self, role):
        res = self.client.post('/api/auth/quick-switch', 
                               data=json.dumps({'role': role}),
                               content_type='application/json')
        self.assertEqual(res.status_code, 200)

    # --- Form Validation Tests ---

    def test_complaint_form_validation(self):
        """Test complaint submission validation for short title, missing fields, invalid category"""
        self.login_as('student')

        # 1. Missing title
        res = self.client.post('/api/complaints', data=json.dumps({
            'category': 'Electrical',
            'title': '',
            'description': 'Valid description with enough characters',
            'room_number': 'A-204'
        }), content_type='application/json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('title', res.get_json()['validation_errors'])

        # 2. Too short description
        res2 = self.client.post('/api/complaints', data=json.dumps({
            'category': 'Electrical',
            'title': 'Bad fan',
            'description': 'Bad',
            'room_number': 'A-204'
        }), content_type='application/json')
        self.assertEqual(res2.status_code, 400)
        self.assertIn('description', res2.get_json()['validation_errors'])

        # 3. Invalid category
        res3 = self.client.post('/api/complaints', data=json.dumps({
            'category': 'AlienTechnology',
            'title': 'Valid Title',
            'description': 'Valid long description for testing',
            'room_number': 'A-204'
        }), content_type='application/json')
        self.assertEqual(res3.status_code, 400)
        self.assertIn('category', res3.get_json()['validation_errors'])

        print("[PASS] Verified Complaint Form field validations")

    def test_leave_request_date_validation(self):
        """Test leave request validation: return date cannot be before departure date"""
        self.login_as('student')
        payload = {
            'leave_type': 'Home Visit',
            'departure_date': '2026-11-15 10:00',
            'return_date': '2026-11-10 10:00', # 5 days before departure!
            'reason': 'Visiting parents',
            'parent_contact': '+91 98765 43210',
            'destination_address': 'Delhi'
        }
        res = self.client.post('/api/leave-requests', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, 400)
        errors = res.get_json()['validation_errors']
        self.assertIn('return_date', errors)
        self.assertIn('earlier than departure', errors['return_date'])
        print("[PASS] Verified Leave Request Date Range validation (return cannot be before departure)")

    def test_food_feedback_rating_boundaries(self):
        """Test food feedback rating validation: ratings must be between 1 and 5"""
        self.login_as('student')

        # Out of bounds rating (0)
        res1 = self.client.post('/api/mess/feedback', data=json.dumps({
            'meal_type': 'Lunch',
            'rating': 0,
            'hygiene_rating': 5
        }), content_type='application/json')
        self.assertEqual(res1.status_code, 400)

        # Out of bounds rating (6)
        res2 = self.client.post('/api/mess/feedback', data=json.dumps({
            'meal_type': 'Lunch',
            'rating': 6,
            'hygiene_rating': 5
        }), content_type='application/json')
        self.assertEqual(res2.status_code, 400)

        print("[PASS] Verified Food Feedback rating boundaries (1 to 5 stars)")

    def test_duplicate_room_conflict(self):
        """Test admin adding an already existing room number returns 409 Conflict"""
        self.login_as('admin')
        payload = {
            'room_number': 'A-201', # Already seeded in database!
            'block': 'Block A',
            'floor': 2,
            'capacity': 2,
            'room_type': 'AC'
        }
        res = self.client.post('/api/admin/rooms', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, 409)
        self.assertIn('already exists', res.get_json()['error'])
        print("[PASS] Verified Room Duplicate Conflict returns HTTP 409")

    # --- Search and Filters Tests ---

    def test_complaints_search_and_filters(self):
        """Test complaints filtering by status, category, urgency, and text search"""
        self.login_as('warden')

        # Filter by status
        res_open = self.client.get('/api/complaints?status=Open')
        self.assertEqual(res_open.status_code, 200)
        for c in res_open.get_json()['complaints']:
            self.assertEqual(c['status'], 'Open')

        # Filter by category
        res_elec = self.client.get('/api/complaints?category=Electrical')
        self.assertEqual(res_elec.status_code, 200)
        for c in res_elec.get_json()['complaints']:
            self.assertEqual(c['category'], 'Electrical')

        # Search query
        res_search = self.client.get('/api/complaints?search=fan')
        self.assertEqual(res_search.status_code, 200)
        for c in res_search.get_json()['complaints']:
            self.assertTrue('fan' in c['title'].lower() or 'fan' in c['description'].lower())

        print("[PASS] Verified Complaint Search & Filter queries")

    # --- Data Persistence Across Refresh ---

    def test_data_persistence_after_refresh(self):
        """Verify data committed to SQLite persists independently of client session"""
        # Session A: Student creates a complaint
        client_a = app.test_client()
        client_a.post('/api/auth/quick-switch', data=json.dumps({'role': 'student'}), content_type='application/json')
        submit_res = client_a.post('/api/complaints', data=json.dumps({
            'category': 'Plumbing',
            'title': 'Washbasin drain pipe leaking water',
            'description': 'Persistent drip under the sink pooling water on floor.',
            'room_number': 'A-204',
            'urgency': 'Medium'
        }), content_type='application/json')
        self.assertEqual(submit_res.status_code, 201)
        complaint_id = submit_res.get_json()['complaint']['id']

        # Session B: Completely fresh client simulates a browser refresh or separate device
        client_b = app.test_client()
        client_b.post('/api/auth/quick-switch', data=json.dumps({'role': 'warden'}), content_type='application/json')
        get_res = client_b.get(f'/api/complaints?search={complaint_id}')
        self.assertEqual(get_res.status_code, 200)
        complaints = get_res.get_json()['complaints']
        matching = [c for c in complaints if c['id'] == complaint_id]
        self.assertEqual(len(matching), 1, "Data did not persist across sessions!")
        self.assertEqual(matching[0]['title'], 'Washbasin drain pipe leaking water')

        # Direct SQL query verification
        conn = get_db()
        db_record = conn.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
        conn.close()
        self.assertIsNotNone(db_record, "Record missing from underlying SQLite database")
        self.assertEqual(db_record['status'], 'Open')

        print(f"[PASS] Verified Data Persistence: Complaint #{complaint_id} verified directly in SQLite database across independent sessions")

if __name__ == '__main__':
    unittest.main()
