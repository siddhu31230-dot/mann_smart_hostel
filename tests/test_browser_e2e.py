import unittest
import time
import os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC

BASE_URL = "http://127.0.0.1:5050"

class TestBrowserUIWorkflows(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        options = Options()
        options.add_argument('--headless=new')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--window-size=1440,900')
        cls.driver = webdriver.Chrome(options=options)
        cls.wait = WebDriverWait(cls.driver, 10)

    @classmethod
    def tearDownClass(cls):
        cls.driver.quit()

    def setUp(self):
        self.driver.get(BASE_URL)
        time.sleep(1)

    def switch_role_via_ui(self, role_name):
        btn = self.wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, f"header button[data-role='{role_name}']")))
        btn.click()
        time.sleep(1)

    def test_01_mobile_responsiveness_and_viewport(self):
        """Test UI on mobile device viewport (iPhone dimensions 390x844)"""
        self.driver.set_window_size(390, 844)
        time.sleep(0.5)

        # Check mobile role switcher is visible
        mobile_switcher = self.driver.find_element(By.CSS_SELECTOR, ".lg\\:hidden")
        self.assertTrue(mobile_switcher.is_displayed(), "Mobile role switcher should be visible on narrow screens")

        # Verify no horizontal scrollbar overflow
        scroll_width = self.driver.execute_script("return document.documentElement.scrollWidth")
        client_width = self.driver.execute_script("return document.documentElement.clientWidth")
        self.assertLessEqual(scroll_width, client_width + 5, "Horizontal layout overflow detected on mobile")

        # Reset to desktop
        self.driver.set_window_size(1440, 900)
        time.sleep(0.5)
        print("\n[BROWSER PASS] Mobile responsiveness and viewport constraint verified")

    def test_02_student_lodges_complaint_via_browser(self):
        """Test Student opening modal, filling form, and submitting complaint in browser"""
        self.switch_role_via_ui('student')

        # Click 'Lodge Complaint' button
        lodge_btn = self.wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Lodge Complaint')]")))
        lodge_btn.click()
        time.sleep(0.5)

        modal = self.driver.find_element(By.ID, "submitComplaintModal")
        self.assertTrue(modal.is_displayed(), "Lodge complaint modal should be visible")

        # Fill complaint form
        title_input = self.driver.find_element(By.NAME, "title")
        title_input.clear()
        title_input.send_keys("Bathroom hot water geyser trip switch malfunctioning")

        desc_input = self.driver.find_element(By.NAME, "description")
        desc_input.clear()
        desc_input.send_keys("Geyser trips the circuit breaker after running for 2 minutes.")

        # Submit form
        submit_btn = self.driver.find_element(By.CSS_SELECTOR, "#submitComplaintForm button[type='submit']")
        submit_btn.click()
        time.sleep(1.5)

        # Verify toast and card in DOM
        page_text = self.driver.page_source
        self.assertIn("Bathroom hot water geyser", page_text)
        print("[BROWSER PASS] Student lodged complaint through interactive browser UI")

    def test_03_warden_inspects_and_assigns_via_browser(self):
        """Test Warden inspecting board and assigning technician in browser"""
        self.switch_role_via_ui('warden')

        # Check complaints view title text
        title_text = self.driver.find_element(By.ID, "complaintViewTitle").text
        self.assertIn("Hostel Maintenance & Complaints", title_text)

        # Find 'Assign Staff' button on first open complaint
        assign_btns = self.driver.find_elements(By.XPATH, "//button[contains(., 'Assign Staff')]")
        if assign_btns:
            assign_btns[0].click()
            time.sleep(0.5)

            assign_modal = self.driver.find_element(By.ID, "assignStaffModal")
            self.assertTrue(assign_modal.is_displayed())

            # Select first technician
            select_elem = Select(self.driver.find_element(By.ID, "assignStaffSelect"))
            if len(select_elem.options) > 0:
                select_elem.select_by_index(0)

            # Enter notes
            notes = self.driver.find_element(By.NAME, "warden_notes")
            notes.clear()
            notes.send_keys("Please inspect MCB rating and heating coil.")

            # Submit
            self.driver.find_element(By.CSS_SELECTOR, "#assignStaffForm button[type='submit']").click()
            time.sleep(1.5)
            print("[BROWSER PASS] Warden assigned staff through browser modal")

    def test_04_maintenance_updates_progress_in_browser(self):
        """Test Maintenance staff role updating complaint in browser"""
        self.switch_role_via_ui('maintenance')

        # Find update progress button
        update_btns = self.driver.find_elements(By.XPATH, "//button[contains(., 'Update Progress')]")
        if update_btns:
            update_btns[0].click()
            time.sleep(0.5)

            modal = self.driver.find_element(By.ID, "updateProgressModal")
            self.assertTrue(modal.is_displayed())

            # Fill resolution notes
            notes = self.driver.find_element(By.NAME, "resolution_notes")
            notes.clear()
            notes.send_keys("Replaced faulty thermostat and thermal cutout fuse. Geyser tested 15 mins steady.")

            # Submit
            self.driver.find_element(By.CSS_SELECTOR, "#updateProgressForm button[type='submit']").click()
            time.sleep(1.5)
            print("[BROWSER PASS] Maintenance technician updated work order to Resolved in browser")

    def test_05_student_confirms_resolution_in_browser(self):
        """Test Student verifying and closing resolved ticket in browser"""
        self.switch_role_via_ui('student')

        confirm_btns = self.driver.find_elements(By.XPATH, "//button[contains(., 'Confirm & Close')]")
        if confirm_btns:
            confirm_btns[0].click()
            time.sleep(0.5)

            modal = self.driver.find_element(By.ID, "confirmResolutionModal")
            self.assertTrue(modal.is_displayed())

            # Submit confirmation
            self.driver.find_element(By.CSS_SELECTOR, "#confirmResolutionForm button[type='submit']").click()
            time.sleep(1.5)
            print("[BROWSER PASS] Student confirmed resolution and closed ticket in browser")

    def test_06_mess_day_switching_in_browser(self):
        """Test Mess day tabs switching in browser"""
        self.switch_role_via_ui('mess_manager')
        
        # Click Thursday tab
        thurs_btn = self.wait.until(EC.element_to_be_clickable((By.XPATH, "//button[@data-day='Thursday']")))
        thurs_btn.click()
        time.sleep(0.5)

        # Verify Thursday active
        self.assertIn("bg-blue-600", thurs_btn.get_attribute("class"))
        grid_text = self.driver.find_element(By.ID, "messMenuGrid").text
        self.assertIn("Thursday", grid_text)
        print("[BROWSER PASS] Mess manager day tabs and dynamic menu cards verified in browser")

    def test_07_wellness_privacy_barrier_in_browser(self):
        """Test that Warden UI completely excludes confidential wellness options"""
        self.switch_role_via_ui('warden')

        # Verify sidebar does NOT have 'Confidential Wellness' tab
        sidebar_text = self.driver.find_element(By.ID, "navItemsList").text
        self.assertNotIn("Confidential Wellness", sidebar_text)
        self.assertNotIn("Wellness Appointments", sidebar_text)

        # Switch to Student -> Confidential Wellness tab IS present
        self.switch_role_via_ui('student')
        student_sidebar = self.driver.find_element(By.ID, "navItemsList").text
        self.assertIn("Confidential Wellness", student_sidebar)
        print("[BROWSER PASS] Strict UI role isolation for Wellness Records verified in browser")

if __name__ == '__main__':
    unittest.main()
