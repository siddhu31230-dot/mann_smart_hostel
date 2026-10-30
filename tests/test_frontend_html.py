import unittest
import os

class TestFrontendHTMLAndResponsive(unittest.TestCase):
    def setUp(self):
        self.html_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'static', 'index.html'))
        self.js_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'static', 'js', 'app.js'))
        with open(self.html_path, 'r', encoding='utf-8') as f:
            self.html = f.read()
        with open(self.js_path, 'r', encoding='utf-8') as f:
            self.js = f.read()

    def test_mobile_viewport_and_meta(self):
        """Test mobile responsiveness meta tags and Tailwind viewport configurations"""
        self.assertIn('<meta name="viewport" content="width=device-width, initial-scale=1.0">', self.html)
        self.assertIn('overflow-x-hidden', self.html, "HTML must prevent horizontal overflow on mobile")
        self.assertIn('md:flex-row', self.html, "Layout must collapse to single column on mobile screens")
        print("[PASS] Mobile responsiveness viewport and structural classes verified")

    def test_empty_states_implemented(self):
        """Verify empty state templates are rendered for zero records across modules"""
        empty_state_indicators = [
            'No Complaints Found',
            'No Leave Requests Found',
            'No Rooms Found',
            'No Counseling Sessions Logged',
            'No Reviews Yet'
        ]
        for indicator in empty_state_indicators:
            self.assertTrue(indicator in self.html or indicator in self.js, f"Empty state missing: {indicator}")
        print("[PASS] Empty states confirmed across Complaints, Leave, Rooms, Wellness, and Dining")

    def test_form_validation_attributes(self):
        """Verify HTML form input validation attributes (required, minlength, type)"""
        forms_to_check = [
            'id="submitComplaintForm"',
            'id="submitLeaveForm"',
            'id="updateMessMenuForm"',
            'id="submitFoodFeedbackForm"',
            'id="bookFacilityForm"',
            'id="addRoomForm"',
            'id="allocateBedForm"',
            'id="requestWellnessForm"'
        ]
        for form in forms_to_check:
            self.assertIn(form, self.html, f"Missing required modal form: {form}")

        # Check required tags
        self.assertIn('name="departure_date" required', self.html)
        self.assertIn('name="return_date" required', self.html)
        self.assertIn('name="parent_contact" required minlength="8"', self.html)
        self.assertIn('name="confidential_notes" required minlength="5"', self.html)
        print("[PASS] Form client-side constraints and modal markup verified")

    def test_wellness_privacy_dom_safeguards(self):
        """Verify privacy safeguards in DOM and JS"""
        self.assertIn('id="wellnessPrivacyNotice"', self.html)
        self.assertIn('Strict Institutional Confidentiality Guarantee', self.html)
        self.assertIn('role === \'student\' || role === \'counsellor\'', self.js)
        print("[PASS] DOM wellness privacy safeguards verified")

if __name__ == '__main__':
    unittest.main()
