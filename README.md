# MANN Smart Hostel OS

An enterprise campus residential administration platform engineered with a clean full-stack architecture, featuring real-time role-based access control (RBAC), SQLite ACID data persistence, strict confidential wellness data isolation, and a comprehensive automated QA test suite.

---

## 🚀 Quick Start

### 1. Requirements
- Python 3.10+
- Flask (`pip install flask requests`)

### 2. Start the Application Server
```bash
python3 app.py
```
The application server runs locally at: **`http://127.0.0.1:5050`**

### 3. Run the Automated Test Suites
```bash
# Run unit, integration, RBAC, validation, and HTML tests
python3 -m unittest discover -s tests -p "test_*.py" -v

# Run live end-to-end HTTP workflow execution test
python3 tests/test_live_server.py
```

---

## 👥 Demo Accounts & Roles

| Role | Username | Password | Full Name / Scope |
| :--- | :--- | :--- | :--- |
| **Student** | `student1` | `Student@123` | Aarav Sharma (Room A-204, Bed A) |
| **Student** | `student2` | `Student@123` | Diya Patel (Room B-102, Bed B) |
| **Warden** | `warden1` | `Warden@123` | Col. Rajesh Verma (Hostel Disciplinary Desk) |
| **Maintenance** | `maint1` | `Maint@123` | Ramesh Kumar (Certified Electrician) |
| **Maintenance** | `maint2` | `Maint@123` | Suresh Verma (Master Plumber) |
| **Mess Manager** | `mess1` | `Mess@123` | Chef Anand Joshi (Dining Operations) |
| **Counsellor** | `counsel1` | `Counsel@123` | Dr. Priya Nair (Lead Licensed Psychologist) |
| **Admin** | `admin1` | `Admin@123` | Dr. Vikram Malhotra (Campus Housing Registrar) |

*(Note: The top header in the web application features a **Quick Role Switcher** bar for rapid testing across all 6 roles without manual re-login.)*

---

## 📋 Verified Workflows & QA Coverage

1. **Student Submits a Complaint**: Validates title, category, urgency, and room; creates an `Open` ticket.
2. **Warden Receives Complaint**: Disciplinary desk views ticket with priority indicators.
3. **Warden Assigns Maintenance Staff**: Assigns ticket to certified technician with work instructions; status becomes `Assigned`.
4. **Maintenance Staff Updates Complaint**: Technician logs diagnostic actions, transitions to `In Progress`, and closes with resolution notes to `Resolved`.
5. **Student Confirms Resolution**: Resident inspects repair, rates quality (1–5 stars), provides feedback, and transitions ticket to `Closed`.
6. **Student Submits Leave Request**: Enforces departure/return dates, guardian emergency contact, and outpass justification; status `Pending`.
7. **Warden Approves Leave Request**: Warden inspects student schedule and remarks; status transitions to `Approved`.
8. **Mess Manager Updates Daily Menu**: Chef updates nutritional and dietary meal plans for Breakfast, Lunch, Snacks, Dinner across 7 days.
9. **Student Submits Food Feedback**: Reviews catering quality and dining hall hygiene with star ratings.
10. **Student Books Hostel Facility**: Reserves Study Room, TT Table, Badminton Court, Gym, Music Room, or Laundry Slot with collision prevention (duplicate slot returns HTTP 409).
11. **Admin Adds Room & Allocates Bed**: Registrar creates room inventory and allocates individual beds to students.
12. **Counsellor Receives Appointment Request**: Student books confidential mental health consultation; licensed counsellor reviews and confirms session.

### Security & Privacy Protections
- **RBAC**: Protected routes enforce role constraints (HTTP 403 on violation).
- **Authentication**: Unauthenticated requests are rejected (HTTP 401).
- **Privacy of Wellness Records**: Strict encryption and isolation. General wardens, maintenance, mess managers, and administrators are barred (HTTP 403) from accessing student psychological records.

---

## 🌿 SMRU HACK DAY · HYDERABAD — Problem Statement #9

### Private Wellness Check-In for Hostel Students (MANN Care 2.0)

