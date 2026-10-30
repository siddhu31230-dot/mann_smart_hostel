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
