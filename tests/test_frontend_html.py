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
            'No Leave Records Found',
            'No Registered Visitors',
            'No Laundry Requests Active',
            'No Confidential Sessions Booked'
        ]
        for indicator in empty_state_indicators:
            self.assertTrue(indicator in self.html or indicator in self.js, f"Empty state missing: {indicator}")
        print("[PASS] Empty states confirmed across Complaints, Leave, Visitors, Laundry, and Wellness")

    def test_form_validation_and_modals(self):
        """Verify HTML form input validation attributes and modal elements exist"""
        modals_to_check = [
            'id="studentLoginModal"',
            'id="adminLoginModal"',
            'id="registerModal"',
            'id="submitComplaintModal"',
            'id="applyLeaveModal"',
            'id="submitMessFeedbackModal"',
            'id="requestLaundryModal"',
            'id="requestCleaningModal"',
            'id="requestVisitorModal"',
            'id="createCommunityPostModal"',
            'id="bookWellnessModal"',
            'id="publishAnnouncementModal"',
            'id="addRoomModal"',
            'id="allocateBedModal"'
        ]
        for modal in modals_to_check:
            self.assertIn(modal, self.html, f"Missing required modal: {modal}")

        # Check required tags
        self.assertIn('id="leaveStartDate" required', self.html)
        self.assertIn('id="leaveEndDate" required', self.html)
        self.assertIn('id="complaintTitle" required', self.html)
        self.assertIn('id="studentLoginInput" required', self.html)
        print("[PASS] Form client-side constraints and modal markup verified")

    def test_wellness_privacy_dom_safeguards(self):
        """Verify privacy safeguards in DOM and JS"""
        self.assertIn('id="wellnessPrivacyNotice"', self.html)
        self.assertIn('Confidentiality Seal', self.html)
        self.assertIn('loadWellnessAppointments', self.js)
        print("[PASS] DOM wellness privacy safeguards verified")

if __name__ == '__main__':
    unittest.main()