**Problem:** Students rarely approach counsellors until issues escalate, and hesitate to share intimate thoughts with cloud applications.
**Core Objective:** A private, safe sanctuary for daily emotional check-ins, recognizing patterns over time, and rapid connection to counsellors or emergency helplines. Supports professional care without diagnosing or replacing human clinicians.

### Architectural Tiers Completed

| Tier | Status | Key Capabilities |
| :--- | :--- | :--- |
| **Priority 1: Essential** | ✅ Complete | • **Local-First Dexie.js IndexedDB**: Mood records and notes stay on-device.<br>• **Web Crypto AES-GCM 256**: Key derivation with PBKDF2 (100,000 iterations) + salt.<br>• **PIN Security**: 4-digit PIN lock, auto-lock on inactivity, quick-lock button.<br>• **Daily Wellness Check-In (<60s)**: Mood emojis, stress slider (1–10), sleep quality, skippable questions, and exact contextual tags (*Exams, Academics, Roommates, Friends, Homesickness, Family, Financial concerns, Personal, Other*).<br>• **Non-Diagnostic Insights**: 7-day vs 30-day mood trends, sleep vs stress correlation chart, tag frequencies (purely observational; zero diagnoses).<br>• **Visible Support Directory**: Tele-MANAS (14416), National Emergency (112), KIRAN (1800-599-0019), and direct campus counsellor desk. |
| **Priority 2: Important Enhancements** | ✅ Complete | • **Hostel Stealth Mode (`Esc` / `Alt+S`)**: Disguises the UI into an innocuous academic study planner ("Algorithms & Distributed Systems Notes"), suppresses sensitive notifications into scratchpad notes, and enables instant quick-lock.<br>• **Private Journal**: Full-text search, tag filter, mood filter, inline editing with re-encryption, and hidden previews.<br>• **Local Rules Support Suggestion**: On-device transparent pattern detection (e.g. stress ≥ 7 for 3 consecutive days) with gentle, dismissible support prompts.<br>• **Encrypted Backup & Restore (`.enc`)**: Export/import vault with master passphrase using client-side Web Crypto. |
| **Priority 3: Advanced Features** | ✅ Complete | • **Anonymous Counsellor Booking**: Session alias generation (e.g. `Student #402`) with transparent privacy guarantees (zero journal entries or mood logs sent to desk).<br>• **Progressive Web App (PWA)**: Offline support with `wellness-sw.js` service worker, manifest, responsive mobile navigation, and biometric/PIN protection. |
| **Gemma-4 Safe Space** | ✅ Complete | • **Reflection Companion (`gemma-4-26b-a4b-it`)**: Empathetic, supportive coping perspective powered by Google AI Studio / Gemma-4.<br>• **Zero-Latency Fallback**: Context-aware on-device reflection engine for exam pressure, roommate boundaries, homesickness, sleep, and 5-4-3-2-1 grounding.<br>• **Crisis Safety Barrier**: Immediate detection of self-harm/suicide terms with instantaneous escalation to Tele-MANAS (14416) and 112. |

### API Configuration
To configure or toggle the Google AI Studio Gemma-4 integration, edit `.env`:
```env
GEMINI_API_KEY=your_google_ai_studio_api_key_here
GOOGLE_API_KEY=your_google_ai_studio_api_key_here
GEMMA4_MODEL=gemma-4-26b-a4b-it
```
- **Live Cloud API**: Automatic when Google AI Studio credentials are configured.
- **Offline Fallback**: Seamless, instantaneous on-device neural reflection core when running without internet or external API access.

---

## 🧪 Verification & Test Suite Summary

Run the automated test runner:
```bash
python3 run_all_tests.py
```
- **Test Suites**: 6 Suites (`test_wellness_gemma4.py`, `test_mann2_workflows.py`, `test_workflows.py`, `test_security_rbac.py`, `test_validation_persistence.py`, `test_frontend_html.py`)
- **Total Tests Passing**: **42 / 42 Tests OK**
- **Browser E2E Tests**: **7 / 7 Headless Chrome Tests OK** (`tests/test_browser_e2e.py`)
- **Live HTTP Server Verification**: **12 / 12 Real-Time Workflows OK** (`tests/test_live_server.py`)

