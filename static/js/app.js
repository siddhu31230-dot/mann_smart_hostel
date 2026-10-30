/**
 * MANN Smart Hostel OS - Client Application Controller
 * Handles SPA navigation, role switching, forms, modals, filters, and API interactions.
 */

const app = {
    currentUser: null,
    activeTab: 'complaints',
    cachedRooms: [],
    cachedStaff: [],
    cachedStudents: [],
    currentMessDay: 'Monday',

    async init() {
        // Setup today's date for inputs
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('facilityBookingDateInput');
        if (dateInput) dateInput.value = today;
        const bookDate = document.getElementById('bookFacilityDate');
        if (bookDate) bookDate.value = today;

        // Check authentication
        await this.checkAuth();
        this.setupEventListeners();
    },

    setupEventListeners() {
        // Search & filter listeners for complaints
        const cSearch = document.getElementById('complaintSearchInput');
        if (cSearch) cSearch.addEventListener('input', () => this.loadComplaints());

        const cStatus = document.getElementById('complaintStatusFilter');
        if (cStatus) cStatus.addEventListener('change', () => this.loadComplaints());

        const cCat = document.getElementById('complaintCategoryFilter');
        if (cCat) cCat.addEventListener('change', () => this.loadComplaints());

        // Search & filter for leave
        const lSearch = document.getElementById('leaveSearchInput');
        if (lSearch) lSearch.addEventListener('input', () => this.loadLeaveRequests());

        const lStatus = document.getElementById('leaveStatusFilter');
        if (lStatus) lStatus.addEventListener('change', () => this.loadLeaveRequests());

        // Filters for rooms
        const rBlock = document.getElementById('roomBlockFilter');
        if (rBlock) rBlock.addEventListener('change', () => this.loadRooms());

        const rOcc = document.getElementById('roomOccupancyFilter');
        if (rOcc) rOcc.addEventListener('change', () => this.loadRooms());
    },

    async checkAuth() {
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                this.setUser(data.user);
            } else {
                // Auto login as default student for demo / QA convenience
                await this.quickSwitch('student');
            }
        } catch (err) {
            console.error('Auth check error:', err);
            await this.quickSwitch('student');
        }
    },

    setUser(user) {
        this.currentUser = user;
        document.getElementById('userFullName').textContent = user.full_name;
        document.getElementById('userRoleBadge').textContent = user.role.replace('_', ' ');

        const roomSub = user.room_number ? `Room ${user.room_number} · ${user.bed_number || 'Bed'}` : `${user.role.toUpperCase()}`;
        document.getElementById('sidebarUserSubtext').textContent = roomSub;

        // Update active role buttons
        document.querySelectorAll('.role-btn').forEach(btn => {
            if (btn.dataset.role === user.role) {
                btn.classList.add('bg-blue-600', 'text-white');
                btn.classList.remove('bg-transparent', 'text-slate-400');
            } else {
                btn.classList.remove('bg-blue-600', 'text-white');
                btn.classList.add('bg-transparent', 'text-slate-400');
            }
        });

        // Set complaint room input default
        const roomInput = document.getElementById('complaintRoomInput');
        if (roomInput && user.room_number) {
            roomInput.value = user.room_number;
        }

        // Render dynamic sidebar
        this.renderSidebar();

        // Switch to the first appropriate tab for this role
        const defaultTab = this.getDefaultTabForRole(user.role);
        this.switchTab(defaultTab);
    },

    getDefaultTabForRole(role) {
        switch(role) {
            case 'maintenance': return 'complaints';
            case 'mess_manager': return 'mess';
            case 'counsellor': return 'wellness';
            case 'admin': return 'rooms';
            case 'warden': return 'complaints';
            case 'student':
            default:
                return 'complaints';
        }
    },

    renderSidebar() {
        const role = this.currentUser.role;
        const nav = document.getElementById('navItemsList');
        const portalTitle = document.getElementById('sidebarPortalName');
        const wellnessPrivacy = document.getElementById('wellnessPrivacyNotice');
        nav.innerHTML = '';

        const roleTitles = {
            student: 'Student Portal',
            warden: 'Warden Desk',
            maintenance: 'Maintenance Desk',
            mess_manager: 'Mess Admin Portal',
            counsellor: 'Wellness Desk',
            admin: 'Hostel Admin OS'
        };
        portalTitle.textContent = roleTitles[role] || 'Hostel Portal';

        // Toggle wellness privacy notice for student and counsellor
        if (role === 'student' || role === 'counsellor') {
            wellnessPrivacy.classList.remove('hidden');
        } else {
            wellnessPrivacy.classList.add('hidden');
        }

        const items = [];

        if (role === 'student') {
            items.push(
                { id: 'complaints', label: 'My Complaints', icon: 'fa-wrench' },
                { id: 'leave', label: 'Gate Outpass / Leave', icon: 'fa-plane-departure' },
                { id: 'mess', label: 'Mess & Food Feedback', icon: 'fa-utensils' },
                { id: 'facilities', label: 'Facility Booking', icon: 'fa-basketball' },
                { id: 'wellness', label: 'Confidential Wellness', icon: 'fa-heart-pulse', badge: 'Private' }
            );
        } else if (role === 'warden') {
            items.push(
                { id: 'complaints', label: 'Complaints Board', icon: 'fa-wrench' },
                { id: 'leave', label: 'Leave Approvals', icon: 'fa-plane-departure' },
                { id: 'rooms', label: 'Room & Bed Overview', icon: 'fa-door-open' },
                { id: 'mess', label: 'Mess Feedback', icon: 'fa-utensils' }
            );
        } else if (role === 'maintenance') {
            items.push(
                { id: 'complaints', label: 'Assigned Work Orders', icon: 'fa-screwdriver-wrench' }
            );
        } else if (role === 'mess_manager') {
            items.push(
                { id: 'mess', label: 'Weekly Mess Menu', icon: 'fa-bowl-food' }
            );
        } else if (role === 'counsellor') {
            items.push(
                { id: 'wellness', label: 'Wellness Appointments', icon: 'fa-user-doctor', badge: 'Strict Privacy' }
            );
        } else if (role === 'admin') {
            items.push(
                { id: 'rooms', label: 'Room & Bed Allocation', icon: 'fa-hotel' },
                { id: 'complaints', label: 'All Complaints', icon: 'fa-wrench' },
                { id: 'leave', label: 'All Leave Requests', icon: 'fa-plane-departure' },
                { id: 'mess', label: 'Mess Overview', icon: 'fa-utensils' }
            );
        }

        items.forEach(item => {
            const btn = document.createElement('button');
            btn.className = `w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                this.activeTab === item.id 
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`;
            btn.onclick = () => this.switchTab(item.id);
            btn.innerHTML = `
                <div class="flex items-center gap-2.5">
                    <i class="fa-solid ${item.icon} w-4 text-center"></i>
                    <span>${item.label}</span>
                </div>
                ${item.badge ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">${item.badge}</span>` : ''}
            `;
            nav.appendChild(btn);
        });

        // Toggle action buttons in views based on role
        this.updateViewControls();
    },

    updateViewControls() {
        const role = this.currentUser.role;

        // Complaint buttons
        const cActions = document.getElementById('complaintActionButtons');
        if (cActions) {
            cActions.style.display = (role === 'student') ? 'block' : 'none';
        }

        // Leave buttons
        const lActions = document.getElementById('leaveActionButtons');
        if (lActions) {
            lActions.style.display = (role === 'student') ? 'block' : 'none';
        }

        // Mess buttons
        const fbBtn = document.getElementById('messFeedbackBtn');
        const updateMenuBtn = document.getElementById('updateMessMenuBtn');
        if (fbBtn) fbBtn.style.display = (role === 'student') ? 'flex' : 'none';
        if (updateMenuBtn) updateMenuBtn.style.display = (role === 'mess_manager' || role === 'admin') ? 'flex' : 'none';

        // Room buttons
        const addRoomBtn = document.getElementById('addRoomBtn');
        const allocBedBtn = document.getElementById('allocateBedBtn');
        if (addRoomBtn) addRoomBtn.style.display = (role === 'admin') ? 'flex' : 'none';
        if (allocBedBtn) allocBedBtn.style.display = (role === 'admin' || role === 'warden') ? 'flex' : 'none';

        // Wellness button
        const wActions = document.getElementById('wellnessActionButtons');
        if (wActions) {
            wActions.style.display = (role === 'student') ? 'block' : 'none';
        }
    },

    switchTab(tabId) {
        this.activeTab = tabId;
        document.querySelectorAll('.view-panel').forEach(panel => {
            panel.classList.add('hidden');
        });

        const activePanel = document.getElementById(`view-${tabId}`);
        if (activePanel) {
            activePanel.classList.remove('hidden');
        }

        // Re-render sidebar to highlight active tab
        this.renderSidebar();

        // Load data for the active tab
        switch(tabId) {
            case 'complaints': this.loadComplaints(); break;
            case 'leave': this.loadLeaveRequests(); break;
            case 'mess': this.loadMessMenu(); this.loadFoodFeedback(); break;
            case 'facilities': this.loadFacilityAvailability(); this.loadMyFacilityBookings(); break;
            case 'rooms': this.loadRooms(); break;
            case 'wellness': this.loadWellnessAppointments(); break;
        }
    },

    async quickSwitch(targetRole) {
        try {
            const res = await fetch('/api/auth/quick-switch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: targetRole })
            });
            const data = await res.json();
            if (res.ok) {
                this.toast(`Switched role to ${data.user.full_name} (${data.user.role})`, 'success');
                this.setUser(data.user);
            } else {
                this.toast(data.error || 'Failed to switch role', 'error');
            }
        } catch (err) {
            this.toast('Error switching role: ' + err.message, 'error');
        }
    },

    async logout() {
        await fetch('/api/auth/logout', { method: 'POST' });
        this.toast('Logged out successfully', 'info');
        setTimeout(() => window.location.reload(), 400);
    },

    // --- Workflow 1-5: Complaints Handling ---

    async loadComplaints() {
        const status = document.getElementById('complaintStatusFilter')?.value || 'All';
        const category = document.getElementById('complaintCategoryFilter')?.value || 'All';
        const search = document.getElementById('complaintSearchInput')?.value || '';

        const params = new URLSearchParams({ status, category, search });
        const container = document.getElementById('complaintsListContainer');
        container.innerHTML = '<div class="text-xs text-slate-400 py-4"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading complaints...</div>';

        try {
            const res = await fetch(`/api/complaints?${params.toString()}`);
            if (!res.ok) {
                const err = await res.json();
                container.innerHTML = `<div class="p-4 rounded-xl bg-red-950/20 border border-red-800/40 text-red-400 text-xs">${err.error}</div>`;
                return;
            }
            const data = await res.json();
            this.renderComplaints(data.complaints);
        } catch (err) {
            container.innerHTML = `<div class="p-4 rounded-xl bg-red-950/20 border border-red-800/40 text-red-400 text-xs">Error loading complaints: ${err.message}</div>`;
        }
    },

    renderComplaints(complaints) {
        const container = document.getElementById('complaintsListContainer');
        if (!complaints || complaints.length === 0) {
            container.innerHTML = `
                <div class="glass-card p-8 text-center space-y-3">
                    <div class="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400 text-xl">
                        <i class="fa-solid fa-clipboard-check"></i>
                    </div>
                    <h3 class="text-sm font-bold text-slate-200">No Complaints Found</h3>
                    <p class="text-xs text-slate-400 max-w-sm mx-auto">There are no maintenance complaints matching your current view or filter criteria.</p>
                </div>
            `;
            return;
        }

        const role = this.currentUser.role;
        container.innerHTML = complaints.map(c => {
            const statusClass = {
                'Open': 'badge-open',
                'Assigned': 'badge-assigned',
                'In Progress': 'badge-in-progress',
                'Resolved': 'badge-resolved',
                'Closed': 'badge-closed'
            }[c.status] || 'badge-open';

            const urgencyClass = c.urgency === 'Emergency' ? 'badge-emergency font-extrabold' : 'bg-slate-800 text-slate-300 border border-slate-700';

            // Action buttons according to workflow steps
            let actionBtn = '';
            if ((role === 'warden' || role === 'admin') && (c.status === 'Open' || c.status === 'Assigned')) {
                actionBtn = `
                    <button onclick="app.openAssignModal(${c.id}, '${c.title.replace(/'/g, "\\'")}', '${c.category}')" class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition">
                        <i class="fa-solid fa-user-plus mr-1"></i> Assign Staff
                    </button>
                `;
            } else if (role === 'maintenance' && (c.status === 'Assigned' || c.status === 'In Progress')) {
                actionBtn = `
                    <button onclick="app.openProgressModal(${c.id}, '${c.title.replace(/'/g, "\\'")}')" class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition">
                        <i class="fa-solid fa-screwdriver-wrench mr-1"></i> Update Progress
                    </button>
                `;
            } else if (role === 'student' && c.status === 'Resolved') {
                actionBtn = `
                    <button onclick="app.openConfirmResolutionModal(${c.id}, '${c.title.replace(/'/g, "\\'")}')" class="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold text-xs transition">
                        <i class="fa-solid fa-circle-check mr-1"></i> Confirm & Close
                    </button>
                `;
            }

            return `
                <div class="glass-card glass-card-hover p-4 space-y-3">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-xs font-mono font-bold text-slate-400">#${c.id}</span>
                            <span class="px-2 py-0.5 rounded-md text-[11px] font-semibold ${statusClass}">${c.status}</span>
                            <span class="px-2 py-0.5 rounded-md text-[11px] font-medium ${urgencyClass}">${c.urgency}</span>
                            <span class="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">${c.category}</span>
                            <span class="text-xs text-slate-400 font-medium"><i class="fa-solid fa-door-closed mr-1"></i>Room ${c.room_number}</span>
                        </div>
                        <div class="text-[11px] text-slate-500">
                            ${new Date(c.created_at).toLocaleString()}
                        </div>
                    </div>

                    <div>
                        <h3 class="text-sm font-bold text-white">${c.title}</h3>
                        <p class="text-xs text-slate-300 mt-1 leading-relaxed">${c.description}</p>
                    </div>

                    <!-- Assignment & Resolution Details -->
                    ${(c.staff_name || c.warden_notes || c.resolution_notes || c.student_feedback) ? `
                        <div class="p-3 rounded-lg bg-slate-900/80 border border-slate-800/80 text-xs space-y-1.5">
                            ${c.staff_name ? `<div class="text-slate-300"><span class="text-slate-500 font-semibold">Assigned Technician:</span> <span class="text-blue-400 font-medium">${c.staff_name}</span></div>` : ''}
                            ${c.warden_notes ? `<div class="text-slate-300"><span class="text-slate-500 font-semibold">Warden Instructions:</span> ${c.warden_notes}</div>` : ''}
                            ${c.resolution_notes ? `<div class="text-slate-300"><span class="text-green-400 font-semibold">Resolution Notes:</span> ${c.resolution_notes}</div>` : ''}
                            ${c.student_rating ? `<div class="text-slate-300"><span class="text-amber-400 font-semibold">Student Rating:</span> ${'⭐'.repeat(c.student_rating)} (${c.student_rating}/5) ${c.student_feedback ? `— "${c.student_feedback}"` : ''}</div>` : ''}
                        </div>
                    ` : ''}

                    <div class="flex items-center justify-between pt-1 border-t border-slate-800/60">
                        <div class="text-[11px] text-slate-400">
                            Reported by: <span class="text-slate-300 font-medium">${c.student_name}</span>
                        </div>
                        <div>${actionBtn}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    async handleComplaintSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        try {
            const res = await fetch('/api/complaints', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                this.toast('Complaint submitted successfully (# ' + data.complaint.id + ')', 'success');
                this.closeModal('submitComplaintModal');
                form.reset();
                this.loadComplaints();
            } else {
                this.toast(data.error || 'Submission failed', 'error');
            }
        } catch (err) {
            this.toast('Error submitting complaint: ' + err.message, 'error');
        }
    },

    async openAssignModal(complaintId, title, category) {
        document.getElementById('assignComplaintId').value = complaintId;
        document.getElementById('assignModalSubtitle').textContent = `Assign #${complaintId}: ${title}`;

        // Load maintenance staff list
        const select = document.getElementById('assignStaffSelect');
        select.innerHTML = '<option value="">Loading technicians...</option>';

        try {
            const res = await fetch('/api/admin/maintenance-staff');
            const data = await res.json();
            this.cachedStaff = data.staff || [];
            select.innerHTML = this.cachedStaff.map(s => `
                <option value="${s.id}">${s.full_name} (${s.email})</option>
            `).join('');
            this.openModal('assignStaffModal');
        } catch (err) {
            this.toast('Failed to load maintenance staff: ' + err.message, 'error');
        }
    },

    async handleAssignSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const complaintId = document.getElementById('assignComplaintId').value;
        const formData = new FormData(form);
        const payload = {
            staff_id: parseInt(formData.get('staff_id')),
            warden_notes: formData.get('warden_notes')
        };

        try {
            const res = await fetch(`/api/complaints/${complaintId}/assign`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                this.toast(data.message, 'success');
                this.closeModal('assignStaffModal');
                this.loadComplaints();
            } else {
                this.toast(data.error || 'Assignment failed', 'error');
            }
        } catch (err) {
            this.toast('Error: ' + err.message, 'error');
        }
    },

    openProgressModal(complaintId, title) {
        document.getElementById('progressComplaintId').value = complaintId;
        document.getElementById('progressModalSubtitle').textContent = `Ticket #${complaintId}: ${title}`;
        this.openModal('updateProgressModal');
    },

    async handleProgressSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const complaintId = document.getElementById('progressComplaintId').value;
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        try {
            const res = await fetch(`/api/complaints/${complaintId}/progress`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                this.toast(data.message, 'success');
                this.closeModal('updateProgressModal');
                this.loadComplaints();
            } else {
                this.toast(data.error || 'Update failed', 'error');
            }
        } catch (err) {
            this.toast('Error: ' + err.message, 'error');
        }
    },

    openConfirmResolutionModal(complaintId, title) {
        document.getElementById('confirmComplaintId').value = complaintId;
        document.getElementById('confirmModalSubtitle').textContent = `Verify repair for #${complaintId}: ${title}`;
        this.openModal('confirmResolutionModal');
    },

    async handleResolutionConfirmSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const complaintId = document.getElementById('confirmComplaintId').value;
        const formData = new FormData(form);
        const payload = {
            action: formData.get('action'),
            rating: parseInt(formData.get('rating')),
            feedback: formData.get('feedback')
        };

        try {
            const res = await fetch(`/api/complaints/${complaintId}/resolve-confirm`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                this.toast(data.message, 'success');
                this.closeModal('confirmResolutionModal');
                this.loadComplaints();
            } else {
                this.toast(data.error || 'Confirmation failed', 'error');
            }
        } catch (err) {
            this.toast('Error: ' + err.message, 'error');
        }
    },

    // --- Workflow 6-7: Leave & Gate Outpass ---

    async loadLeaveRequests() {
        const status = document.getElementById('leaveStatusFilter')?.value || 'All';
        const search = document.getElementById('leaveSearchInput')?.value || '';
        const params = new URLSearchParams({ status, search });
        const container = document.getElementById('leaveListContainer');
        container.innerHTML = '<div class="text-xs text-slate-400 py-4"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading leave records...</div>';

        try {
            const res = await fetch(`/api/leave-requests?${params.toString()}`);
            if (!res.ok) {
                const err = await res.json();
                container.innerHTML = `<div class="p-4 rounded-xl bg-red-950/20 border border-red-800/40 text-red-400 text-xs">${err.error}</div>`;
                return;
            }
            const data = await res.json();
            this.renderLeaveRequests(data.leave_requests);
        } catch (err) {
            container.innerHTML = `<div class="p-4 rounded-xl bg-red-950/20 border border-red-800/40 text-red-400 text-xs">Error: ${err.message}</div>`;
        }
    },

    renderLeaveRequests(requests) {
        const container = document.getElementById('leaveListContainer');
        if (!requests || requests.length === 0) {
            container.innerHTML = `
                <div class="glass-card p-8 text-center space-y-3">
                    <div class="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400 text-xl">
                        <i class="fa-solid fa-passport"></i>
                    </div>
                    <h3 class="text-sm font-bold text-slate-200">No Leave Requests Found</h3>
                    <p class="text-xs text-slate-400 max-w-sm mx-auto">There are no outpasses or leave applications filed currently.</p>
                </div>
            `;
            return;
        }

        const role = this.currentUser.role;
        container.innerHTML = requests.map(l => {
            const statusClass = {
                'Pending': 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
                'Approved': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
                'Rejected': 'bg-red-500/10 text-red-400 border border-red-500/30'
            }[l.status] || '';

            let actionBtn = '';
            if ((role === 'warden' || role === 'admin') && l.status === 'Pending') {
                actionBtn = `
                    <button onclick="app.openReviewLeaveModal(${l.id}, '${l.student_name.replace(/'/g, "\\'")}', '${l.leave_type}')" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition">
                        <i class="fa-solid fa-stamp mr-1"></i> Review Outpass
                    </button>
                `;
            }

            return `
                <div class="glass-card glass-card-hover p-4 space-y-3">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-xs font-mono font-bold text-slate-400">#LP-${l.id}</span>
                            <span class="px-2 py-0.5 rounded-md text-[11px] font-semibold ${statusClass}">${l.status}</span>
                            <span class="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">${l.leave_type}</span>
                            <span class="text-xs text-slate-400 font-medium">Room ${l.room_number || 'N/A'}</span>
                        </div>
                        <div class="text-[11px] text-slate-500">
                            Requested: ${new Date(l.created_at).toLocaleDateString()}
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                        <div>
                            <span class="text-slate-500 font-semibold block">Schedule:</span>
                            <span class="text-slate-200">Depart: ${l.departure_date}</span><br>
                            <span class="text-slate-200">Return: ${l.return_date}</span>
                        </div>
                        <div>
                            <span class="text-slate-500 font-semibold block">Guardian & Destination:</span>
                            <span class="text-slate-200">Contact: ${l.parent_contact}</span><br>
                            <span class="text-slate-200 truncate block">Destination: ${l.destination_address}</span>
                        </div>
                    </div>

                    <div>
                        <span class="text-xs text-slate-500 font-semibold">Reason:</span>
                        <p class="text-xs text-slate-300 mt-0.5">${l.reason}</p>
                    </div>

                    ${l.warden_remarks ? `
                        <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                            <span class="text-slate-400 font-semibold">Warden Remarks (${l.reviewer_name || 'Hostel Desk'}):</span>
                            <span class="text-slate-200 ml-1">${l.warden_remarks}</span>
                        </div>
                    ` : ''}

                    <div class="flex items-center justify-between pt-1 border-t border-slate-800/60">
                        <div class="text-[11px] text-slate-400">
                            Student: <span class="text-slate-200 font-medium">${l.student_name}</span>
                        </div>
                        <div>${actionBtn}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    async handleLeaveSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        // Client-side date check
        if (payload.return_date < payload.departure_date) {
            this.toast('Return date cannot be earlier than departure date', 'error');
            return;
        }

        try {
            const res = await fetch('/api/leave-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                this.toast('Leave outpass submitted successfully', 'success');
                this.closeModal('submitLeaveModal');
                form.reset();
                this.loadLeaveRequests();
            } else {
                this.toast(data.error || 'Submission failed', 'error');
            }
        } catch (err) {
            this.toast('Error submitting leave: ' + err.message, 'error');
        }
    },

    openReviewLeaveModal(leaveId, studentName, leaveType) {
        document.getElementById('reviewLeaveId').value = leaveId;
        document.getElementById('reviewLeaveModalSubtitle').textContent = `Reviewing Outpass #${leaveId} for ${studentName} (${leaveType})`;
        this.openModal('reviewLeaveModal');
    },

    async handleLeaveReviewSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const leaveId = document.getElementById('reviewLeaveId').value;
        const formData = new FormData(form);
        const payload = {
            decision: formData.get('decision'),
            remarks: formData.get('remarks')
        };

        try {
            const res = await fetch(`/api/leave-requests/${leaveId}/review`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                this.toast(data.message, 'success');
                this.closeModal('reviewLeaveModal');
                this.loadLeaveRequests();
            } else {
                this.toast(data.error || 'Review submission failed', 'error');
            }
        } catch (err) {
            this.toast('Error: ' + err.message, 'error');
        }
    },

    // --- Workflow 8-9: Mess Menu & Feedback ---

    selectMessDay(day) {
        this.currentMessDay = day;
        document.querySelectorAll('.mess-day-btn').forEach(btn => {
            if (btn.dataset.day === day) {
                btn.classList.add('bg-blue-600', 'text-white');
                btn.classList.remove('bg-slate-800', 'text-slate-400');
            } else {
                btn.classList.remove('bg-blue-600', 'text-white');
                btn.classList.add('bg-slate-800', 'text-slate-400');
            }
        });
        this.loadMessMenu();
    },

    async loadMessMenu() {
        const grid = document.getElementById('messMenuGrid');
        grid.innerHTML = '<div class="text-xs text-slate-400 py-4"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading menu...</div>';

        try {
            const res = await fetch(`/api/mess/menu?day=${this.currentMessDay}`);
            const data = await res.json();
            const meals = data.menu || [];

            const mealIcons = {
                'Breakfast': 'fa-mug-saucer',
                'Lunch': 'fa-bowl-rice',
                'Snacks': 'fa-cookie-bite',
                'Dinner': 'fa-plate-wheat'
            };

            const mealColors = {
                'Breakfast': 'from-amber-500/10 to-orange-500/10 border-amber-500/20',
                'Lunch': 'from-emerald-500/10 to-teal-500/10 border-emerald-500/20',
                'Snacks': 'from-blue-500/10 to-cyan-500/10 border-blue-500/20',
                'Dinner': 'from-purple-500/10 to-indigo-500/10 border-purple-500/20'
            };

            const allMeals = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'];
            grid.innerHTML = allMeals.map(mealType => {
                const item = meals.find(m => m.meal_type === mealType) || {
                    day_of_week: this.currentMessDay,
                    meal_type: mealType,
                    items: 'Menu to be published by mess manager',
                    dietary_type: 'Veg',
                    special_notes: ''
                };

                const dietBadge = item.dietary_type === 'Non-Veg' 
                    ? 'bg-red-500/15 text-red-400 border-red-500/30' 
                    : (item.dietary_type === 'Jain' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-green-500/15 text-green-400 border-green-500/30');

                return `
                    <div class="glass-card glass-card-hover p-4 flex flex-col justify-between border bg-gradient-to-b ${mealColors[mealType]}">
                        <div>
                            <div class="flex items-center justify-between mb-2">
                                <div class="flex items-center gap-2">
                                    <i class="fa-solid ${mealIcons[mealType]} text-slate-300"></i>
                                    <h3 class="text-sm font-bold text-white">${mealType}</h3>
                                </div>
                                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold border ${dietBadge}">${item.dietary_type}</span>
                            </div>
                            <p class="text-xs text-slate-200 mt-2 font-medium leading-relaxed">${item.items}</p>
                            ${item.special_notes ? `<div class="mt-2 text-[11px] text-slate-400 italic"><i class="fa-solid fa-circle-info mr-1"></i>${item.special_notes}</div>` : ''}
                        </div>
                        <div class="mt-4 pt-2 border-t border-slate-800/60 text-[10px] text-slate-500 flex justify-between">
                            <span>${this.currentMessDay}</span>
                            <span>MANN Campus Dining</span>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            grid.innerHTML = `<div class="text-xs text-red-400">Failed to load menu: ${err.message}</div>`;
        }
    },

    async handleMessMenuSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        try {
            const res = await fetch('/api/mess/menu', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                this.toast(data.message, 'success');
                this.closeModal('updateMessMenuModal');
                this.currentMessDay = payload.day_of_week;
                this.selectMessDay(payload.day_of_week);
            } else {
                this.toast(data.error || 'Menu update failed', 'error');
            }
        } catch (err) {
            this.toast('Error: ' + err.message, 'error');
        }
    },

    async loadFoodFeedback() {
        const list = document.getElementById('messFeedbackList');
        const badge = document.getElementById('feedbackStatsBadge');

        try {
            const res = await fetch('/api/mess/feedback');
            if (!res.ok) {
                // If student role, they don't see the full audit list unless enabled, but let's see response
                list.innerHTML = `<div class="text-xs text-slate-500 italic p-3">Submit your ratings above to help the hostel catering committee improve food quality.</div>`;
                return;
            }
            const data = await res.json();
            const reviews = data.feedback || [];
            const stats = data.stats || {};

            if (stats.avg_food_rating) {
                badge.textContent = `Avg Food: ⭐ ${stats.avg_food_rating}/5 · Hygiene: ⭐ ${stats.avg_hygiene_rating}/5 (${stats.total_reviews} reviews)`;
            } else {
                badge.textContent = 'No Reviews Yet';
            }

            if (reviews.length === 0) {
                list.innerHTML = `
                    <div class="glass-card p-6 text-center text-xs text-slate-400">
                        No food feedback submitted yet for recent meals.
                    </div>
                `;
                return;
            }

            list.innerHTML = reviews.slice(0, 5).map(r => `
                <div class="glass-card p-3.5 text-xs space-y-1">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-slate-200">${r.student_name}</span>
                            <span class="text-slate-400">· ${r.meal_type}</span>
                        </div>
                        <div class="text-amber-400 font-semibold">
                            Taste: ${'⭐'.repeat(r.rating)} · Hygiene: ${'⭐'.repeat(r.hygiene_rating)}
                        </div>
                    </div>
                    ${r.comments ? `<p class="text-slate-300 italic">"${r.comments}"</p>` : ''}
                    <div class="text-[10px] text-slate-500">${new Date(r.created_at).toLocaleString()}</div>
                </div>
            `).join('');
        } catch (err) {
            list.innerHTML = `<div class="text-xs text-slate-500">Feedback list unavailable for current role.</div>`;
        }
    },

    async handleFoodFeedbackSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const payload = {
            meal_type: formData.get('meal_type'),
            rating: parseInt(formData.get('rating')),
            hygiene_rating: parseInt(formData.get('hygiene_rating')),
            comments: formData.get('comments')
        };

        try {
            const res = await fetch('/api/mess/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                this.toast(data.message, 'success');
                this.closeModal('submitFoodFeedbackModal');
                form.reset();
                this.loadFoodFeedback();
            } else {
                this.toast(data.error || 'Submission failed', 'error');
            }
        } catch (err) {
            this.toast('Error: ' + err.message, 'error');
        }
    },

    // --- Workflow 10: Facility Booking ---

    async loadFacilityAvailability() {
        const date = document.getElementById('facilityBookingDateInput')?.value || new Date().toISOString().split('T')[0];
        const grid = document.getElementById('facilityGridContainer');
        grid.innerHTML = '<div class="text-xs text-slate-400 py-4"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Checking facility slots...</div>';

        try {
            const res = await fetch(`/api/facilities/available?date=${date}`);
            const data = await res.json();
            const facilities = data.facilities || [];

            const facIcons = {
                'Study Room': 'fa-book-open-reader',
                'Table Tennis': 'fa-table-tennis-paddle-ball',
                'Badminton Court': 'fa-volleyball',
                'Gym Slot': 'fa-dumbbell',
                'Music Room': 'fa-guitar',
                'Laundry Slot': 'fa-shirt'
            };

            grid.innerHTML = facilities.map(f => {
                const availableCount = f.slots.filter(s => s.available).length;
                return `
                    <div class="glass-card p-4 space-y-3 border border-slate-800">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <i class="fa-solid ${facIcons[f.facility_name] || 'fa-building'} text-indigo-400"></i>
                                <h3 class="text-sm font-bold text-white">${f.facility_name}</h3>
                            </div>
                            <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${availableCount > 0 ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}">
                                ${availableCount} Slots Open
                            </span>
                        </div>

                        <div class="space-y-1 max-h-48 overflow-y-auto pr-1">
                            ${f.slots.map(s => `
                                <div class="flex items-center justify-between text-xs p-1.5 rounded-lg ${s.available ? 'bg-slate-900/60 hover:bg-slate-800/80' : 'bg-slate-950/60 opacity-60'}">
                                    <span class="text-slate-300 font-mono text-[11px]">${s.slot_time}</span>
                                    ${s.available ? `
                                        <button onclick="app.quickBookSlot('${f.facility_name}', '${date}', '${s.slot_time}')" class="px-2 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white text-[10px] font-semibold transition">
                                            Book Slot
                                        </button>
                                    ` : `
                                        <span class="text-[10px] text-red-400 font-medium">Booked (${s.booked_by || 'Reserved'})</span>
                                    `}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            grid.innerHTML = `<div class="text-xs text-red-400">Failed to load facilities: ${err.message}</div>`;
        }
    },

    quickBookSlot(facilityName, date, slotTime) {
        document.getElementById('bookFacilitySelect').value = facilityName;
        document.getElementById('bookFacilityDate').value = date;
        const slotSelect = document.querySelector('#bookFacilityForm select[name="slot_time"]');
        if (slotSelect) slotSelect.value = slotTime;
        this.openModal('bookFacilityModal');
    },

    async handleFacilityBookSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        try {
            const res = await fetch('/api/facilities/book', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                this.toast(data.message, 'success');
                this.closeModal('bookFacilityModal');
                this.loadFacilityAvailability();
                this.loadMyFacilityBookings();
            } else {
                this.toast(data.error || 'Facility booking failed', 'error');
            }
        } catch (err) {
            this.toast('Error: ' + err.message, 'error');
        }
    },

    async loadMyFacilityBookings() {
        const list = document.getElementById('myFacilityBookingsList');
        if (!list) return;

        try {
            const res = await fetch('/api/facilities/my-bookings');
            if (!res.ok) {
                list.innerHTML = '';
                return;
            }
            const data = await res.json();
            const bookings = data.bookings || [];

            if (bookings.length === 0) {
                list.innerHTML = `<div class="text-xs text-slate-500 italic">You have no active facility bookings.</div>`;
                return;
            }

            list.innerHTML = bookings.map(b => `
                <div class="glass-card p-2.5 flex items-center justify-between text-xs">
                    <div class="flex items-center gap-2">
                        <i class="fa-solid fa-circle-check text-green-400"></i>
                        <span class="font-bold text-slate-200">${b.facility_name}</span>
                        <span class="text-slate-400">· Date: ${b.booking_date}</span>
                        <span class="text-indigo-400 font-mono">(${b.slot_time})</span>
                    </div>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">CONFIRMED</span>
                </div>
            `).join('');
        } catch (err) {
            list.innerHTML = '';
        }
    },

    // --- Workflow 11: Admin Room & Bed Allocations ---

    async loadRooms() {
        const block = document.getElementById('roomBlockFilter')?.value || 'All';
        const status = document.getElementById('roomOccupancyFilter')?.value || 'All';
        const grid = document.getElementById('roomsGridContainer');
        grid.innerHTML = '<div class="text-xs text-slate-400 py-4"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading hostel rooms...</div>';

        try {
            const res = await fetch(`/api/admin/rooms?block=${block}&status=${status}`);
            const data = await res.json();
            this.cachedRooms = data.rooms || [];
            this.renderRooms(this.cachedRooms);
        } catch (err) {
            grid.innerHTML = `<div class="text-xs text-red-400">Failed to load rooms: ${err.message}</div>`;
        }
    },

    renderRooms(rooms) {
        const grid = document.getElementById('roomsGridContainer');
        if (!rooms || rooms.length === 0) {
            grid.innerHTML = `
                <div class="glass-card p-8 text-center col-span-full">
                    <div class="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400 text-xl mb-2">
                        <i class="fa-solid fa-door-open"></i>
                    </div>
                    <h3 class="text-sm font-bold text-slate-200">No Rooms Found</h3>
                    <p class="text-xs text-slate-400">No rooms match the selected block and occupancy filter.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = rooms.map(r => {
            const occBadge = {
                'Vacant': 'bg-green-500/15 text-green-400 border border-green-500/30',
                'Partially Occupied': 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
                'Full': 'bg-red-500/15 text-red-400 border border-red-500/30'
            }[r.occupancy_status] || '';

            return `
                <div class="glass-card p-4 space-y-3 border border-slate-800">
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="flex items-center gap-2">
                                <h3 class="text-base font-extrabold text-white">${r.room_number}</h3>
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">${r.room_type}</span>
                            </div>
                            <div class="text-[11px] text-slate-400 mt-0.5">${r.block} · Floor ${r.floor}</div>
                        </div>
                        <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${occBadge}">${r.occupancy_status}</span>
                    </div>

                    <div class="space-y-1.5 pt-2 border-t border-slate-800">
                        <span class="text-[11px] text-slate-500 font-semibold block">Bed Spaces (${r.allocated_beds}/${r.total_beds} Occupied):</span>
                        <div class="grid grid-cols-2 gap-2">
                            ${r.beds.map(b => `
                                <div class="p-2 rounded-lg ${b.status === 'Allocated' ? 'bg-blue-950/30 border border-blue-800/40' : 'bg-slate-900 border border-dashed border-slate-700'} text-xs">
                                    <div class="flex items-center justify-between">
                                        <span class="font-bold text-slate-300">${b.bed_label}</span>
                                        <span class="text-[9px] px-1 py-0.2 rounded font-semibold ${b.status === 'Allocated' ? 'text-blue-400' : 'text-slate-500'}">${b.status}</span>
                                    </div>
                                    <div class="text-[10px] text-slate-400 truncate mt-1">
                                        ${b.student_name ? `👤 ${b.student_name}` : 'Vacant Space'}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    async handleAddRoomSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const payload = {
            room_number: formData.get('room_number').toUpperCase(),
            block: formData.get('block'),
            floor: parseInt(formData.get('floor')),
            capacity: parseInt(formData.get('capacity')),
            room_type: formData.get('room_type')
        };

        try {
            const res = await fetch('/api/admin/rooms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                this.toast(data.message, 'success');
                this.closeModal('addRoomModal');
                form.reset();
                this.loadRooms();
            } else {
                this.toast(data.error || 'Failed to add room', 'error');
            }
        } catch (err) {
            this.toast('Error: ' + err.message, 'error');
        }
    },

    async openAllocateBedModal() {
        // Load students
        const studentSelect = document.getElementById('allocateStudentSelect');
        const roomSelect = document.getElementById('allocateRoomSelect');
        studentSelect.innerHTML = '<option value="">Loading students...</option>';
        roomSelect.innerHTML = '<option value="">Loading rooms...</option>';

        try {
            const [sRes, rRes] = await Promise.all([
                fetch('/api/admin/students'),
                fetch('/api/admin/rooms')
            ]);
            const sData = await sRes.json();
            const rData = await rRes.json();

            this.cachedStudents = sData.students || [];
            this.cachedRooms = rData.rooms || [];

            studentSelect.innerHTML = this.cachedStudents.map(s => `
                <option value="${s.id}">${s.full_name} (${s.email}) — Current: ${s.room_number || 'Unallocated'}</option>
            `).join('');

            roomSelect.innerHTML = this.cachedRooms.map(r => `
                <option value="${r.id}">${r.room_number} (${r.block}, ${r.occupancy_status})</option>
            `).join('');

            this.handleRoomSelectionChange();
            this.openModal('allocateBedModal');
        } catch (err) {
            this.toast('Failed to load allocation data: ' + err.message, 'error');
        }
    },

    handleRoomSelectionChange() {
        const roomId = parseInt(document.getElementById('allocateRoomSelect').value);
        const bedSelect = document.getElementById('allocateBedSelect');
        const room = this.cachedRooms.find(r => r.id === roomId);

        if (!room || !room.beds) {
            bedSelect.innerHTML = '<option value="">No beds available</option>';
            return;
        }

        bedSelect.innerHTML = room.beds.map(b => `
            <option value="${b.bed_label}" ${b.status === 'Allocated' ? 'disabled' : ''}>
                ${b.bed_label} - ${b.status === 'Allocated' ? `(Occupied by ${b.student_name})` : 'Available'}
            </option>
        `).join('');
    },

    async handleAllocateBedSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const payload = {
            student_id: parseInt(formData.get('student_id')),
            room_id: parseInt(formData.get('room_id')),
            bed_label: formData.get('bed_label')
        };

        try {
            const res = await fetch('/api/admin/allocate-bed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                this.toast(data.message, 'success');
                this.closeModal('allocateBedModal');
                this.loadRooms();
            } else {
                this.toast(data.error || 'Allocation failed', 'error');
            }
        } catch (err) {
            this.toast('Error: ' + err.message, 'error');
        }
    },

    // --- Workflow 12: Confidential Wellness Appointments ---

    async loadWellnessAppointments() {
        const container = document.getElementById('wellnessAppointmentsList');
        container.innerHTML = '<div class="text-xs text-purple-300 py-4"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading confidential records...</div>';

        try {
            const res = await fetch('/api/wellness/appointments');
            if (res.status === 403) {
                const err = await res.json();
                container.innerHTML = `
                    <div class="p-6 rounded-2xl bg-red-950/30 border border-red-800/40 text-center space-y-2">
                        <i class="fa-solid fa-user-lock text-red-400 text-2xl"></i>
                        <h4 class="text-sm font-bold text-red-300">Access Prohibited: Privacy Protection</h4>
                        <p class="text-xs text-red-200/80 max-w-md mx-auto">${err.error}</p>
                    </div>
                `;
                return;
            }
            const data = await res.json();
            this.renderWellnessAppointments(data.appointments || []);
        } catch (err) {
            container.innerHTML = `<div class="text-xs text-red-400">Error: ${err.message}</div>`;
        }
    },

    renderWellnessAppointments(appointments) {
        const container = document.getElementById('wellnessAppointmentsList');
        const role = this.currentUser.role;

        if (appointments.length === 0) {
            container.innerHTML = `
                <div class="glass-card p-8 text-center space-y-3">
                    <div class="w-12 h-12 rounded-full bg-purple-950/40 flex items-center justify-center mx-auto text-purple-400 text-xl border border-purple-800/30">
                        <i class="fa-solid fa-heart-pulse"></i>
                    </div>
                    <h3 class="text-sm font-bold text-purple-200">No Counseling Sessions Logged</h3>
                    <p class="text-xs text-slate-400 max-w-sm mx-auto">There are no confidential wellness appointments requested at this time.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = appointments.map(a => {
            const statusClass = {
                'Pending': 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
                'Confirmed': 'bg-green-500/20 text-green-300 border border-green-500/30',
                'Completed': 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
                'Cancelled': 'bg-red-500/20 text-red-300 border border-red-500/30'
            }[a.status] || '';

            let actionBtn = '';
            if (role === 'counsellor' && (a.status === 'Pending' || a.status === 'Confirmed')) {
                actionBtn = `
                    <button onclick="app.openCounsellorStatusModal(${a.id}, '${a.student_name ? a.student_name.replace(/'/g, "\\'") : 'Student'}', '${a.issue_category}')" class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition">
                        <i class="fa-solid fa-calendar-check mr-1"></i> Update Session
                    </button>
                `;
            }

            return `
                <div class="glass-card glass-card-hover p-4 space-y-3 border border-purple-900/40 bg-purple-950/10">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-xs font-mono font-bold text-purple-400">#WELL-${a.id}</span>
                            <span class="px-2 py-0.5 rounded-md text-[11px] font-semibold ${statusClass}">${a.status}</span>
                            <span class="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">${a.session_mode}</span>
                            <span class="px-2 py-0.5 rounded-md text-[11px] font-semibold text-purple-300 bg-purple-900/30 border border-purple-800/40">${a.issue_category}</span>
                        </div>
                        <div class="text-[11px] text-purple-300/80">
                            Requested: ${new Date(a.created_at).toLocaleDateString()}
                        </div>
                    </div>

                    <div class="bg-slate-900/70 p-3 rounded-lg border border-purple-900/30 text-xs space-y-1">
                        <div class="flex items-center gap-2 text-slate-300">
                            <i class="fa-regular fa-clock text-purple-400"></i>
                            <span class="font-semibold text-white">Preferred Slot:</span>
                            <span>${a.preferred_date} at ${a.preferred_time}</span>
                        </div>
                        ${a.counsellor_name ? `
                            <div class="text-slate-300">
                                <span class="font-semibold text-purple-400">Assigned Counselor:</span>
                                <span>${a.counsellor_name}</span>
                            </div>
                        ` : ''}
                    </div>

                    <div>
                        <span class="text-xs font-semibold text-purple-300">Confidential Note:</span>
                        <p class="text-xs text-slate-300 mt-0.5 italic">"${a.confidential_notes}"</p>
                    </div>

                    ${a.counsellor_remarks ? `
                        <div class="p-2.5 rounded-lg bg-purple-900/20 border border-purple-800/40 text-xs">
                            <span class="text-purple-400 font-semibold">Counselor Response:</span>
                            <span class="text-purple-200 ml-1">${a.counsellor_remarks}</span>
                        </div>
                    ` : ''}

                    <div class="flex items-center justify-between pt-1 border-t border-purple-900/30">
                        <div class="text-[11px] text-purple-300/70">
                            ${a.student_name ? `Student: <span class="text-slate-200 font-semibold">${a.student_name} (${a.room_number || 'Room N/A'})</span>` : 'Encrypted Resident File'}
                        </div>
                        <div>${actionBtn}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    async handleWellnessSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        try {
            const res = await fetch('/api/wellness/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                this.toast(data.message, 'success');
                this.closeModal('requestWellnessModal');
                form.reset();
                this.loadWellnessAppointments();
            } else {
                this.toast(data.error || 'Booking request failed', 'error');
            }
        } catch (err) {
            this.toast('Error: ' + err.message, 'error');
        }
    },

    openCounsellorStatusModal(appointmentId, studentName, category) {
        document.getElementById('counsellorAppointmentId').value = appointmentId;
        document.getElementById('counsellorModalSubtitle').textContent = `Session #${appointmentId} with ${studentName} (${category})`;
        this.openModal('counsellorStatusModal');
    },

    async handleCounsellorStatusSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const aptId = document.getElementById('counsellorAppointmentId').value;
        const formData = new FormData(form);
        const payload = {
            status: formData.get('status'),
            counsellor_remarks: formData.get('counsellor_remarks')
        };

        try {
            const res = await fetch(`/api/wellness/appointments/${aptId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                this.toast(data.message, 'success');
                this.closeModal('counsellorStatusModal');
                this.loadWellnessAppointments();
            } else {
                this.toast(data.error || 'Failed to update appointment', 'error');
            }
        } catch (err) {
            this.toast('Error: ' + err.message, 'error');
        }
    },

    // --- Modal Management ---

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('hidden');
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
    },

    // --- Toast Alerts ---

    toast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast-slide-in px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-xs font-semibold border ${
            type === 'success' ? 'bg-emerald-950/90 text-emerald-300 border-emerald-800' :
            type === 'error' ? 'bg-red-950/90 text-red-300 border-red-800' :
            'bg-slate-900/90 text-slate-200 border-slate-700'
        }`;

        const icon = type === 'success' ? 'fa-circle-check text-emerald-400' :
                     type === 'error' ? 'fa-triangle-exclamation text-red-400' :
                     'fa-circle-info text-blue-400';

        toast.innerHTML = `
            <i class="fa-solid ${icon} text-base flex-shrink-0"></i>
            <span class="flex-1">${message}</span>
        `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
};

// Initialize app on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
