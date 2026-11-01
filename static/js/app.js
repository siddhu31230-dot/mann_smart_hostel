/**
 * MANN Smart Hostel OS 2.0 - Client Application Controller
 * Handles Landing, Separate Student & Admin Portals, Responsive Navigation,
 * 12 Student Modules, 13 Admin Modules, Modals, Toasts, Theme & API Endpoints.
 */

const app = {
    currentUser: null,
    activeRole: 'student',
    activeSubTab: null,
    cachedRooms: [],
    cachedStaff: [],
    cachedStudents: [],
    currentMessDay: 'Monday',

    async init() {
        this.initTheme();
        this.setupEventListeners();
        this.loadPublicMetrics();
        await this.checkAuth();

        if (!this.currentUser) {
            this.openRoleLogin('student');
        }
    },

    async loadPublicMetrics() {
        try {
            const res = await fetch('/api/public-metrics');
            if (res.ok) {
                const data = await res.json();
                const occ = document.getElementById('heroOccupancyVal');
                const sla = document.getElementById('heroSLAVal');
                const food = document.getElementById('heroFoodVal');
                if (occ) occ.textContent = `${data.occupancy_rate}%`;
                if (sla) sla.textContent = `${data.sla_minutes} Mins`;
                if (food) food.textContent = `${data.avg_food_rating} / 5.0`;
            }
        } catch (e) {}
    },

    // ==========================================
    // THEME MANAGEMENT (White Light / Sky Dark)
    // ==========================================
    initTheme() {
        const savedTheme = localStorage.getItem('mann_theme');
        if (savedTheme === 'light') {
            this.applyTheme(false);
        } else {
            this.applyTheme(true);
        }
    },

    toggleTheme() {
        const isCurrentlyDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark-theme');
        const willBeDark = !isCurrentlyDark;
        this.applyTheme(willBeDark);
        localStorage.setItem('mann_theme', willBeDark ? 'dark' : 'light');
        this.showToast(willBeDark ? '🌙 Switched to Dark Forest Theme' : '☀️ Switched to Light Cream Theme', 'info');
    },

    applyTheme(isDark) {
        if (isDark) {
            document.documentElement.classList.add('dark');
            document.body.classList.add('dark-theme');
            document.body.classList.remove('light-theme');
        } else {
            document.documentElement.classList.remove('dark');
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
        }
        const icon = document.getElementById('themeIcon');
        if (icon) {
            icon.className = isDark ? 'fa-solid fa-sun text-amber-400 text-sm' : 'fa-solid fa-moon text-sm';
        }
    },

    // ==========================================
    // NAVIGATION & VIEW SWITCHING
    // ==========================================
    navigateTo(view) {
        const landing = document.getElementById('view-landing');
        const workspace = document.getElementById('view-workspace');
        const login = document.getElementById('view-login');

        if (view === 'workspace') {
            if (landing) landing.classList.add('hidden');
            if (login) login.classList.add('hidden');
            if (workspace) workspace.classList.remove('hidden');
        } else if (view === 'login') {
            if (landing) landing.classList.add('hidden');
            if (workspace) workspace.classList.add('hidden');
            if (login) login.classList.remove('hidden');
            window.location.hash = '#login';
        } else if (view === 'landing') {
            if (!this.currentUser) {
                this.navigateTo('login');
                return;
            }
            if (landing) landing.classList.remove('hidden');
            if (workspace) workspace.classList.add('hidden');
            if (login) login.classList.add('hidden');
            window.location.hash = '';
        }
    },

    renderSidebar() {
        const navList = document.getElementById('navItemsList');
        if (!navList || !this.currentUser) return;

        const role = this.currentUser.role;
        navList.innerHTML = '';

        let items = [];
        let portalTitle = 'Student Portal';
        let portalSubtext = '';

        if (role === 'student') {
            portalTitle = 'Student Resident Portal';
            portalSubtext = `${this.currentUser.college_id || 'ID Pending'} • Room ${this.currentUser.room_number || 'A-204'} (${this.currentUser.bed_number || 'Bed A'})`;
            items = [
                { id: 'my-room', icon: 'fa-door-open', label: 'My Room & NFC Pass', type: 'student' },
                { id: 'complaints', icon: 'fa-wrench', label: 'My Complaints', type: 'student' },
                { id: 'mess', icon: 'fa-utensils', label: 'Mess Menu & Ratings', type: 'student' },
                { id: 'leaves', icon: 'fa-calendar-check', label: 'Leave Requests & Gate Pass', type: 'student' },
                { id: 'fees', icon: 'fa-credit-card', label: 'Fees & Payment Receipts', type: 'student' },
                { id: 'laundry', icon: 'fa-shirt', label: 'Laundry Service', type: 'student' },
                { id: 'cleaning', icon: 'fa-broom', label: 'Housekeeping Request', type: 'student' },
                { id: 'visitors', icon: 'fa-id-badge', label: 'Visitor Out-Pass', type: 'student' },
                { id: 'community', icon: 'fa-users', label: 'Community Hub', type: 'student' },
                { id: 'announcements', icon: 'fa-bullhorn', label: 'Campus Announcements', type: 'student' },
                { id: 'mann-care', icon: 'fa-shield-heart', label: 'MANN Care (Confidential)', type: 'student', special: 'text-emerald-400' },
                { id: 'profile', icon: 'fa-id-card', label: 'Resident Profile', type: 'student' }
            ];
        } else if (role === 'warden') {
            portalTitle = 'Hostel Warden Command';
            portalSubtext = `Chief Warden: ${this.currentUser.full_name || 'Col. Rajesh Verma'}`;
            items = [
                { id: 'admin-overview', icon: 'fa-shield-halved', label: 'Warden Command Hub', type: 'admin' },
                { id: 'admin-leaves', icon: 'fa-envelope-open-text', label: 'Leave Approvals & Out-Pass', type: 'admin' },
                { id: 'admin-complaints', icon: 'fa-triangle-exclamation', label: 'Complaint Queue & Hazard Triage', type: 'admin' },
                { id: 'admin-students', icon: 'fa-user-graduate', label: 'Student Resident Directory', type: 'admin' },
                { id: 'admin-visitors', icon: 'fa-id-badge', label: 'Visitor Gate Log', type: 'admin' },
                { id: 'admin-announcements', icon: 'fa-bullhorn', label: 'Broadcast Urgent Notice', type: 'admin' }
            ];
        } else if (role === 'maintenance') {
            portalTitle = 'Facilities & Maintenance Hub';
            portalSubtext = `Technician Lead: ${this.currentUser.full_name || 'Ramesh Kumar'}`;
            items = [
                { id: 'admin-maintenance', icon: 'fa-screwdriver-wrench', label: 'Work Orders & Dispatch', type: 'admin' },
                { id: 'admin-complaints', icon: 'fa-list-check', label: 'Repair Tickets & Gemma-4 SLAs', type: 'admin' },
                { id: 'facilities', icon: 'fa-volleyball', label: 'Facilities & Room Checks', type: 'admin' },
                { id: 'admin-announcements', icon: 'fa-bullhorn', label: 'Maintenance Service Bulletins', type: 'admin' }
            ];
        } else if (role === 'mess_manager') {
            portalTitle = 'Dining & Mess Operations';
            portalSubtext = `Executive Chef: ${this.currentUser.full_name || 'Chef Anand Joshi'}`;
            items = [
                { id: 'admin-mess', icon: 'fa-utensils', label: 'Weekly Dining Menu Editor', type: 'admin' },
                { id: 'admin-analytics', icon: 'fa-chart-pie', label: 'Food Sentiment & Ratings', type: 'admin' },
                { id: 'admin-announcements', icon: 'fa-bullhorn', label: 'Dining Broadcasts & Menus', type: 'admin' }
            ];
        } else if (role === 'counsellor') {
            portalTitle = 'Student Wellness & Counselling';
            portalSubtext = `Psychological Counsellor: ${this.currentUser.full_name || 'Dr. Priya Nair'}`;
            items = [
                { id: 'counselor-sessions', icon: 'fa-user-doctor', label: 'Confidential Appointments', type: 'admin' },
                { id: 'counselor-sanctuary', icon: 'fa-spa', label: 'Launch MANN Care Sanctuary', type: 'action', action: () => window.open('/wellness', '_blank') },
                { id: 'admin-announcements', icon: 'fa-bullhorn', label: 'Mental Wellness Bulletins', type: 'admin' }
            ];
        } else {
            // Super Admin
            portalTitle = 'Super Admin Console';
            portalSubtext = `Housing Director: ${this.currentUser.full_name || 'Dr. Vikram Malhotra'}`;
            items = [
                { id: 'admin-overview', icon: 'fa-chart-line', label: 'Executive Overview', type: 'admin' },
                { id: 'admin-students', icon: 'fa-user-graduate', label: 'Student Management & Approvals', type: 'admin' },
                { id: 'admin-rooms', icon: 'fa-hotel', label: 'Room & Bed Allocations', type: 'admin' },
                { id: 'admin-complaints', icon: 'fa-list-check', label: 'Complaints Master Queue', type: 'admin' },
                { id: 'admin-leaves', icon: 'fa-envelope-open-text', label: 'Leave Approvals Log', type: 'admin' },
                { id: 'admin-mess', icon: 'fa-utensils', label: 'Mess Operations & Menus', type: 'admin' },
                { id: 'admin-visitors', icon: 'fa-id-badge', label: 'Visitor Gate Log', type: 'admin' },
                { id: 'admin-staff', icon: 'fa-user-shield', label: 'Staff Directory & Roles', type: 'admin' },
                { id: 'admin-maintenance', icon: 'fa-screwdriver-wrench', label: 'Maintenance Hub', type: 'admin' },
                { id: 'admin-finance', icon: 'fa-coins', label: 'Finance & Student Ledger', type: 'admin' },
                { id: 'admin-announcements', icon: 'fa-bullhorn', label: 'Announcements Publisher', type: 'admin' },
                { id: 'admin-analytics', icon: 'fa-chart-pie', label: 'Gemma-4 AI Intelligence', type: 'admin' },
                { id: 'admin-settings', icon: 'fa-sliders', label: 'System Configurations', type: 'admin' }
            ];
        }

        const portalNameEl = document.getElementById('sidebarPortalName');
        const subtextEl = document.getElementById('sidebarUserSubtext');
        if (portalNameEl) portalNameEl.textContent = portalTitle;
        if (subtextEl) subtextEl.textContent = portalSubtext;

        items.forEach(item => {
            const btn = document.createElement('button');
            btn.className = `w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-left transition hover:bg-[#1b4332] text-[#8fb89e] hover:text-[#fefae0]`;
            btn.dataset.tab = item.id;
            if (item.action) {
                btn.onclick = item.action;
            } else if (item.type === 'student') {
                btn.onclick = () => this.navigateToStudentSubTab(item.id);
            } else {
                btn.onclick = () => this.navigateToAdminSubTab(item.id);
            }
            btn.innerHTML = `<i class="fa-solid ${item.icon} w-5 text-center ${item.special || 'text-[#52b788]'}"></i> <span>${item.label}</span>`;
            navList.appendChild(btn);
        });

        const privNotice = document.getElementById('wellnessPrivacyNotice');
        if (privNotice) {
            if (role === 'counsellor' || role === 'student') privNotice.classList.remove('hidden');
            else privNotice.classList.add('hidden');
        }
    },

    navigateToStudentSubTab(tabId) {
        this.activeSubTab = tabId;
        // Hide all subviews
        document.querySelectorAll('.subview-panel').forEach(p => p.classList.add('hidden'));

        // Target map
        const viewIdMap = {
            'my-room': 'view-student-my-room',
            'complaints': 'view-student-complaints',
            'mess': 'view-student-mess',
            'leaves': 'view-student-leaves',
            'fees': 'view-student-fees',
            'laundry': 'view-student-laundry',
            'cleaning': 'view-student-cleaning',
            'visitors': 'view-student-visitors',
            'community': 'view-student-community',
            'announcements': 'view-student-announcements',
            'mann-care': 'view-student-mann-care',
            'profile': 'view-student-profile'
        };

        const targetView = document.getElementById(viewIdMap[tabId]);
        if (targetView) targetView.classList.remove('hidden');

        // Update active class on sidebar
        document.querySelectorAll('#navItemsList button').forEach(btn => {
            if (btn.dataset.tab === tabId) {
                btn.className = 'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-left transition bg-[#2d6a4f] text-[#fefae0] font-bold shadow-md border border-[#52b788]/40';
            } else {
                btn.className = 'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-left transition hover:bg-[#1b4332] text-[#8fb89e] hover:text-[#fefae0]';
            }
        });

        // Load data for the tab
        if (tabId === 'my-room') this.loadStudentRoomDetails();
        else if (tabId === 'complaints') this.loadComplaints();
        else if (tabId === 'mess') { this.loadMessMenu(); this.loadMessFeedback(); }
        else if (tabId === 'leaves') this.loadLeaveRequests();
        else if (tabId === 'fees') this.loadStudentFees();
        else if (tabId === 'laundry') this.loadLaundryRequests();
        else if (tabId === 'cleaning') this.loadCleaningRequests();
        else if (tabId === 'visitors') this.loadVisitorRequests();
        else if (tabId === 'community') this.loadCommunityPosts();
        else if (tabId === 'announcements') this.loadAnnouncements();
        else if (tabId === 'mann-care') this.loadWellnessAppointments();
        else if (tabId === 'profile') this.loadStudentProfile();
    },

    navigateToAdminSubTab(tabId) {
        this.activeSubTab = tabId;
        // Hide all subviews
        document.querySelectorAll('.subview-panel').forEach(p => p.classList.add('hidden'));

        const targetView = document.getElementById(`view-${tabId}`);
        if (targetView) targetView.classList.remove('hidden');

        // Update active class on sidebar
        document.querySelectorAll('#navItemsList button').forEach(btn => {
            if (btn.dataset.tab === tabId) {
                btn.className = 'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-left transition bg-[#2d6a4f] text-[#fefae0] font-bold shadow-md border border-[#52b788]/40';
            } else {
                btn.className = 'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-left transition hover:bg-[#1b4332] text-[#8fb89e] hover:text-[#fefae0]';
            }
        });

        // Load data
        if (tabId === 'admin-overview') this.loadAdminOverview();
        else if (tabId === 'admin-students') { this.loadPendingStudents(); this.loadAdminStudents(); }
        else if (tabId === 'admin-rooms') this.loadRooms();
        else if (tabId === 'admin-complaints') this.loadComplaints();
        else if (tabId === 'admin-leaves') this.loadLeaveRequests();
        else if (tabId === 'admin-mess') { this.loadAdminMessMenuDay(); this.loadMessFeedback(); }
        else if (tabId === 'admin-visitors') this.loadVisitorRequests();
        else if (tabId === 'admin-staff') this.loadAdminStaff();
        else if (tabId === 'admin-maintenance') this.loadComplaints();
        else if (tabId === 'admin-finance') this.loadAdminFinance();
        else if (tabId === 'admin-announcements') this.loadAnnouncements();
        else if (tabId === 'admin-analytics') this.loadAdminAnalytics();
        else if (tabId === 'admin-settings') this.loadAdminSettings();
        else if (tabId === 'counselor-sessions') this.loadCounsellorAppointments();
        else if (tabId === 'facilities') this.loadFacilities();
    },

    // ==========================================
    // AUTHENTICATION & SESSIONS
    // ==========================================
    async checkAuth() {
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                this.setUser(data.user);
            } else {
                this.setUser(null);
            }
        } catch (e) {
            this.setUser(null);
        }
    },

    setUser(user) {
        this.currentUser = user;
        const unauth = document.getElementById('unauthHeaderActions');
        const auth = document.getElementById('authHeaderActions');
        const nameEl = document.getElementById('userFullName');
        const roleEl = document.getElementById('userRoleBadge');
        const avatarEl = document.getElementById('userAvatarText');

        if (user) {
            if (unauth) unauth.classList.add('hidden');
            if (auth) auth.classList.remove('hidden');

            if (nameEl) nameEl.textContent = user.full_name || user.username;
            if (roleEl) roleEl.textContent = (user.role || '').toUpperCase();
            if (avatarEl) {
                const initials = (user.full_name || user.username).substring(0, 2).toUpperCase();
                avatarEl.textContent = initials;
            }

            // Highlight quick-role buttons in header
            document.querySelectorAll('.role-btn').forEach(btn => {
                if (btn.dataset.role === user.role) {
                    btn.className = 'role-btn px-3 py-1.5 text-xs rounded-xl font-bold bg-gradient-to-r from-[#10b981] to-[#059669] text-white shadow-md shadow-emerald-950/40 border border-emerald-400/40';
                } else {
                    btn.className = 'role-btn px-3 py-1.5 text-xs rounded-xl font-medium text-[#8fb89e] hover:text-[#fefae0] hover:bg-[#1b4332] transition';
                }
            });

            this.navigateTo('workspace');
            this.renderSidebar();

            // Set initial tab based strictly on the user's role
            if (user.role === 'student') {
                const valid = ['my-room', 'complaints', 'mess', 'leaves', 'fees', 'laundry', 'cleaning', 'visitors', 'community', 'announcements', 'mann-care', 'profile'];
                this.navigateToStudentSubTab(valid.includes(this.activeSubTab) ? this.activeSubTab : 'my-room');
            } else if (user.role === 'warden') {
                const valid = ['admin-overview', 'admin-leaves', 'admin-complaints', 'admin-students', 'admin-visitors', 'admin-announcements'];
                this.navigateToAdminSubTab(valid.includes(this.activeSubTab) ? this.activeSubTab : 'admin-leaves');
            } else if (user.role === 'maintenance') {
                const valid = ['admin-maintenance', 'admin-complaints', 'facilities', 'admin-announcements'];
                this.navigateToAdminSubTab(valid.includes(this.activeSubTab) ? this.activeSubTab : 'admin-maintenance');
            } else if (user.role === 'mess_manager') {
                const valid = ['admin-mess', 'admin-analytics', 'admin-announcements'];
                this.navigateToAdminSubTab(valid.includes(this.activeSubTab) ? this.activeSubTab : 'admin-mess');
            } else if (user.role === 'counsellor') {
                const valid = ['counselor-sessions', 'counselor-sanctuary', 'admin-announcements'];
                this.navigateToAdminSubTab(valid.includes(this.activeSubTab) ? this.activeSubTab : 'counselor-sessions');
            } else {
                this.navigateToAdminSubTab(this.activeSubTab && this.activeSubTab.startsWith('admin-') ? this.activeSubTab : 'admin-overview');
            }
        } else {
            if (unauth) unauth.classList.remove('hidden');
            if (auth) auth.classList.add('hidden');
            this.openRoleLogin(this.activeLoginRole || 'student');
        }
    },

    activeLoginRole: 'student',

    loginRoleConfigs: {
        'student': {
            title: 'Student Resident Portal',
            scope: 'My Room, Leave Out-Pass, Mess & Care',
            idLabel: 'College ID / Username',
            idPlaceholder: 'e.g. NST2026-042 or student1',
            icon: 'fa-id-card',
            btnText: 'Sign In to Student Portal',
            demoUser: 'NST2026-042',
            demoPass: 'Student@123',
            demoLabel: 'Aarav Sharma (NST2026-042) / Student@123',
            portalParam: 'student'
        },
        'warden': {
            title: 'Hostel Warden Command',
            scope: 'Leave Approvals, Curfews & Disciplinary Queue',
            idLabel: 'Warden ID / Username',
            idPlaceholder: 'e.g. WARDEN-001 or warden1',
            icon: 'fa-shield-halved',
            btnText: 'Sign In to Warden Command',
            demoUser: 'WARDEN-001',
            demoPass: 'Warden@123',
            demoLabel: 'Col. Rajesh Verma (WARDEN-001) / Warden@123',
            portalParam: 'admin'
        },
        'admin': {
            title: 'Super Administrator Console',
            scope: 'Executive Campus Control, Rooms & Ledgers',
            idLabel: 'Admin ID / Username',
            idPlaceholder: 'e.g. ADMIN-001 or admin1',
            icon: 'fa-user-shield',
            btnText: 'Sign In to Admin Console',
            demoUser: 'ADMIN-001',
            demoPass: 'Admin@123',
            demoLabel: 'Dr. Vikram Malhotra (ADMIN-001) / Admin@123',
            portalParam: 'admin'
        },
        'maintenance': {
            title: 'Facilities & Maintenance Hub',
            scope: 'Repair Work Orders, SLAs & Housekeeping',
            idLabel: 'Staff ID / Username',
            idPlaceholder: 'e.g. MAINT-001 or maint1',
            icon: 'fa-screwdriver-wrench',
            btnText: 'Sign In to Maintenance Hub',
            demoUser: 'MAINT-001',
            demoPass: 'Maint@123',
            demoLabel: 'Ramesh Kumar (MAINT-001) / Maint@123',
            portalParam: 'admin'
        },
        'mess_manager': {
            title: 'Dining & Mess Operations',
            scope: 'Daily Menus, Grocery & Food Ratings',
            idLabel: 'Mess ID / Username',
            idPlaceholder: 'e.g. MESS-001 or mess1',
            icon: 'fa-utensils',
            btnText: 'Sign In to Mess Operations',
            demoUser: 'MESS-001',
            demoPass: 'Mess@123',
            demoLabel: 'Chef Anand Joshi (MESS-001) / Mess@123',
            portalParam: 'admin'
        },
        'counsellor': {
            title: 'Confidential Wellness Sanctuary',
            scope: 'Student Sessions • 100% Medical Privacy',
            idLabel: 'Counsellor ID / Username',
            idPlaceholder: 'e.g. COUNSEL-001 or counsel1',
            icon: 'fa-user-doctor',
            btnText: 'Sign In to Counsellor Desk',
            demoUser: 'COUNSEL-001',
            demoPass: 'Counsel@123',
            demoLabel: 'Dr. Priya Nair (COUNSEL-001) / Counsel@123',
            portalParam: 'admin'
        }
    },

    openRoleLogin(role = 'student') {
        this.navigateTo('login');
        this.switchLoginRole(role);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    switchLoginRole(role) {
        this.activeLoginRole = role;
        const cfg = this.loginRoleConfigs[role] || this.loginRoleConfigs['student'];

        document.querySelectorAll('.login-role-tab').forEach(tab => {
            const tabRole = tab.id.replace('loginTab-', '');
            if (tabRole === role) {
                tab.className = 'login-role-tab active py-2.5 px-1.5 rounded-xl text-center font-bold transition flex flex-col items-center justify-center';
            } else {
                tab.className = 'login-role-tab py-2.5 px-1.5 rounded-xl text-center font-bold transition flex flex-col items-center justify-center';
            }
        });

        const titleEl = document.getElementById('loginRoleTitle');
        const scopeEl = document.getElementById('loginRoleScope');
        const labelEl = document.getElementById('loginIdentifierLabel');
        const iconEl = document.getElementById('loginIdentifierIcon');
        const btnTextEl = document.getElementById('universalLoginBtnText');
        const demoCredsEl = document.getElementById('loginDemoCredsText');
        const errEl = document.getElementById('loginErrorMessage');

        if (titleEl) titleEl.textContent = cfg.title;
        if (scopeEl) scopeEl.textContent = cfg.scope;
        if (labelEl) labelEl.textContent = cfg.idLabel;
        if (iconEl) iconEl.className = `fa-solid ${cfg.icon} absolute left-3.5 top-3.5 text-[#52b788]`;
        if (btnTextEl) btnTextEl.textContent = cfg.btnText;
        if (demoCredsEl) demoCredsEl.textContent = cfg.demoLabel;
        if (errEl) errEl.classList.add('hidden');

        const inp = document.getElementById('universalLoginInput');
        const pass = document.getElementById('universalPasswordInput');
        if (inp) {
            inp.placeholder = cfg.idPlaceholder;
            inp.value = cfg.demoUser;
        }
        if (pass) pass.value = cfg.demoPass;
    },

    autoFillActiveLogin() {
        const cfg = this.loginRoleConfigs[this.activeLoginRole] || this.loginRoleConfigs['student'];
        const inp = document.getElementById('universalLoginInput');
        const pass = document.getElementById('universalPasswordInput');
        if (inp) inp.value = cfg.demoUser;
        if (pass) pass.value = cfg.demoPass;
        this.showToast(`Auto-filled ${cfg.title} credentials`, 'info');
    },

    autoFillAndSubmitActiveLogin() {
        this.autoFillActiveLogin();
        const form = document.getElementById('universalLoginForm');
        if (form) {
            if (typeof form.requestSubmit === 'function') {
                form.requestSubmit();
            } else {
                form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
        }
    },

    onBrandClick() {
        if (!this.currentUser) {
            this.openRoleLogin(this.activeLoginRole || 'student');
        } else if (this.currentUser.role === 'student') {
            this.navigateTo('workspace');
            this.navigateToStudentSubTab('my-room');
        } else if (this.currentUser.role === 'warden') {
            this.navigateTo('workspace');
            this.navigateToAdminSubTab('admin-leaves');
        } else if (this.currentUser.role === 'maintenance') {
            this.navigateTo('workspace');
            this.navigateToAdminSubTab('admin-maintenance');
        } else if (this.currentUser.role === 'mess_manager') {
            this.navigateTo('workspace');
            this.navigateToAdminSubTab('admin-mess');
        } else if (this.currentUser.role === 'counsellor') {
            this.navigateTo('workspace');
            this.navigateToAdminSubTab('counselor-sessions');
        } else {
            this.navigateTo('workspace');
            this.navigateToAdminSubTab('admin-overview');
        }
    },

    async quickFillAndLogin(role, id, pass) {
        this.activeLoginRole = role;
        const cfg = this.loginRoleConfigs[role] || this.loginRoleConfigs['student'];
        
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    login: id, 
                    password: pass, 
                    portal: cfg.portalParam 
                })
            });
            const data = await res.json();
            if (res.ok) {
                this.setUser(data.user);
                this.showToast(`Welcome back, ${data.user.full_name}! (${data.user.role.toUpperCase()})`, 'success');
            } else {
                this.showToast(data.error || 'Authentication rejected', 'error');
            }
        } catch (err) {
            this.showToast('Network error during authentication', 'error');
        }
    },

    async handleUniversalLoginForm(e) {
        if (e) e.preventDefault();
        const cfg = this.loginRoleConfigs[this.activeLoginRole] || this.loginRoleConfigs['student'];
        const login = document.getElementById('universalLoginInput').value.trim();
        const password = document.getElementById('universalPasswordInput').value;
        const errEl = document.getElementById('loginErrorMessage');
        const errText = document.getElementById('loginErrorText');
        const submitBtn = document.getElementById('universalLoginSubmitBtn');

        if (errEl) errEl.classList.add('hidden');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Verifying credentials...</span>';
        }

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    login, 
                    password, 
                    portal: cfg.portalParam 
                })
            });
            const data = await res.json();
            if (res.ok) {
                this.setUser(data.user);
                this.showToast(`Welcome back, ${data.user.full_name}! (${data.user.role.toUpperCase()})`, 'success');
            } else {
                if (errEl && errText) {
                    errText.textContent = data.error || 'Login failed. Please verify credentials.';
                    errEl.classList.remove('hidden');
                }
                this.showToast(data.error || 'Authentication rejected', 'error');
            }
        } catch (err) {
            if (errEl && errText) {
                errText.textContent = 'Network communication error. Please try again.';
                errEl.classList.remove('hidden');
            }
            this.showToast('Network connection failure', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-arrow-right-to-bracket"></i> <span>${cfg.btnText}</span>`;
            }
        }
    },

    async handleStudentLogin(e) {
        e.preventDefault();
        const login = document.getElementById('studentLoginInput').value.trim();
        const password = document.getElementById('studentPasswordInput').value;

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login, password, portal: 'student' })
            });
            const data = await res.json();
            if (res.ok) {
                this.closeModal('studentLoginModal');
                this.setUser(data.user);
                this.showToast(`Welcome back, ${data.user.full_name}!`, 'success');
            } else {
                this.showToast(data.error || 'Student login failed', 'error');
            }
        } catch (err) {
            this.showToast('Network error during student login', 'error');
        }
    },

    async handleAdminLogin(e) {
        e.preventDefault();
        const login = document.getElementById('adminLoginInput').value.trim();
        const password = document.getElementById('adminPasswordInput').value;

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login, password, portal: 'admin' })
            });
            const data = await res.json();
            if (res.ok) {
                this.closeModal('adminLoginModal');
                this.setUser(data.user);
                this.showToast(`Staff console unlocked: ${data.user.full_name}`, 'success');
            } else {
                this.showToast(data.error || 'Staff authentication rejected', 'error');
            }
        } catch (err) {
            this.showToast('Network error during staff login', 'error');
        }
    },

    async quickSwitch(role) {
        try {
            const res = await fetch('/api/auth/quick-switch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role })
            });
            const data = await res.json();
            if (res.ok) {
                this.setUser(data.user);
                this.showToast(`Switched active context to ${role.toUpperCase()}`, 'info');
            } else {
                this.showToast(data.error || 'Failed to switch role', 'error');
            }
        } catch (err) {
            this.showToast('Quick switch failed', 'error');
        }
    },

    async logout() {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (e) {}
        this.setUser(null);
        this.showToast('Logged out securely', 'info');
    },

    openWellnessInApp() {
        if (!this.currentUser) {
            this.quickSwitch('student').then(() => {
                this.navigateToStudentSubTab('mann-care');
            }).catch(() => {
                window.location.href = '/wellness';
            });
            return;
        }

        if (this.currentUser.role === 'student') {
            this.navigateTo('workspace');
            this.navigateToStudentSubTab('mann-care');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            window.open('/wellness', '_blank');
        }
    },

    async handleStudentRegister(e) {
        e.preventDefault();
        const payload = {
            full_name: document.getElementById('regFullName').value.trim(),
            college_id: document.getElementById('regCollegeId').value.trim(),
            username: document.getElementById('regUsername').value.trim(),
            email: document.getElementById('regEmail').value.trim(),
            phone: document.getElementById('regPhone').value.trim(),
            guardian_name: document.getElementById('regGuardianName').value.trim(),
            guardian_phone: document.getElementById('regGuardianPhone').value.trim(),
            password: document.getElementById('regPassword').value
        };

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                this.closeModal('registerModal');
                this.showToast('Registration submitted! Status: Pending Administrator Approval.', 'success');
            } else {
                this.showToast(data.error || 'Registration failed', 'error');
            }
        } catch (err) {
            this.showToast('Failed to submit registration', 'error');
        }
    },

    async handleForgotPassword(e) {
        e.preventDefault();
        const identifier = document.getElementById('forgotPasswordInput').value.trim();
        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier })
            });
            const data = await res.json();
            this.closeModal('forgotPasswordModal');
            this.showToast(data.message || 'Recovery instructions dispatched.', 'info');
        } catch (e) {
            this.showToast('Error processing recovery', 'error');
        }
    },

    // Demo Fill Helpers
    fillStudentDemo() {
        const inp = document.getElementById('studentLoginInput');
        const pass = document.getElementById('studentPasswordInput');
        if (inp) inp.value = 'NST2026-042';
        if (pass) pass.value = 'Student@123';
    },

    fillAndLoginStudent(id, pw) {
        this.openStudentLoginModal();
        const inp = document.getElementById('studentLoginInput');
        const pass = document.getElementById('studentPasswordInput');
        if (inp) inp.value = id;
        if (pass) pass.value = pw;
        document.getElementById('studentLoginForm').requestSubmit();
    },

    fillAdminDemo(role) {
        const roleMap = {
            'admin': { id: 'ADMIN-001', pass: 'Admin@123' },
            'warden': { id: 'WARDEN-001', pass: 'Warden@123' },
            'mess_manager': { id: 'MESS-001', pass: 'Mess@123' },
            'maintenance': { id: 'MAINT-001', pass: 'Maint@123' },
            'counsellor': { id: 'COUNS-001', pass: 'Couns@123' }
        };
        const creds = roleMap[role] || roleMap['admin'];
        const inp = document.getElementById('adminLoginInput');
        const pass = document.getElementById('adminPasswordInput');
        if (inp) inp.value = creds.id;
        if (pass) pass.value = creds.pass;
    },

    fillAndLoginAdmin(id, pw) {
        this.openAdminLoginModal();
        const inp = document.getElementById('adminLoginInput');
        const pass = document.getElementById('adminPasswordInput');
        if (inp) inp.value = id;
        if (pass) pass.value = pw;
        document.getElementById('adminLoginForm').requestSubmit();
    },

    // Password Toggle
    togglePasswordVisibility(inputId, iconId) {
        const input = document.getElementById(inputId);
        const icon = document.getElementById(iconId);
        if (!input) return;
        if (input.type === 'password') {
            input.type = 'text';
            if (icon) icon.className = 'fa-solid fa-eye-slash';
        } else {
            input.type = 'password';
            if (icon) icon.className = 'fa-solid fa-eye';
        }
    },

    // ==========================================
    // STUDENT MODULE: MY ROOM
    // ==========================================
    async loadStudentRoomDetails() {
        const c = document.getElementById('studentRoomDetailsContainer');
        if (!c) return;

        try {
            const res = await fetch('/api/student/room-details');
            if (!res.ok) throw new Error();
            const data = await res.json();
            this.currentRoomDetails = data;
            const room = data.room;

            if (!room) {
                c.innerHTML = `
                    <div class="forest-card p-8 rounded-3xl text-center space-y-3">
                        <i class="fa-solid fa-bed text-4xl text-[#8fb89e]"></i>
                        <h3 class="text-base font-bold text-[#fefae0]">No Room Allocated</h3>
                        <p class="text-xs text-[#8fb89e]">Your room assignment is currently being processed by hostel administration.</p>
                    </div>
                `;
                return;
            }

            const roommatesList = (data.roommates || []).map(r => `
                <div class="flex items-center justify-between p-2.5 rounded-xl bg-[#0f281e] border border-[#52b788]/20">
                    <div class="flex items-center gap-2.5">
                        <div class="w-7 h-7 rounded-full bg-gradient-to-tr from-[#2d6a4f] to-[#52b788] text-[#fefae0] flex items-center justify-center font-bold text-[11px] border border-[#52b788]/40 shadow-sm">
                            ${r.bed_identifier.slice(-1)}
                        </div>
                        <div>
                            <div class="text-xs font-bold text-[#fefae0]">${r.full_name}</div>
                            <div class="text-[10px] text-[#8fb89e]">${r.college_id}</div>
                        </div>
                    </div>
                    <span class="text-[10px] px-2 py-0.5 rounded bg-[#143528] text-[#52b788] border border-[#52b788]/30">${r.bed_identifier}</span>
                </div>
            `).join('');

            c.innerHTML = `
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div class="lg:col-span-2 forest-card p-6 rounded-3xl border border-[#52b788]/30 space-y-4">
                        <div class="flex items-center justify-between pb-3 border-b border-[#52b788]/20">
                            <div>
                                <span class="text-[11px] font-bold text-[#52b788] uppercase tracking-wider">${room.room_type}</span>
                                <h3 class="text-2xl font-extrabold text-[#fefae0] font-serif-title mt-0.5">Room ${room.room_number}</h3>
                            </div>
                            <span class="text-xs px-3 py-1 rounded-full bg-[#52b788]/20 text-[#52b788] border border-[#52b788]/40 font-bold">
                                Assigned Bed: ${data.my_bed}
                            </span>
                        </div>

                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div class="p-3 rounded-xl bg-[#0f281e] border border-[#52b788]/20">
                                <span class="text-[#8fb89e] text-[10px]">Hostel Block</span>
                                <div class="font-bold text-[#fefae0] text-sm mt-0.5">Block ${room.block}</div>
                            </div>
                            <div class="p-3 rounded-xl bg-[#0f281e] border border-[#52b788]/20">
                                <span class="text-[#8fb89e] text-[10px]">Floor</span>
                                <div class="font-bold text-[#fefae0] text-sm mt-0.5">${room.floor}nd Floor</div>
                            </div>
                            <div class="p-3 rounded-xl bg-[#0f281e] border border-[#52b788]/20">
                                <span class="text-[#8fb89e] text-[10px]">Capacity</span>
                                <div class="font-bold text-[#fefae0] text-sm mt-0.5">${room.capacity} Residents</div>
                            </div>
                            <div class="p-3 rounded-xl bg-[#0f281e] border border-[#52b788]/20">
                                <span class="text-[#8fb89e] text-[10px]">Occupancy</span>
                                <div class="font-bold text-[#52b788] text-sm mt-0.5">${room.occupied} / ${room.capacity} Beds</div>
                            </div>
                        </div>

                        <div class="space-y-2 pt-2">
                            <h4 class="text-xs font-bold text-[#fefae0] uppercase tracking-wider">Roommates Directory</h4>
                            <div class="space-y-2">
                                ${roommatesList || '<p class="text-xs text-[#8fb89e]">No roommates assigned yet.</p>'}
                            </div>
                        </div>
                    </div>

                    <!-- Digital Room Pass & Wi-Fi -->
                    <div class="space-y-4">
                        <div class="forest-card p-6 rounded-3xl border border-[#faedcd]/30 text-center space-y-3">
                            <span class="text-[10px] font-bold text-[#52b788] uppercase tracking-widest">NFC / QR Room Pass</span>
                            <div class="w-32 h-32 mx-auto bg-white p-2 rounded-2xl flex items-center justify-center shadow-lg">
                                <i class="fa-solid fa-qrcode text-7xl text-slate-900"></i>
                            </div>
                            <div class="text-xs font-mono text-[#fefae0] font-bold">KEYPASS-${room.room_number}-${data.my_bed.replace(' ', '')}</div>
                            <p class="text-[10px] text-[#8fb89e]">Scan at your hostel corridor electronic reader</p>
                        </div>

                        <div class="forest-card p-4 rounded-2xl border border-[#52b788]/20 text-xs space-y-1.5">
                            <div class="font-bold text-[#fefae0] flex items-center gap-2">
                                <i class="fa-solid fa-wifi text-[#52b788]"></i> High-Speed Mesh Wi-Fi
                            </div>
                            <div class="text-[#8fb89e]">SSID: <span class="text-[#fefae0] font-mono">MANN-Hostel-Block${room.block}</span></div>
                            <div class="text-[#8fb89e]">Passcode: <span class="text-[#fefae0] font-mono">Hostel@Secure2026</span></div>
                        </div>
                    </div>
                </div>
            `;
        } catch (e) {
            c.innerHTML = `<div class="p-4 text-xs text-red-400">Failed to load room details.</div>`;
        }
    },

    downloadRoomKeyPass() {
        const roomBedEl = document.getElementById('walletPassRoomBed');
        const locEl = document.getElementById('walletPassLocation');
        const resEl = document.getElementById('walletPassResidentName');
        const keyEl = document.getElementById('walletPassKeyId');

        if (this.currentUser) {
            if (resEl) resEl.textContent = this.currentUser.full_name || 'Resident Student';
        }
        if (this.currentRoomDetails && this.currentRoomDetails.room) {
            const r = this.currentRoomDetails.room;
            const b = this.currentRoomDetails.my_bed || 'Bed A';
            const cleanBlock = (r.block || '').replace(/Block/i, '').trim();
            if (roomBedEl) roomBedEl.textContent = `Room ${r.room_number} • ${b}`;
            if (locEl) locEl.textContent = `Block ${cleanBlock}, ${r.floor}nd Floor`;
            if (keyEl) keyEl.textContent = `KEYPASS-${r.room_number}-${b.replace(/\s+/g, '')}`;
        }

        this.openModal('digitalKeyPassModal');
        this.showToast('📱 Digital Key Pass loaded into device wallet.', 'success');
    },

    simulateNfcUnlock() {
        const btn = document.getElementById('walletSimulateNfcBtn');
        if (btn) {
            btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Communicating with Door Reader...`;
            btn.classList.add('opacity-75');
            setTimeout(() => {
                btn.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400"></i> Access Granted! Door Unlocked`;
                this.showToast('🔓 Corridor Door Lock: Access Granted! Safe entry logged.', 'success');
                setTimeout(() => {
                    btn.innerHTML = `<i class="fa-solid fa-door-open"></i> Tap NFC Reader (Simulate Door Unlock)`;
                    btn.classList.remove('opacity-75');
                }, 2500);
            }, 800);
        }
    },

    // ==========================================
    // COMPLAINTS MODULE (Student & Admin)
    // ==========================================
    async loadComplaints() {
        const studentContainer = document.getElementById('complaintsListContainer');
        const adminContainer = document.getElementById('adminComplaintsListContainer');
        const targetContainer = (this.currentUser && this.currentUser.role !== 'student') ? adminContainer : studentContainer;
        if (!targetContainer) return;

        try {
            const search = (document.getElementById('complaintSearchInput') || {}).value || '';
            const status = (document.getElementById('complaintStatusFilter') || {}).value || '';
            const category = (document.getElementById('complaintCategoryFilter') || {}).value || '';

            const params = new URLSearchParams();
            if (search) params.append('search', search);
            if (status) params.append('status', status);
            if (category) params.append('category', category);

            const res = await fetch(`/api/complaints?${params.toString()}`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            const complaints = data.complaints || [];

            if (complaints.length === 0) {
                targetContainer.innerHTML = `
                    <div class="forest-card p-8 rounded-3xl text-center space-y-2 border border-[#52b788]/20">
                        <i class="fa-solid fa-circle-check text-3xl text-[#52b788]"></i>
                        <h4 class="text-sm font-bold text-[#fefae0]">No Complaints Found</h4>
                        <p class="text-xs text-[#8fb89e]">Everything is running smoothly or matches your filter criteria.</p>
                    </div>
                `;
                return;
            }

            targetContainer.innerHTML = complaints.map(c => {
                const urgencyBadge = c.urgency === 'High' || c.urgency === 'Emergency' 
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';

                let statusBadge = 'bg-[#52b788] text-[#8fb89e] border border-[#52b788]/20';
                if (c.status === 'Resolved') statusBadge = 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
                if (c.status === 'Closed') statusBadge = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
                if (c.status === 'Work in Progress') statusBadge = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';

                const isStaff = this.currentUser && this.currentUser.role !== 'student';

                return `
                    <div class="forest-card p-5 rounded-2xl border border-[#52b788]/20 space-y-3">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#52b788]/20">
                            <div class="flex items-center gap-2.5">
                                <span class="font-mono text-xs font-bold text-[#52b788]">#${c.id}</span>
                                <span class="text-xs px-2.5 py-0.5 rounded-full ${urgencyBadge} font-bold">${c.urgency}</span>
                                <span class="text-xs px-2.5 py-0.5 rounded-full ${statusBadge} font-bold">${c.status}</span>
                                <span class="text-xs text-[#8fb89e]">• ${c.category}</span>
                            </div>
                            <span class="text-[11px] text-[#8fb89e] font-mono">Location: Room ${c.room_number}</span>
                        </div>

                        <div>
                            <h4 class="text-sm font-bold text-[#fefae0]">${c.title}</h4>
                            <p class="text-xs text-[#8fb89e] mt-1">${c.description}</p>
                        </div>

                        <div class="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-[#8fb89e] border-t border-[#52b788]/10">
                            <div>
                                Assigned Tech: <span class="text-[#fefae0] font-semibold">${c.assigned_to_name || 'Unassigned'}</span>
                            </div>

                            <div class="flex items-center gap-2">
                                ${!isStaff && c.status === 'Resolved' ? `
                                    <button onclick="app.confirmComplaintResolution(${c.id})" class="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition">
                                        Confirm Resolution & Close
                                    </button>
                                ` : ''}

                                ${isStaff ? `
                                    <button onclick="app.openAssignModal(${c.id})" class="px-2.5 py-1 rounded-lg bg-[#143528] hover:bg-[#2d6a4f] text-xs font-semibold text-[#fefae0] border border-[#52b788]/40">
                                        Assign Staff
                                    </button>
                                    <button onclick="app.updateComplaintProgress(${c.id}, 'Work in Progress')" class="px-2.5 py-1 rounded-lg bg-[#2d6a4f] hover:bg-[#74c69d] text-xs font-semibold text-white">
                                        Mark In-Progress
                                    </button>
                                    <button onclick="app.updateComplaintProgress(${c.id}, 'Resolved')" class="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white">
                                        Mark Resolved
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            targetContainer.innerHTML = `<div class="p-4 text-xs text-red-400">Failed to load complaints.</div>`;
        }
    },

    async handleCreateComplaint(e) {
        e.preventDefault();
        const payload = {
            category: document.getElementById('complaintCategory').value,
            urgency: document.getElementById('complaintUrgency').value,
            room_number: document.getElementById('complaintRoomNumber').value.trim(),
            title: document.getElementById('complaintTitle').value.trim(),
            description: document.getElementById('complaintDescription').value.trim()
        };

        try {
            const res = await fetch('/api/complaints', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                this.closeModal('submitComplaintModal');
                this.showToast(`Complaint #${data.complaint.id} submitted!`, 'success');
                this.loadComplaints();
            } else {
                this.showToast(data.error || 'Failed to submit complaint', 'error');
            }
        } catch (err) {
            this.showToast('Network error while lodging complaint', 'error');
        }
    },

    async confirmComplaintResolution(id) {
        try {
            const res = await fetch(`/api/complaints/${id}/resolve-confirm`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating: 5, remarks: 'Confirmed fixed by student resident' })
            });
            if (res.ok) {
                this.showToast(`Ticket #${id} resolved & confirmed closed. Thank you!`, 'success');
                this.loadComplaints();
            }
        } catch (e) {
            this.showToast('Resolution confirmation failed', 'error');
        }
    },

    async openAssignModal(id) {
        document.getElementById('assignComplaintId').value = id;
        const select = document.getElementById('assignStaffSelect');
        select.innerHTML = '<option value="">Loading technicians...</option>';
        this.openModal('assignStaffModal');

        try {
            const res = await fetch('/api/admin/maintenance-staff');
            const data = await res.json();
            const staff = data.staff || [];
            select.innerHTML = staff.map(s => `<option value="${s.id}">${s.full_name} (${s.role})</option>`).join('');
        } catch (e) {
            select.innerHTML = '<option value="">Failed to load staff</option>';
        }
    },

    async submitAssignStaff() {
        const id = document.getElementById('assignComplaintId').value;
        const staffId = document.getElementById('assignStaffSelect').value;
        if (!staffId) return;

        try {
            const res = await fetch(`/api/complaints/${id}/assign`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ staff_id: parseInt(staffId), remarks: 'Assigned for immediate dispatch' })
            });
            if (res.ok) {
                this.closeModal('assignStaffModal');
                this.showToast(`Ticket #${id} assigned to technician!`, 'success');
                this.loadComplaints();
            }
        } catch (e) {
            this.showToast('Assignment failed', 'error');
        }
    },

    async updateComplaintProgress(id, status) {
        try {
            const res = await fetch(`/api/complaints/${id}/progress`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: status, notes: `Status transitioned to ${status}` })
            });
            if (res.ok) {
                this.showToast(`Ticket #${id} updated to ${status}!`, 'success');
                this.loadComplaints();
            }
        } catch (e) {
            this.showToast('Progress update failed', 'error');
        }
    },

    // ==========================================
    // LEAVE REQUESTS MODULE
    // ==========================================
    async loadLeaveRequests() {
        const studentContainer = document.getElementById('leaveRequestsContainer');
        const adminContainer = document.getElementById('adminLeavesListContainer');
        const targetContainer = (this.currentUser && this.currentUser.role !== 'student') ? adminContainer : studentContainer;
        if (!targetContainer) return;

        try {
            const search = (document.getElementById('leaveSearchInput') || {}).value || '';
            const status = (document.getElementById('leaveStatusFilter') || {}).value || '';

            const params = new URLSearchParams();
            if (search) params.append('search', search);
            if (status) params.append('status', status);

            const res = await fetch(`/api/leave-requests?${params.toString()}`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            const leaves = data.leave_requests || [];

            if (leaves.length === 0) {
                targetContainer.innerHTML = `
                    <div class="forest-card p-8 rounded-3xl text-center space-y-2 border border-[#52b788]/20">
                        <i class="fa-solid fa-passport text-3xl text-[#52b788]"></i>
                        <h4 class="text-sm font-bold text-[#fefae0]">No Leave Records Found</h4>
                        <p class="text-xs text-[#8fb89e]">No leave requests match your criteria.</p>
                    </div>
                `;
                return;
            }

            const isStaff = this.currentUser && this.currentUser.role !== 'student';

            targetContainer.innerHTML = leaves.map(l => {
                let badgeClass = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
                if (l.status === 'Approved') badgeClass = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
                if (l.status === 'Rejected') badgeClass = 'bg-rose-500/20 text-rose-300 border border-rose-500/30';

                return `
                    <div class="forest-card p-5 rounded-2xl border border-[#52b788]/20 space-y-3">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#52b788]/20">
                            <div class="flex items-center gap-2">
                                <span class="font-mono text-xs font-bold text-[#52b788]">PASS #${l.id}</span>
                                <span class="text-xs px-2.5 py-0.5 rounded-full ${badgeClass} font-bold">${l.status}</span>
                                ${isStaff ? `<span class="text-xs text-[#fefae0] font-bold">• ${l.student_name || 'Student'} (${l.college_id || 'ID'})</span>` : ''}
                            </div>
                            <span class="text-xs text-[#8fb89e] font-mono">${l.start_date} → ${l.end_date}</span>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div>
                                <span class="text-[#8fb89e]">Reason:</span>
                                <div class="font-semibold text-[#fefae0] mt-0.5">${l.reason}</div>
                            </div>
                            <div>
                                <span class="text-[#8fb89e]">Destination:</span>
                                <div class="font-semibold text-[#fefae0] mt-0.5">${l.destination}</div>
                            </div>
                        </div>

                        <div class="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs border-t border-[#52b788]/10 text-[#8fb89e]">
                            <div>Emergency Contact: <span class="text-[#fefae0] font-mono">${l.emergency_contact}</span></div>

                            <div class="flex items-center gap-2">
                                ${l.status === 'Approved' ? `
                                    <span class="text-xs font-bold text-[#52b788] flex items-center gap-1">
                                        <i class="fa-solid fa-qrcode"></i> Digital Gate Pass Active
                                    </span>
                                ` : ''}

                                ${isStaff && l.status === 'Pending' ? `
                                    <button onclick="app.reviewLeave(${l.id}, 'Approved')" class="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs">
                                        Approve Out-Pass
                                    </button>
                                    <button onclick="app.reviewLeave(${l.id}, 'Rejected')" class="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs">
                                        Reject
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            targetContainer.innerHTML = `<div class="p-4 text-xs text-red-400">Failed to load leave requests.</div>`;
        }
    },

    async handleApplyLeave(e) {
        e.preventDefault();
        const payload = {
            start_date: document.getElementById('leaveStartDate').value,
            end_date: document.getElementById('leaveEndDate').value,
            reason: document.getElementById('leaveReason').value.trim(),
            destination: document.getElementById('leaveDestination').value.trim(),
            emergency_contact: document.getElementById('leaveEmergencyContact').value.trim()
        };

        try {
            const res = await fetch('/api/leave-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                this.closeModal('applyLeaveModal');
                this.showToast('Leave request submitted to Warden!', 'success');
                this.loadLeaveRequests();
            } else {
                this.showToast(data.error || 'Failed to submit leave', 'error');
            }
        } catch (err) {
            this.showToast('Network error while applying for leave', 'error');
        }
    },

    async reviewLeave(id, status) {
        try {
            const res = await fetch(`/api/leave-requests/${id}/review`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: status, remarks: `Reviewed and marked ${status}` })
            });
            if (res.ok) {
                this.showToast(`Leave request #${id} marked as ${status}!`, 'success');
                this.loadLeaveRequests();
            }
        } catch (e) {
            this.showToast('Failed to review leave', 'error');
        }
    },

    // ==========================================
    // MESS MENU & FEEDBACK
    // ==========================================
    async loadMessMenu() {
        const c = document.getElementById('messMenuContainer');
        const pillsContainer = document.getElementById('messDayPills');
        if (!c) return;

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        if (pillsContainer) {
            pillsContainer.innerHTML = days.map(d => `
                <button onclick="app.setMessDay('${d}')" class="px-3.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition ${d === this.currentMessDay ? 'bg-[#52b788] text-[#08140e] font-bold' : 'bg-[#143528] text-[#8fb89e] hover:text-[#fefae0]'}">
                    ${d}
                </button>
            `).join('');
        }

        try {
            const res = await fetch('/api/mess/menu');
            const data = await res.json();
            const menus = data.menu || [];
            const dayMenu = menus.find(m => m.day_of_week === this.currentMessDay) || {};

            c.innerHTML = `
                <div class="forest-card p-5 rounded-2xl border border-[#52b788]/20 space-y-2">
                    <div class="flex items-center justify-between pb-2 border-b border-[#52b788]/20">
                        <span class="text-xs font-bold text-[#52b788] flex items-center gap-1.5"><i class="fa-solid fa-mug-hot"></i> Breakfast</span>
                        <span class="text-[10px] text-[#8fb89e]">07:30 - 09:30</span>
                    </div>
                    <p class="text-xs text-[#fefae0] leading-relaxed">${dayMenu.breakfast || 'Menu unavailable'}</p>
                </div>

                <div class="forest-card p-5 rounded-2xl border border-[#52b788]/20 space-y-2">
                    <div class="flex items-center justify-between pb-2 border-b border-[#52b788]/20">
                        <span class="text-xs font-bold text-[#52b788] flex items-center gap-1.5"><i class="fa-solid fa-bowl-rice"></i> Lunch</span>
                        <span class="text-[10px] text-[#8fb89e]">12:30 - 14:30</span>
                    </div>
                    <p class="text-xs text-[#fefae0] leading-relaxed">${dayMenu.lunch || 'Menu unavailable'}</p>
                </div>

                <div class="forest-card p-5 rounded-2xl border border-[#52b788]/20 space-y-2">
                    <div class="flex items-center justify-between pb-2 border-b border-[#52b788]/20">
                        <span class="text-xs font-bold text-[#52b788] flex items-center gap-1.5"><i class="fa-solid fa-cookie-bite"></i> Snacks</span>
                        <span class="text-[10px] text-[#8fb89e]">17:00 - 18:00</span>
                    </div>
                    <p class="text-xs text-[#fefae0] leading-relaxed">${dayMenu.snacks || 'Menu unavailable'}</p>
                </div>

                <div class="forest-card p-5 rounded-2xl border border-[#52b788]/20 space-y-2">
                    <div class="flex items-center justify-between pb-2 border-b border-[#52b788]/20">
                        <span class="text-xs font-bold text-[#52b788] flex items-center gap-1.5"><i class="fa-solid fa-plate-wheat"></i> Dinner</span>
                        <span class="text-[10px] text-[#8fb89e]">19:30 - 21:30</span>
                    </div>
                    <p class="text-xs text-[#fefae0] leading-relaxed">${dayMenu.dinner || 'Menu unavailable'}</p>
                </div>
            `;
        } catch (e) {
            c.innerHTML = `<div class="p-4 text-xs text-red-400">Failed to load mess menu.</div>`;
        }
    },

    setMessDay(d) {
        this.currentMessDay = d;
        this.loadMessMenu();
    },

    async loadMessFeedback() {
        const c = document.getElementById('messFeedbackContainer');
        if (!c) return;

        try {
            const res = await fetch('/api/mess/feedback');
            const data = await res.json();
            const feedbacks = data.feedback || [];

            if (feedbacks.length === 0) {
                c.innerHTML = `<p class="text-xs text-[#8fb89e] col-span-2">No student reviews recorded yet.</p>`;
                return;
            }

            c.innerHTML = feedbacks.slice(0, 6).map(f => `
                <div class="p-3 rounded-xl bg-[#0f281e] border border-[#52b788]/20 space-y-1 text-xs">
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-[#52b788]">${f.meal_type}</span>
                        <span class="text-amber-400 font-bold">${'★'.repeat(f.rating)}</span>
                    </div>
                    <p class="text-[#fefae0]">${f.comment || 'No written remarks'}</p>
                    <div class="text-[10px] text-[#8fb89e] flex justify-between pt-1">
                        <span>${f.student_name || 'Resident'}</span>
                        <span>${f.created_at ? f.created_at.split('T')[0] : ''}</span>
                    </div>
                </div>
            `).join('');
        } catch (e) {}
    },

    async handleMessFeedback(e) {
        e.preventDefault();
        const payload = {
            meal_type: document.getElementById('feedbackMealType').value,
            rating: parseInt(document.getElementById('feedbackRating').value),
            comment: document.getElementById('feedbackComment').value.trim()
        };

        try {
            const res = await fetch('/api/mess/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                this.closeModal('submitMessFeedbackModal');
                this.showToast('Thank you for rating today’s food!', 'success');
                this.loadMessFeedback();
            }
        } catch (e) {
            this.showToast('Failed to submit feedback', 'error');
        }
    },

    async loadAdminMessMenuDay() {
        const day = document.getElementById('adminMessDaySelect').value;
        try {
            const res = await fetch('/api/mess/menu');
            const data = await res.json();
            const menu = (data.menu || []).find(m => m.day_of_week === day) || {};

            document.getElementById('editBreakfast').value = menu.breakfast || '';
            document.getElementById('editLunch').value = menu.lunch || '';
            document.getElementById('editSnacks').value = menu.snacks || '';
            document.getElementById('editDinner').value = menu.dinner || '';
            document.getElementById('editSpecialNotes').value = menu.special_notes || '';
        } catch (e) {}
    },

    async handleUpdateMessMenu(e) {
        e.preventDefault();
        const day = document.getElementById('adminMessDaySelect').value;
        const payload = {
            day_of_week: day,
            breakfast: document.getElementById('editBreakfast').value.trim(),
            lunch: document.getElementById('editLunch').value.trim(),
            snacks: document.getElementById('editSnacks').value.trim(),
            dinner: document.getElementById('editDinner').value.trim(),
            special_notes: document.getElementById('editSpecialNotes').value.trim()
        };

        try {
            const res = await fetch('/api/mess/menu', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                this.showToast(`Updated menu for ${day}!`, 'success');
            }
        } catch (e) {
            this.showToast('Failed to update menu', 'error');
        }
    },

    // ==========================================
    // FEES AND PAYMENTS MODULE
    // ==========================================
    async loadStudentFees() {
        const sumC = document.getElementById('studentFeesSummaryContainer');
        const invC = document.getElementById('studentFeesInvoicesContainer');
        if (!sumC || !invC) return;

        try {
            const res = await fetch('/api/student/fees');
            const data = await res.json();
            const fees = data.fees || [];

            const totalDue = fees.reduce((acc, f) => acc + (f.status === 'Pending' ? f.amount : 0), 0);
            const totalPaid = fees.reduce((acc, f) => acc + (f.status === 'Paid' ? f.amount : 0), 0);

            sumC.innerHTML = `
                <div class="forest-card p-5 rounded-2xl border border-rose-500/30">
                    <span class="text-xs text-[#8fb89e] uppercase font-bold">Outstanding Dues</span>
                    <div class="text-2xl font-extrabold text-rose-400 mt-1">₹${totalDue.toLocaleString()}</div>
                    <div class="text-[10px] text-[#8fb89e] mt-0.5">Pay before term deadline</div>
                </div>
                <div class="forest-card p-5 rounded-2xl border border-emerald-500/30">
                    <span class="text-xs text-[#8fb89e] uppercase font-bold">Total Paid</span>
                    <div class="text-2xl font-extrabold text-emerald-400 mt-1">₹${totalPaid.toLocaleString()}</div>
                    <div class="text-[10px] text-[#8fb89e] mt-0.5">Verified digital payments</div>
                </div>
                <div class="forest-card p-5 rounded-2xl border border-[#52b788]/30">
                    <span class="text-xs text-[#8fb89e] uppercase font-bold">Security Deposit</span>
                    <div class="text-2xl font-extrabold text-[#52b788] mt-1">₹10,000</div>
                    <div class="text-[10px] text-[#8fb89e] mt-0.5">Refundable upon graduation</div>
                </div>
            `;

            invC.innerHTML = fees.map(f => `
                <div class="p-4 rounded-xl bg-[#0f281e] border border-[#52b788]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-[#fefae0] text-sm">${f.fee_type}</span>
                            <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${f.status === 'Paid' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}">${f.status}</span>
                        </div>
                        <div class="text-[11px] text-[#8fb89e] mt-0.5">Term: ${f.term} • Due Date: ${f.due_date}</div>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="font-bold text-base text-[#fefae0]">₹${f.amount.toLocaleString()}</span>
                        ${f.status === 'Pending' ? `
                            <button onclick="app.payFee(${f.id})" class="px-4 py-2 rounded-xl btn-forest-primary text-xs font-bold shadow-md">
                                Pay Online
                            </button>
                        ` : `
                            <span class="text-xs text-[#52b788] font-bold"><i class="fa-solid fa-check"></i> Receipt Downloaded</span>
                        `}
                    </div>
                </div>
            `).join('');
        } catch (e) {}
    },

    async payFee(feeId) {
        try {
            const res = await fetch(`/api/student/pay-fee/${feeId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payment_method: 'UPI / NetBanking', transaction_ref: 'TXN-' + Math.random().toString(36).substring(2, 9).toUpperCase() })
            });
            const data = await res.json();
            if (res.ok) {
                this.showToast(`Payment successful! Receipt: ${data.receipt_number}`, 'success');
                this.loadStudentFees();
            }
        } catch (e) {
            this.showToast('Payment gateway error', 'error');
        }
    },

    // ==========================================
    // LAUNDRY MODULE
    // ==========================================
    async loadLaundryRequests() {
        const c = document.getElementById('laundryRequestsContainer');
        if (!c) return;

        try {
            const res = await fetch('/api/laundry');
            const data = await res.json();
            const requests = data.requests || [];

            if (requests.length === 0) {
                c.innerHTML = `
                    <div class="forest-card p-8 rounded-3xl text-center space-y-2 border border-[#52b788]/20">
                        <i class="fa-solid fa-shirt text-3xl text-[#52b788]"></i>
                        <h4 class="text-sm font-bold text-[#fefae0]">No Laundry Requests Active</h4>
                        <p class="text-xs text-[#8fb89e]">Schedule your express laundry pickup anytime.</p>
                    </div>
                `;
                return;
            }

            const isStaff = this.currentUser && this.currentUser.role !== 'student';

            c.innerHTML = requests.map(r => `
                <div class="forest-card p-4 rounded-2xl border border-[#52b788]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-[#fefae0]">Bag #${r.id} (${r.item_count} items)</span>
                            <span class="text-[10px] px-2 py-0.5 rounded-full bg-[#143528] text-[#52b788] border border-[#52b788]/30">${r.service_type}</span>
                            <span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">${r.status}</span>
                        </div>
                        <div class="text-[11px] text-[#8fb89e] mt-1">${r.special_notes || 'Standard wash'} • Scheduled: ${r.pickup_date || 'Today'}</div>
                    </div>
                    ${isStaff ? `
                        <div class="flex items-center gap-2">
                            <button onclick="app.updateLaundryStatus(${r.id}, 'In Washing')" class="px-2.5 py-1 rounded bg-[#2d6a4f] text-xs font-semibold text-white">In Wash</button>
                            <button onclick="app.updateLaundryStatus(${r.id}, 'Ready for Pickup')" class="px-2.5 py-1 rounded bg-blue-600 text-xs font-semibold text-white">Ready</button>
                            <button onclick="app.updateLaundryStatus(${r.id}, 'Completed')" class="px-2.5 py-1 rounded bg-emerald-600 text-xs font-semibold text-white">Done</button>
                        </div>
                    ` : ''}
                </div>
            `).join('');
        } catch (e) {}
    },

    async handleRequestLaundry(e) {
        e.preventDefault();
        const payload = {
            item_count: parseInt(document.getElementById('laundryItemCount').value),
            service_type: document.getElementById('laundryServiceType').value,
            special_notes: document.getElementById('laundrySpecialNotes').value.trim()
        };

        try {
            const res = await fetch('/api/laundry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                this.closeModal('requestLaundryModal');
                this.showToast('Laundry pickup scheduled successfully!', 'success');
                this.loadLaundryRequests();
            }
        } catch (e) {
            this.showToast('Failed to schedule laundry', 'error');
        }
    },

    async updateLaundryStatus(id, status) {
        try {
            const res = await fetch(`/api/laundry/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            if (res.ok) {
                this.showToast(`Laundry #${id} marked as ${status}`, 'success');
                this.loadLaundryRequests();
            }
        } catch (e) {}
    },

    // ==========================================
    // CLEANING MODULE
    // ==========================================
    async loadCleaningRequests() {
        const c = document.getElementById('cleaningRequestsContainer');
        if (!c) return;

        try {
            const res = await fetch('/api/cleaning');
            const data = await res.json();
            const reqs = data.requests || [];

            if (reqs.length === 0) {
                c.innerHTML = `
                    <div class="forest-card p-8 rounded-3xl text-center space-y-2 border border-[#52b788]/20">
                        <i class="fa-solid fa-broom text-3xl text-[#52b788]"></i>
                        <h4 class="text-sm font-bold text-[#fefae0]">No Housekeeping Scheduled</h4>
                        <p class="text-xs text-[#8fb89e]">Schedule deep room cleaning at your convenience.</p>
                    </div>
                `;
                return;
            }

            c.innerHTML = reqs.map(r => `
                <div class="forest-card p-4 rounded-2xl border border-[#52b788]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-[#fefae0]">${r.preferred_slot}</span>
                            <span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">${r.status}</span>
                        </div>
                        <div class="text-[11px] text-[#8fb89e] mt-1">Focus: ${r.focus_area || 'Whole Room'} • Date: ${r.request_date || 'Today'}</div>
                    </div>
                </div>
            `).join('');
        } catch (e) {}
    },

    async handleRequestCleaning(e) {
        e.preventDefault();
        const payload = {
            preferred_slot: document.getElementById('cleaningSlot').value,
            focus_area: document.getElementById('cleaningFocus').value.trim()
        };

        try {
            const res = await fetch('/api/cleaning', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                this.closeModal('requestCleaningModal');
                this.showToast('Room housekeeping request recorded!', 'success');
                this.loadCleaningRequests();
            }
        } catch (e) {
            this.showToast('Failed to schedule cleaning', 'error');
        }
    },

    // ==========================================
    // VISITOR REQUESTS MODULE
    // ==========================================
    async loadVisitorRequests() {
        const studentContainer = document.getElementById('visitorRequestsContainer');
        const adminContainer = document.getElementById('adminVisitorsListContainer');
        const targetContainer = (this.currentUser && this.currentUser.role !== 'student') ? adminContainer : studentContainer;
        if (!targetContainer) return;

        try {
            const res = await fetch('/api/visitors');
            const data = await res.json();
            const visitors = data.visitors || [];

            if (visitors.length === 0) {
                targetContainer.innerHTML = `
                    <div class="forest-card p-8 rounded-3xl text-center space-y-2 border border-[#52b788]/20">
                        <i class="fa-solid fa-id-badge text-3xl text-[#52b788]"></i>
                        <h4 class="text-sm font-bold text-[#fefae0]">No Registered Visitors</h4>
                        <p class="text-xs text-[#8fb89e]">Pre-register guests to ensure quick security clearance.</p>
                    </div>
                `;
                return;
            }

            const isStaff = this.currentUser && this.currentUser.role !== 'student';

            targetContainer.innerHTML = visitors.map(v => `
                <div class="forest-card p-4 rounded-2xl border border-[#52b788]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-[#fefae0]">${v.visitor_name} (${v.relationship})</span>
                            <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${v.status === 'Approved' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}">${v.status}</span>
                        </div>
                        <div class="text-[11px] text-[#8fb89e] mt-1">Visit Date: ${v.visit_date} • Phone: ${v.phone} • Purpose: ${v.purpose || 'General'}</div>
                    </div>
                    ${isStaff && v.status === 'Pending' ? `
                        <div class="flex items-center gap-2">
                            <button onclick="app.reviewVisitor(${v.id}, 'Approved')" class="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs">Approve Entry</button>
                            <button onclick="app.reviewVisitor(${v.id}, 'Rejected')" class="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs">Deny</button>
                        </div>
                    ` : `
                        <span class="text-xs font-mono text-[#52b788]">PASS: VP-${v.id}90X</span>
                    `}
                </div>
            `).join('');
        } catch (e) {}
    },

    async handleRequestVisitor(e) {
        e.preventDefault();
        const payload = {
            visitor_name: document.getElementById('visitorName').value.trim(),
            phone: document.getElementById('visitorPhone').value.trim(),
            relationship: document.getElementById('visitorRelation').value,
            visit_date: document.getElementById('visitorDate').value,
            purpose: document.getElementById('visitorPurpose').value.trim()
        };

        try {
            const res = await fetch('/api/visitors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                this.closeModal('requestVisitorModal');
                this.showToast('Visitor gate pass generated and submitted for review!', 'success');
                this.loadVisitorRequests();
            }
        } catch (e) {
            this.showToast('Failed to register visitor', 'error');
        }
    },

    async reviewVisitor(id, status) {
        try {
            const res = await fetch(`/api/visitors/${id}/review`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            if (res.ok) {
                this.showToast(`Visitor pass #${id} marked as ${status}`, 'success');
                this.loadVisitorRequests();
            }
        } catch (e) {}
    },

    // ==========================================
    // COMMUNITY HUB MODULE
    // ==========================================
    async loadCommunityPosts() {
        const c = document.getElementById('communityPostsContainer');
        if (!c) return;

        try {
            const res = await fetch('/api/community');
            const data = await res.json();
            const posts = data.posts || [];

            if (posts.length === 0) {
                c.innerHTML = `
                    <div class="forest-card p-8 rounded-3xl text-center space-y-2 border border-[#52b788]/20">
                        <i class="fa-solid fa-comments text-3xl text-[#52b788]"></i>
                        <h4 class="text-sm font-bold text-[#fefae0]">Community Forum Quiet</h4>
                        <p class="text-xs text-[#8fb89e]">Start the conversation! Share study groups or hostel events.</p>
                    </div>
                `;
                return;
            }

            c.innerHTML = posts.map(p => `
                <div class="forest-card p-5 rounded-2xl border border-[#52b788]/20 space-y-2.5">
                    <div class="flex items-center justify-between pb-2 border-b border-[#52b788]/20">
                        <div class="flex items-center gap-2">
                            <span class="text-xs px-2.5 py-0.5 rounded-full bg-[#143528] text-[#52b788] border border-[#52b788]/30 font-bold">${p.category}</span>
                            <span class="text-xs font-bold text-[#fefae0]">• ${p.author_name || 'Resident'}</span>
                        </div>
                        <span class="text-[10px] text-[#8fb89e]">${p.created_at ? p.created_at.split('T')[0] : ''}</span>
                    </div>
                    <p class="text-xs text-[#fefae0] leading-relaxed">${p.content}</p>
                    <div class="flex items-center justify-between pt-1 text-xs">
                        <button onclick="app.likeCommunityPost(${p.id})" class="text-rose-400 hover:text-rose-300 flex items-center gap-1 font-bold">
                            <i class="fa-solid fa-heart"></i> <span>${p.likes || 0}</span>
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (e) {}
    },

    async handleCreateCommunityPost(e) {
        e.preventDefault();
        const payload = {
            category: document.getElementById('commCategory').value,
            content: document.getElementById('commContent').value.trim()
        };

        try {
            const res = await fetch('/api/community', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                this.closeModal('createCommunityPostModal');
                this.showToast('Post published to community board!', 'success');
                this.loadCommunityPosts();
            }
        } catch (e) {
            this.showToast('Failed to publish post', 'error');
        }
    },

    async likeCommunityPost(id) {
        try {
            const res = await fetch(`/api/community/${id}/like`, { method: 'POST' });
            if (res.ok) {
                this.loadCommunityPosts();
            }
        } catch (e) {}
    },

    // ==========================================
    // ANNOUNCEMENTS MODULE
    // ==========================================
    async loadAnnouncements() {
        const studentContainer = document.getElementById('studentAnnouncementsContainer');
        const adminContainer = document.getElementById('adminAnnouncementsContainer');
        const targetContainer = (this.currentUser && this.currentUser.role !== 'student') ? adminContainer : studentContainer;
        if (!targetContainer) return;

        try {
            const res = await fetch('/api/announcements');
            const data = await res.json();
            const items = data.announcements || [];

            if (items.length === 0) {
                targetContainer.innerHTML = `
                    <div class="forest-card p-8 rounded-3xl text-center space-y-2 border border-[#52b788]/20">
                        <i class="fa-solid fa-bullhorn text-3xl text-[#52b788]"></i>
                        <h4 class="text-sm font-bold text-[#fefae0]">No Bulletins Active</h4>
                        <p class="text-xs text-[#8fb89e]">Official announcements will appear here as soon as posted.</p>
                    </div>
                `;
                return;
            }

            targetContainer.innerHTML = items.map(a => {
                const isUrgent = a.priority === 'Urgent';
                return `
                    <div class="forest-card p-5 rounded-2xl border ${isUrgent ? 'border-rose-500/40 bg-rose-950/10' : 'border-[#52b788]/20'} space-y-2">
                        <div class="flex items-center justify-between pb-2 border-b border-[#52b788]/20">
                            <div class="flex items-center gap-2">
                                ${isUrgent ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">URGENT</span>' : ''}
                                <span class="text-xs px-2.5 py-0.5 rounded-full bg-[#143528] text-[#52b788] border border-[#52b788]/30 font-bold">${a.category}</span>
                                <h4 class="text-sm font-bold text-[#fefae0]">${a.title}</h4>
                            </div>
                            <span class="text-[10px] text-[#8fb89e]">${a.created_at ? a.created_at.split('T')[0] : ''}</span>
                        </div>
                        <p class="text-xs text-[#8fb89e] leading-relaxed">${a.content}</p>
                        <div class="text-[10px] text-[#52b788] font-semibold pt-1">
                            Issued by: ${a.posted_by_name || 'Chief Warden Office'}
                        </div>
                    </div>
                `;
            }).join('');
        } catch (e) {}
    },

    async handlePublishAnnouncement(e) {
        e.preventDefault();
        const payload = {
            title: document.getElementById('announcementTitle').value.trim(),
            category: document.getElementById('announcementCategory').value,
            priority: document.getElementById('announcementPriority').value,
            content: document.getElementById('announcementContent').value.trim()
        };

        try {
            const res = await fetch('/api/announcements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                this.closeModal('publishAnnouncementModal');
                this.showToast('Announcement broadcasted to hostel network!', 'success');
                this.loadAnnouncements();
            }
        } catch (e) {
            this.showToast('Failed to publish announcement', 'error');
        }
    },

    // ==========================================
    // MANN CARE: CONFIDENTIAL WELLNESS SANCTUARY
    // ==========================================
    async loadWellnessAppointments() {
        const c = document.getElementById('wellnessAppointmentsContainer');
        if (!c) return;

        try {
            const res = await fetch('/api/wellness/appointments');
            if (res.status === 403) {
                c.innerHTML = `
                    <div class="p-6 rounded-2xl bg-rose-950/20 border border-rose-800/40 text-center space-y-2 text-xs">
                        <i class="fa-solid fa-lock text-rose-400 text-2xl"></i>
                        <h4 class="font-bold text-rose-200">Access Restricted</h4>
                        <p class="text-rose-300/80">Wellness records are strictly confidential and inaccessible to this role.</p>
                    </div>
                `;
                return;
            }

            const data = await res.json();
            const appts = data.appointments || [];

            if (appts.length === 0) {
                c.innerHTML = `
                    <div class="forest-card p-8 rounded-3xl text-center space-y-2 border border-purple-800/30">
                        <i class="fa-solid fa-hand-holding-heart text-3xl text-purple-400"></i>
                        <h4 class="text-sm font-bold text-[#fefae0]">No Confidential Sessions Booked</h4>
                        <p class="text-xs text-[#8fb89e]">Schedule a private, pressure-free session with our licensed counsellor anytime.</p>
                    </div>
                `;
                return;
            }

            c.innerHTML = appts.map(a => `
                <div class="forest-card p-5 rounded-2xl border border-purple-800/40 space-y-2">
                    <div class="flex items-center justify-between pb-2 border-b border-purple-800/30">
                        <div class="flex items-center gap-2">
                            <span class="font-mono text-xs font-bold text-purple-400">CARE #${a.id}</span>
                            <span class="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">${a.status}</span>
                        </div>
                        <span class="text-xs text-[#8fb89e]">${a.preferred_date} • ${a.preferred_time_slot}</span>
                    </div>
                    <p class="text-xs text-[#fefae0] italic">"${a.notes || 'Confidential consultation'}"</p>
                    <div class="text-[10px] text-purple-300 pt-1">
                        Assigned: Campus Licensed Psychological Counsellor
                    </div>
                </div>
            `).join('');
        } catch (e) {
            c.innerHTML = `<div class="p-4 text-xs text-red-400">Failed to load appointments.</div>`;
        }
    },

    async handleBookWellness(e) {
        e.preventDefault();
        const payload = {
            preferred_date: document.getElementById('wellnessDate').value,
            preferred_time_slot: document.getElementById('wellnessSlot').value,
            notes: document.getElementById('wellnessNotes').value.trim()
        };

        try {
            const res = await fetch('/api/wellness/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                this.closeModal('bookWellnessModal');
                this.showToast('Confidential counselling appointment requested.', 'success');
                this.loadWellnessAppointments();
            }
        } catch (e) {
            this.showToast('Failed to book wellness appointment', 'error');
        }
    },

    // ==========================================
    // COUNSELLOR APPOINTMENTS MODULE
    // ==========================================
    async loadCounsellorAppointments() {
        const container = document.getElementById('counsellorAppointmentsList');
        const activeCountEl = document.getElementById('counsellorActiveCount');
        const completedCountEl = document.getElementById('counsellorCompletedCount');
        const statusText = document.getElementById('counsellorAptStatusText');
        if (!container) return;

        try {
            const res = await fetch('/api/wellness/appointments');
            if (!res.ok) throw new Error('Failed to load appointments');
            const data = await res.json();
            const apts = data.appointments || [];

            const activeApts = apts.filter(a => a.status === 'Confirmed' || a.status === 'Pending');
            const completedApts = apts.filter(a => a.status === 'Completed');
            if (activeCountEl) activeCountEl.textContent = activeApts.length;
            if (completedCountEl) completedCountEl.textContent = completedApts.length;
            if (statusText) statusText.textContent = `${apts.length} Total Sessions`;

            if (apts.length === 0) {
                container.innerHTML = `
                    <div class="p-8 text-center text-xs text-[#8fb89e] space-y-2">
                        <i class="fa-solid fa-heart-pulse text-2xl text-emerald-400"></i>
                        <p>No confidential appointments booked yet.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = apts.map(a => {
                const isPendingOrConfirmed = a.status === 'Pending' || a.status === 'Confirmed';
                const statusBadge = a.status === 'Confirmed' 
                    ? '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">Confirmed</span>'
                    : a.status === 'Completed'
                    ? '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">Completed</span>'
                    : '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">Pending Review</span>';

                return `
                    <div class="p-4 rounded-2xl bg-[#0f281e]/90 border border-[#52b788]/20 space-y-3">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <div class="flex items-center gap-2">
                                    <span class="font-bold text-sm text-[#fefae0]">${a.student_name || 'Resident'}</span>
                                    <span class="text-xs text-[#8fb89e] font-mono">(${a.room_number ? 'Room ' + a.room_number : 'Resident'})</span>
                                </div>
                                <div class="text-xs text-emerald-300 font-semibold mt-0.5">
                                    <i class="fa-solid fa-calendar-day mr-1"></i> ${a.preferred_date} • ${a.preferred_time} (${a.session_mode})
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">${a.issue_category}</span>
                                ${statusBadge}
                            </div>
                        </div>

                        <div class="p-3 rounded-xl bg-[#143528]/60 text-xs text-[#d8f3dc] border border-[#52b788]/15">
                            <span class="text-[10px] uppercase font-bold text-[#8fb89e] block mb-0.5">Confidential Student Note:</span>
                            "${a.confidential_notes || 'No extra notes provided'}"
                        </div>

                        ${a.counsellor_remarks ? `
                            <div class="text-xs text-amber-300/90 italic pl-1">
                                <span class="font-bold text-[#8fb89e] not-italic">Counsellor Remarks:</span> ${a.counsellor_remarks}
                            </div>
                        ` : ''}

                        ${isPendingOrConfirmed ? `
                            <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-[#52b788]/15">
                                ${a.status === 'Pending' ? `
                                    <button onclick="app.updateAppointmentStatus(${a.id}, 'Confirmed')" class="px-3 py-1.5 rounded-lg btn-forest-primary text-xs font-bold flex items-center gap-1">
                                        <i class="fa-solid fa-check"></i> Confirm Slot
                                    </button>
                                ` : ''}
                                <button onclick="app.updateAppointmentStatus(${a.id}, 'Completed')" class="px-3 py-1.5 rounded-lg btn-forest-secondary text-xs font-bold flex items-center gap-1">
                                    <i class="fa-solid fa-circle-check text-emerald-400"></i> Mark Completed
                                </button>
                                <button onclick="app.updateAppointmentStatus(${a.id}, 'Cancelled')" class="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-300 border border-red-500/30 text-xs font-bold transition">
                                    Cancel
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        } catch (e) {
            container.innerHTML = `<div class="p-4 text-xs text-red-300">Error loading appointments: ${e.message}</div>`;
        }
    },

    async updateAppointmentStatus(appointmentId, status) {
        const remarks = prompt(`Enter clinical remarks or follow-up note for status "${status}":`) || '';
        try {
            const res = await fetch(`/api/wellness/appointments/${appointmentId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, counsellor_remarks: remarks })
            });
            const data = await res.json();
            if (res.ok) {
                this.showToast(`Appointment status updated to ${status}`, 'success');
                this.loadCounsellorAppointments();
            } else {
                this.showToast(data.error || 'Failed to update status', 'error');
            }
        } catch (e) {
            this.showToast('Network error updating appointment', 'error');
        }
    },

    // ==========================================
    // RESIDENT PROFILE MODULE
    // ==========================================
    loadStudentProfile() {
        const c = document.getElementById('studentProfileDetailsContainer');
        if (!c || !this.currentUser) return;
        const u = this.currentUser;

        c.innerHTML = `
            <div class="forest-card p-6 rounded-3xl border border-[#52b788]/30 space-y-6">
                <div class="flex items-center gap-4 pb-4 border-b border-[#52b788]/20">
                    <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#52b788] to-[#74c69d] flex items-center justify-center text-xl font-bold text-[#fefae0] border border-[#52b788]/50 shadow-md">
                        ${(u.full_name || u.username).substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <h3 class="text-xl font-bold text-[#fefae0]">${u.full_name}</h3>
                        <div class="text-xs text-[#52b788] font-mono mt-0.5">College ID: ${u.college_id || 'NST2026-042'}</div>
                        <span class="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold uppercase mt-1 inline-block">
                            ${u.approval_status || 'Approved Resident'}
                        </span>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div class="p-3.5 rounded-xl bg-[#0f281e] border border-[#52b788]/20">
                        <span class="text-[#8fb89e] text-[10px]">Email Address</span>
                        <div class="font-bold text-[#fefae0] mt-0.5">${u.email || 'aarav.sharma@campus.edu'}</div>
                    </div>
                    <div class="p-3.5 rounded-xl bg-[#0f281e] border border-[#52b788]/20">
                        <span class="text-[#8fb89e] text-[10px]">Mobile Phone</span>
                        <div class="font-bold text-[#fefae0] mt-0.5">${u.phone || '+91 98765-43210'}</div>
                    </div>
                    <div class="p-3.5 rounded-xl bg-[#0f281e] border border-[#52b788]/20">
                        <span class="text-[#8fb89e] text-[10px]">Guardian / Next of Kin</span>
                        <div class="font-bold text-[#fefae0] mt-0.5">${u.guardian_name || 'Rajesh Sharma'}</div>
                    </div>
                    <div class="p-3.5 rounded-xl bg-[#0f281e] border border-[#52b788]/20">
                        <span class="text-[#8fb89e] text-[10px]">Guardian Phone</span>
                        <div class="font-bold text-[#fefae0] mt-0.5">${u.guardian_phone || '+91 91234-56789'}</div>
                    </div>
                </div>
            </div>
        `;
    },

    // ==========================================
    // ADMIN MODULES (Overview, Students, Rooms...)
    // ==========================================
    async loadAdminOverview() {
        const grid = document.getElementById('adminMetricsGrid');
        if (!grid) return;

        try {
            const res = await fetch('/api/admin/overview-metrics');
            const data = await res.json();
            const m = data.metrics || {};

            grid.innerHTML = `
                <div class="forest-card p-5 rounded-2xl border border-[#52b788]/20">
                    <span class="text-xs text-[#8fb89e] uppercase font-bold">Total Students</span>
                    <div class="text-3xl font-extrabold text-[#fefae0] mt-1">${m.total_students || 0}</div>
                    <div class="text-[10px] text-[#52b788] mt-1 font-semibold">${m.occupancy_rate || 98}% Occupancy</div>
                </div>
                <div class="forest-card p-5 rounded-2xl border border-amber-500/30">
                    <span class="text-xs text-[#8fb89e] uppercase font-bold">Pending Approvals</span>
                    <div class="text-3xl font-extrabold text-amber-300 mt-1">${m.pending_approvals || 0}</div>
                    <div class="text-[10px] text-[#8fb89e] mt-1">Student Admissions</div>
                </div>
                <div class="forest-card p-5 rounded-2xl border border-rose-500/30">
                    <span class="text-xs text-[#8fb89e] uppercase font-bold">Open Complaints</span>
                    <div class="text-3xl font-extrabold text-rose-400 mt-1">${m.open_complaints || 0}</div>
                    <div class="text-[10px] text-[#8fb89e] mt-1">Active Work Orders</div>
                </div>
                <div class="forest-card p-5 rounded-2xl border border-blue-500/30">
                    <span class="text-xs text-[#8fb89e] uppercase font-bold">Pending Leaves</span>
                    <div class="text-3xl font-extrabold text-blue-300 mt-1">${m.pending_leaves || 0}</div>
                    <div class="text-[10px] text-[#8fb89e] mt-1">Awaiting Warden Review</div>
                </div>
            `;
        } catch (e) {}
    },

    async loadPendingStudents() {
        const c = document.getElementById('pendingStudentsListContainer');
        const badge = document.getElementById('pendingStudentsCount');
        if (!c) return;

        try {
            const res = await fetch('/api/admin/pending-students');
            const data = await res.json();
            const students = data.students || [];

            if (badge) badge.textContent = `${students.length} Pending`;

            if (students.length === 0) {
                c.innerHTML = `<p class="text-xs text-[#8fb89e]">No pending student registrations awaiting review.</p>`;
                return;
            }

            c.innerHTML = students.map(s => `
                <div class="p-3 rounded-xl bg-[#0f281e] border border-[#52b788]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                        <div class="font-bold text-[#fefae0]">${s.full_name} (${s.college_id || s.username})</div>
                        <div class="text-[11px] text-[#8fb89e]">Phone: ${s.phone || 'N/A'} • Guardian: ${s.guardian_name || 'N/A'} (${s.guardian_phone || 'N/A'})</div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="app.approveStudent(${s.id})" class="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs">
                            Approve Account
                        </button>
                        <button onclick="app.rejectStudent(${s.id})" class="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs">
                            Reject
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (e) {}
    },

    async approveStudent(id) {
        try {
            const res = await fetch(`/api/admin/students/${id}/approve`, { method: 'PUT' });
            if (res.ok) {
                this.showToast(`Student #${id} approved! Resident can now log in.`, 'success');
                this.loadPendingStudents();
                this.loadAdminStudents();
            }
        } catch (e) {}
    },

    async rejectStudent(id) {
        try {
            const res = await fetch(`/api/admin/students/${id}/reject`, { method: 'PUT' });
            if (res.ok) {
                this.showToast(`Student #${id} rejected.`, 'info');
                this.loadPendingStudents();
                this.loadAdminStudents();
            }
        } catch (e) {}
    },

    async loadAdminStudents() {
        const c = document.getElementById('adminStudentsTableContainer');
        if (!c) return;

        try {
            const res = await fetch('/api/admin/students');
            const data = await res.json();
            this.cachedStudents = data.students || [];

            this.renderAdminStudents(this.cachedStudents);
        } catch (e) {}
    },

    renderAdminStudents(students) {
        const c = document.getElementById('adminStudentsTableContainer');
        if (!c) return;

        if (students.length === 0) {
            c.innerHTML = `<p class="text-xs text-[#8fb89e]">No students found.</p>`;
            return;
        }

        c.innerHTML = `
            <table class="w-full text-left text-xs text-[#8fb89e]">
                <thead class="text-[10px] uppercase bg-[#143528] text-[#52b788]">
                    <tr>
                        <th class="p-2.5">Name / College ID</th>
                        <th class="p-2.5">Room & Bed</th>
                        <th class="p-2.5">Phone</th>
                        <th class="p-2.5">Status</th>
                        <th class="p-2.5">Action</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-[#52b788]/10">
                    ${students.map(s => `
                        <tr class="hover:bg-[#143528]/50">
                            <td class="p-2.5 font-bold text-[#fefae0]">${s.full_name}<br><span class="text-[10px] font-normal font-mono text-[#52b788]">${s.college_id || s.username}</span></td>
                            <td class="p-2.5 text-[#fefae0]">${s.room_number ? `${s.room_number} (${s.bed_identifier})` : '<span class="text-amber-400">Unallocated</span>'}</td>
                            <td class="p-2.5 font-mono">${s.phone || 'N/A'}</td>
                            <td class="p-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.approval_status === 'approved' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}">${s.approval_status || 'approved'}</span></td>
                            <td class="p-2.5">
                                <button onclick="app.toggleStudentStatus(${s.id})" class="text-[11px] text-[#52b788] hover:underline">
                                    ${s.is_active ? 'Suspend' : 'Activate'}
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    filterAdminStudents() {
        const query = (document.getElementById('adminStudentSearchInput').value || '').toLowerCase();
        const filtered = this.cachedStudents.filter(s => 
            (s.full_name || '').toLowerCase().includes(query) ||
            (s.college_id || '').toLowerCase().includes(query) ||
            (s.room_number || '').toLowerCase().includes(query)
        );
        this.renderAdminStudents(filtered);
    },

    async toggleStudentStatus(id) {
        try {
            const res = await fetch(`/api/admin/students/${id}/toggle-status`, { method: 'PUT' });
            if (res.ok) {
                this.showToast('Student account status updated.', 'info');
                this.loadAdminStudents();
            }
        } catch (e) {}
    },

    // ==========================================
    // ROOMS MODULE (ADMIN)
    // ==========================================
    async loadRooms() {
        const c = document.getElementById('roomsGridContainer');
        if (!c) return;

        try {
            const block = (document.getElementById('roomBlockFilter') || {}).value || '';
            const occ = (document.getElementById('roomOccupancyFilter') || {}).value || '';

            const params = new URLSearchParams();
            if (block) params.append('block', block);
            if (occ) params.append('occupancy', occ);

            const res = await fetch(`/api/admin/rooms?${params.toString()}`);
            const data = await res.json();
            const rooms = data.rooms || [];
            this.cachedRooms = rooms;

            c.innerHTML = rooms.map(r => {
                const isFull = r.occupied >= r.capacity;
                const occPct = Math.round((r.occupied / r.capacity) * 100);

                return `
                    <div class="forest-card p-5 rounded-2xl border border-[#52b788]/20 space-y-3">
                        <div class="flex items-center justify-between pb-2 border-b border-[#52b788]/20">
                            <div>
                                <span class="text-[10px] text-[#52b788] uppercase font-bold">Block ${r.block} • Floor ${r.floor}</span>
                                <h4 class="text-base font-bold text-[#fefae0]">Room ${r.room_number}</h4>
                            </div>
                            <span class="text-[10px] px-2.5 py-0.5 rounded-full font-bold ${isFull ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}">
                                ${isFull ? 'Full' : `${r.capacity - r.occupied} Beds Free`}
                            </span>
                        </div>

                        <div class="space-y-1 text-xs">
                            <div class="flex justify-between text-[#8fb89e]">
                                <span>Occupancy (${r.occupied}/${r.capacity})</span>
                                <span>${occPct}%</span>
                            </div>
                            <div class="w-full bg-[#143528] h-2 rounded-full overflow-hidden">
                                <div class="bg-[#52b788] h-full" style="width: ${occPct}%"></div>
                            </div>
                        </div>

                        <div class="text-[11px] text-[#8fb89e] flex justify-between pt-1">
                            <span>Type: ${r.room_type || 'Standard'}</span>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (e) {}
    },

    async handleCreateRoom(e) {
        e.preventDefault();
        const payload = {
            room_number: document.getElementById('addRoomNumber').value.trim(),
            block: document.getElementById('addRoomBlock').value,
            floor: parseInt(document.getElementById('addRoomFloor').value),
            capacity: parseInt(document.getElementById('addRoomCapacity').value),
            room_type: document.getElementById('addRoomType').value
        };

        try {
            const res = await fetch('/api/admin/rooms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                this.closeModal('addRoomModal');
                this.showToast(`Room ${payload.room_number} created successfully!`, 'success');
                this.loadRooms();
            } else {
                const data = await res.json();
                this.showToast(data.error || 'Failed to create room', 'error');
            }
        } catch (e) {
            this.showToast('Failed to create room', 'error');
        }
    },

    async handleAllocateBed(e) {
        e.preventDefault();
        const payload = {
            student_id: parseInt(document.getElementById('allocateStudentSelect').value),
            room_id: parseInt(document.getElementById('allocateRoomSelect').value),
            bed_identifier: document.getElementById('allocateBedSelect').value
        };

        try {
            const res = await fetch('/api/admin/allocate-bed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                this.closeModal('allocateBedModal');
                this.showToast('Bed allocated successfully!', 'success');
                this.loadRooms();
                this.loadAdminStudents();
            } else {
                const data = await res.json();
                this.showToast(data.error || 'Allocation error', 'error');
            }
        } catch (e) {
            this.showToast('Failed to allocate bed', 'error');
        }
    },

    async loadAdminStaff() {
        const c = document.getElementById('adminStaffDirectoryContainer');
        if (!c) return;

        try {
            const res = await fetch('/api/admin/staff-directory');
            const data = await res.json();
            const staff = data.staff || [];

            c.innerHTML = staff.map(s => `
                <div class="forest-card p-4 rounded-2xl border border-[#52b788]/20 space-y-2 text-xs">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#2d6a4f] to-[#52b788] text-[#fefae0] flex items-center justify-center font-bold text-xs border border-[#52b788]/40 shadow-sm">
                            ${s.full_name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-bold text-[#fefae0]">${s.full_name}</div>
                            <div class="text-[10px] text-[#52b788] uppercase font-bold">${s.role}</div>
                        </div>
                    </div>
                    <div class="text-[#8fb89e] text-[11px] pt-1">
                        <div>Email: ${s.email}</div>
                        <div>Phone: ${s.phone || 'Ext. 104'}</div>
                    </div>
                </div>
            `).join('');
        } catch (e) {}
    },

    async loadAdminFinance() {
        const sumC = document.getElementById('adminFinanceSummaryContainer');
        const tbl = document.getElementById('adminRecentPaymentsTable');
        if (!sumC) return;

        try {
            const res = await fetch('/api/admin/finance-overview');
            const data = await res.json();
            const f = data.finance || {};

            sumC.innerHTML = `
                <div class="forest-card p-5 rounded-2xl border border-emerald-500/30">
                    <span class="text-xs text-[#8fb89e] uppercase font-bold">Total Fees Collected</span>
                    <div class="text-3xl font-extrabold text-emerald-400 mt-1">₹${(f.total_collected || 0).toLocaleString()}</div>
                    <div class="text-[10px] text-[#8fb89e] mt-1">${f.collection_rate || 94}% of total term billing</div>
                </div>
                <div class="forest-card p-5 rounded-2xl border border-rose-500/30">
                    <span class="text-xs text-[#8fb89e] uppercase font-bold">Outstanding Receivables</span>
                    <div class="text-3xl font-extrabold text-rose-400 mt-1">₹${(f.total_outstanding || 0).toLocaleString()}</div>
                    <div class="text-[10px] text-[#8fb89e] mt-1">Across all blocks</div>
                </div>
                <div class="forest-card p-5 rounded-2xl border border-[#faedcd]/30">
                    <span class="text-xs text-[#8fb89e] uppercase font-bold">Maintenance Reserve</span>
                    <div class="text-3xl font-extrabold text-[#52b788] mt-1">₹2,45,000</div>
                    <div class="text-[10px] text-[#8fb89e] mt-1">Allocated budget</div>
                </div>
            `;

            if (tbl) {
                tbl.innerHTML = (f.recent_transactions || []).map(t => `
                    <div class="p-2.5 rounded-xl bg-[#0f281e] border border-[#52b788]/20 flex items-center justify-between text-xs">
                        <div>
                            <span class="font-bold text-[#fefae0]">${t.student_name}</span>
                            <span class="text-[#8fb89e] text-[11px]"> • ${t.fee_type}</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="font-bold text-emerald-400">+₹${t.amount.toLocaleString()}</span>
                            <span class="text-[10px] text-[#8fb89e] font-mono">${t.receipt_number || 'TXN'}</span>
                        </div>
                    </div>
                `).join('');
            }
        } catch (e) {}
    },

    async loadAdminSettings() {
        try {
            const res = await fetch('/api/admin/settings');
            const data = await res.json();
            const s = data.settings || {};

            const curfew = document.getElementById('settingCurfewTime');
            if (curfew) curfew.value = s.curfew_time || '22:00';

            const visitor = document.getElementById('settingVisitorCutoff');
            if (visitor) visitor.value = s.visitor_cutoff || '20:00';

            const sla = document.getElementById('settingMaintenanceSLA');
            if (sla) sla.value = s.maintenance_sla_hours || 24;

            const laundry = document.getElementById('settingLaundryAllowance');
            if (laundry) laundry.value = s.laundry_max_loads_per_week || 3;

            const phone = document.getElementById('settingEmergencyPhone');
            if (phone) phone.value = s.emergency_contact_phone || '+91 98765-43210';
        } catch (e) {}
    },

    async handleSaveSettings(e) {
        e.preventDefault();
        const payload = {
            curfew_time: document.getElementById('settingCurfewTime').value,
            visitor_cutoff: document.getElementById('settingVisitorCutoff').value,
            maintenance_sla_hours: parseInt(document.getElementById('settingMaintenanceSLA').value),
            laundry_max_loads_per_week: parseInt(document.getElementById('settingLaundryAllowance').value),
            emergency_contact_phone: document.getElementById('settingEmergencyPhone').value.trim()
        };

        try {
            const res = await fetch('/api/admin/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                this.showToast('Hostel configurations updated!', 'success');
            }
        } catch (e) {
            this.showToast('Failed to save settings', 'error');
        }
    },

    // ==========================================
    // Gemma-4 OPEN-SOURCE ANALYTICS & TELEMETRY
    // ==========================================
    async loadAdminAnalytics() {
        const catC = document.getElementById('gema4CategoryChartContainer');
        const occC = document.getElementById('gema4OccupancyChartContainer');
        const sentC = document.getElementById('gema4SentimentContainer');
        const foreC = document.getElementById('gema4ForecastContainer');
        if (!catC) return;

        try {
            const res = await fetch('/api/admin/analytics');
            const data = await res.json();
            const a = data.analytics || {};

            // 1. Live Complaints by Category
            const categories = a.complaints_by_category || [];
            if (categories.length === 0) {
                catC.innerHTML = '<p class="text-xs text-[#8fb89e]">No complaints data in database.</p>';
            } else {
                catC.innerHTML = categories.map(c => `
                    <div>
                        <div class="flex justify-between text-[#8fb89e] mb-1">
                            <span class="font-bold text-[#fefae0]">${c.category} (${c.percentage}%)</span>
                            <span>${c.count} tickets</span>
                        </div>
                        <div class="w-full bg-[#143528] h-2.5 rounded-full overflow-hidden">
                            <div class="bg-[#52b788] h-full rounded-full transition-all duration-500" style="width: ${c.percentage}%"></div>
                        </div>
                    </div>
                `).join('');
            }

            // 2. Live Block Occupancy
            const blocks = a.occupancy_by_block || [];
            if (occC) {
                occC.innerHTML = blocks.map(b => `
                    <div>
                        <div class="flex justify-between text-[#8fb89e] mb-1">
                            <span class="font-bold text-[#52b788]">Block ${b.block}</span>
                            <span>${b.occupied_beds} / ${b.total_beds} beds (${b.rate}%)</span>
                        </div>
                        <div class="w-full bg-[#143528] h-2.5 rounded-full overflow-hidden">
                            <div class="bg-amber-400 h-full rounded-full transition-all duration-500" style="width: ${b.rate}%"></div>
                        </div>
                    </div>
                `).join('');
            }

            // 3. Gemma-4 Dining Sentiment NLP
            const s = a.gema4_sentiment || {};
            if (sentC) {
                sentC.innerHTML = `
                    <div class="p-4 rounded-xl bg-[#0f281e] border border-[#52b788]/20 space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-bold text-[#52b788]">Gemma-4 Sentiment Score</span>
                            <span class="text-base font-extrabold text-[#fefae0]">${s.sentiment_score || 96}%</span>
                        </div>
                        <div class="text-[11px] text-[#8fb89e]">Nutrition Health Index: <span class="text-[#52b788] font-bold">${s.nutrition_health_index || 92.5}/100</span></div>
                        <div class="text-[10px] text-[#8fb89e] pt-1">
                            <span class="font-bold text-[#52b788]">Gemma-4 Feedback Insights:</span> ${(s.top_applauded || []).join(', ') || 'High student satisfaction'}
                        </div>
                    </div>
                `;
            }

            // 4. Gemma-4 7-Day Predictive Modeling
            const f = (a.gema4_occupancy_forecast || {}).forecast_7_day || [];
            if (foreC) {
                foreC.innerHTML = f.map(d => `
                    <div class="text-center space-y-1">
                        <div class="text-[10px] font-bold text-[#52b788]">${d.occupancy}%</div>
                        <div class="w-8 bg-[#52b788] rounded-t mx-auto transition-all duration-500" style="height: ${Math.min(100, Math.max(25, d.occupancy))}px"></div>
                        <span class="text-[10px] text-[#8fb89e]">${d.day}</span>
                    </div>
                `).join('');
            }

        } catch (e) {
            catC.innerHTML = '<p class="text-xs text-red-400">Failed to load live Gemma 4 analytics.</p>';
        }
    },

    // ==========================================
    // MODALS & TOAST UTILITIES
    // ==========================================
    openModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.remove('hidden');

        // Populate dynamic selects
        if (id === 'allocateBedModal') {
            this.populateAllocateModal();
        }
    },

    closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('hidden');
    },

    switchModal(fromId, toId) {
        this.closeModal(fromId);
        this.openModal(toId);
    },

    openStudentLoginModal() {
        this.openModal('studentLoginModal');
    },

    openAdminLoginModal() {
        this.openModal('adminLoginModal');
    },

    async populateAllocateModal() {
        const studentSel = document.getElementById('allocateStudentSelect');
        const roomSel = document.getElementById('allocateRoomSelect');
        if (!studentSel || !roomSel) return;

        try {
            const res1 = await fetch('/api/admin/students');
            const data1 = await res1.json();
            const students = data1.students || [];

            studentSel.innerHTML = students.map(s => `
                <option value="${s.id}">${s.full_name} (${s.college_id || s.username})</option>
            `).join('');

            const res2 = await fetch('/api/admin/rooms');
            const data2 = await res2.json();
            const rooms = (data2.rooms || []).filter(r => r.occupied < r.capacity);

            roomSel.innerHTML = rooms.map(r => `
                <option value="${r.id}">Room ${r.room_number} (Block ${r.block} - ${r.capacity - r.occupied} Free)</option>
            `).join('');
        } catch (e) {}
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        let borderClass = 'border-[#52b788]/40 bg-[#0f281e] text-[#fefae0]';
        let icon = '<i class="fa-solid fa-circle-info text-[#52b788]"></i>';

        if (type === 'success') {
            borderClass = 'border-emerald-500/40 bg-[#0f281e] text-[#fefae0]';
            icon = '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
        } else if (type === 'error') {
            borderClass = 'border-rose-500/40 bg-[#0f281e] text-rose-200';
            icon = '<i class="fa-solid fa-triangle-exclamation text-rose-400"></i>';
        }

        toast.className = `p-3.5 rounded-2xl border ${borderClass} shadow-2xl flex items-center gap-3 text-xs pointer-events-auto toast-slide-up backdrop-blur-md`;
        toast.innerHTML = `${icon} <span class="font-medium">${message}</span>`;

        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    },

    toggleMobileSidebar() {
        const nav = document.getElementById('sidebarNav');
        if (nav) nav.classList.toggle('hidden');
    },

    // ==========================================
    // GEMMA-4 MOBILE & DESKTOP AI CONTROLLER
    // ==========================================
    toggleGemma4Chat() {
        this.toggleGema4Chat();
    },

    toggleGema4Chat() {
        const modal = document.getElementById('gema4ChatModal');
        if (!modal) return;
        const isHidden = modal.classList.toggle('hidden');
        if (!isHidden) {
            const input = document.getElementById('gema4ChatInput');
            if (input) setTimeout(() => input.focus(), 150);
            this.scrollGema4ToBottom();
        }
    },

    scrollGema4ToBottom() {
        const c = document.getElementById('gema4MessagesContainer');
        if (c) c.scrollTop = c.scrollHeight;
    },

    sendGemma4QuickPrompt(promptText) {
        this.sendGema4QuickPrompt(promptText);
    },

    sendGema4QuickPrompt(promptText) {
        const input = document.getElementById('gema4ChatInput');
        if (input) {
            input.value = promptText;
            document.getElementById('gema4ChatForm').requestSubmit();
        }
    },

    handleGemma4ChatSubmit(e) {
        return this.handleGema4ChatSubmit(e);
    },

    async handleGema4ChatSubmit(e) {
        e.preventDefault();
        const input = document.getElementById('gema4ChatInput');
        const container = document.getElementById('gema4MessagesContainer');
        const message = input.value.trim();
        if (!message) return;

        // Add user message bubble
        const userBubble = document.createElement('div');
        userBubble.className = 'flex justify-end';
        userBubble.innerHTML = `
            <div class="p-3 rounded-2xl rounded-tr-sm bg-[#2d6a4f] text-white max-w-[85%] shadow-sm">
                ${message}
            </div>
        `;
        container.appendChild(userBubble);
        input.value = '';
        this.scrollGema4ToBottom();

        // Add loading indicator bubble
        const loadingBubble = document.createElement('div');
        loadingBubble.className = 'flex items-start gap-2.5';
        loadingBubble.id = 'gema4ThinkingBubble';
        loadingBubble.innerHTML = `
            <div class="w-6 h-6 rounded-lg bg-[#52b788]/20 border border-[#52b788]/40 flex items-center justify-center text-[#52b788] text-xs flex-shrink-0 mt-0.5">
                <i class="fa-solid fa-sparkles animate-spin"></i>
            </div>
            <div class="p-3 rounded-2xl rounded-tl-sm bg-[#0f281e] border border-[#52b788]/20 text-[#8fb89e] text-xs">
                Gemma-4 is thinking...
            </div>
        `;
        container.appendChild(loadingBubble);
        this.scrollGema4ToBottom();

        try {
            const res = await fetch('/api/gema4/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message })
            });
            const data = await res.json();
            const thinking = document.getElementById('gema4ThinkingBubble');
            if (thinking) thinking.remove();

            const aiBubble = document.createElement('div');
            aiBubble.className = 'flex items-start gap-2.5';
            
            let replyText = (data.response || 'I am processing your campus inquiry.')
                .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
                .replace(/\n/g, '<br>');

            aiBubble.innerHTML = `
                <div class="w-6 h-6 rounded-lg bg-[#52b788]/20 border border-[#52b788]/40 flex items-center justify-center text-[#52b788] text-xs flex-shrink-0 mt-0.5">
                    <i class="fa-solid fa-sparkles"></i>
                </div>
                <div class="p-3 rounded-2xl rounded-tl-sm bg-[#0f281e] border border-[#52b788]/20 text-[#fefae0] leading-relaxed max-w-[85%] shadow-sm">
                    <div class="flex items-center justify-between text-[10px] text-[#52b788] mb-1 font-mono">
                        <span>${data.engine || 'Gemma-4'}</span>
                        <span class="text-[#8fb89e]">${data.timestamp || ''}</span>
                    </div>
                    <div>${replyText}</div>
                </div>
            `;
            container.appendChild(aiBubble);
            this.scrollGema4ToBottom();

        } catch (err) {
            const thinking = document.getElementById('gema4ThinkingBubble');
            if (thinking) thinking.remove();

            const errBubble = document.createElement('div');
            errBubble.className = 'p-2.5 rounded-xl bg-rose-950/20 text-rose-300 text-xs border border-rose-800/40';
            errBubble.textContent = 'Gemma-4 offline or busy. Please try again.';
            container.appendChild(errBubble);
            this.scrollGema4ToBottom();
        }
    },

    async aiAssistComplaintPrompt() {
        const titleInput = document.getElementById('complaintTitle');
        const descInput = document.getElementById('complaintDescription');
        const catSelect = document.getElementById('complaintCategory');
        const urgSelect = document.getElementById('complaintUrgency');

        const currentText = (descInput.value.trim() || titleInput.value.trim() || prompt('Briefly describe your maintenance issue (e.g. fan vibrating, tap leaking, no wifi):') || '').trim();
        if (!currentText) return;

        this.showToast('Gemma-4 is analyzing and auto-drafting ticket...', 'info');

        try {
            const res = await fetch('/api/gema4/assist-complaint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: currentText })
            });
            const data = await res.json();
            if (res.ok) {
                if (titleInput) titleInput.value = data.suggested_title;
                if (descInput) descInput.value = data.suggested_description;
                if (catSelect && data.suggested_category) catSelect.value = data.suggested_category;
                if (urgSelect && data.suggested_urgency) urgSelect.value = data.suggested_urgency;

                const triage = data.gema4_triage || {};
                this.showToast(`✨ Gemma-4 Polish applied! Target SLA: ${triage.recommended_sla_hours || 8}h (${triage.hazard_level || 'Normal'})`, 'success');
            }
        } catch (e) {
            this.showToast('Gemma-4 drafting assist unavailable', 'error');
        }
    },

    mobileNavTo(section) {
        if (!this.currentUser) {
            if (section === 'home') this.navigateTo('landing');
            else this.openStudentLoginModal();
            return;
        }

        if (this.currentUser.role === 'student') {
            if (section === 'home') this.navigateToStudentSubTab('my-room');
            else if (section === 'complaints') this.navigateToStudentSubTab('complaints');
            else if (section === 'mess') this.navigateToStudentSubTab('mess');
            else if (section === 'leaves') this.navigateToStudentSubTab('leaves');
        } else {
            if (section === 'home') this.navigateToAdminSubTab('admin-overview');
            else if (section === 'complaints') this.navigateToAdminSubTab('admin-complaints');
            else if (section === 'mess') this.navigateToAdminSubTab('admin-mess');
            else if (section === 'leaves') this.navigateToAdminSubTab('admin-leaves');
        }
    },

    setupEventListeners() {
        // Complaint listeners
        const cSearch = document.getElementById('complaintSearchInput');
        if (cSearch) cSearch.addEventListener('input', () => this.loadComplaints());

        const cStatus = document.getElementById('complaintStatusFilter');
        if (cStatus) cStatus.addEventListener('change', () => this.loadComplaints());

        const cCat = document.getElementById('complaintCategoryFilter');
        if (cCat) cCat.addEventListener('change', () => this.loadComplaints());

        // Leave listeners
        const lSearch = document.getElementById('leaveSearchInput');
        if (lSearch) lSearch.addEventListener('input', () => this.loadLeaveRequests());

        const lStatus = document.getElementById('leaveStatusFilter');
        if (lStatus) lStatus.addEventListener('change', () => this.loadLeaveRequests());

        // Room filters
        const rBlock = document.getElementById('roomBlockFilter');
        if (rBlock) rBlock.addEventListener('change', () => this.loadRooms());

        // URL Hash change navigation
        window.addEventListener('hashchange', () => {
            if (window.location.hash === '#login') {
                this.openRoleLogin(this.activeLoginRole || 'student');
            } else if (!window.location.hash && !this.currentUser) {
                this.navigateTo('landing');
            }
        });

        const rOcc = document.getElementById('roomOccupancyFilter');
        if (rOcc) rOcc.addEventListener('change', () => this.loadRooms());
    }
};

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
