/**
 * MANN Care — Private Wellness Check-In Engine
 * Local-First • Web Crypto AES-GCM 256 • IndexedDB • Stealth Mode
 * "YOUR FEELINGS. YOUR DEVICE. YOUR CONTROL."
 */

class WellnessDB {
    constructor() {
        this.dbName = 'WellnessVaultDB';
        this.version = 1;
        this.db = null;
    }

    async init() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Store 1: Daily Check-Ins (one entry per date)
                if (!db.objectStoreNames.contains('checkins')) {
                    const checkinStore = db.createObjectStore('checkins', { keyPath: 'date' });
                    checkinStore.createIndex('mood', 'mood', { unique: false });
                    checkinStore.createIndex('stress', 'stress', { unique: false });
                    checkinStore.createIndex('created_at', 'created_at', { unique: false });
                }
                // Store 2: Standalone Private Journals
                if (!db.objectStoreNames.contains('journals')) {
                    const journalStore = db.createObjectStore('journals', { keyPath: 'id', autoIncrement: true });
                    journalStore.createIndex('date', 'date', { unique: false });
                    journalStore.createIndex('created_at', 'created_at', { unique: false });
                }
                // Store 3: Security & Vault Metadata (PIN hash, salt, settings)
                if (!db.objectStoreNames.contains('vault_meta')) {
                    db.createObjectStore('vault_meta', { keyPath: 'key' });
                }
                // Store 4: Confidential Appointments (Local record)
                if (!db.objectStoreNames.contains('appointments')) {
                    const aptStore = db.createObjectStore('appointments', { keyPath: 'id', autoIncrement: true });
                    aptStore.createIndex('date', 'date', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('IndexedDB Error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async getMeta(key) {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction('vault_meta', 'readonly');
            const store = tx.objectStore('vault_meta');
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result ? req.result.value : null);
            req.onerror = () => resolve(null);
        });
    }

    async setMeta(key, value) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('vault_meta', 'readwrite');
            const store = tx.objectStore('vault_meta');
            const req = store.put({ key, value, updated_at: new Date().toISOString() });
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    async saveCheckIn(checkInData) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('checkins', 'readwrite');
            const store = tx.objectStore('checkins');
            const req = store.put(checkInData);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async getCheckIn(date) {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction('checkins', 'readonly');
            const store = tx.objectStore('checkins');
            const req = store.get(date);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    async getAllCheckIns() {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction('checkins', 'readonly');
            const store = tx.objectStore('checkins');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    async deleteCheckIn(date) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('checkins', 'readwrite');
            const store = tx.objectStore('checkins');
            const req = store.delete(date);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    async saveJournal(journalData) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('journals', 'readwrite');
            const store = tx.objectStore('journals');
            const req = store.put(journalData);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async getAllJournals() {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction('journals', 'readonly');
            const store = tx.objectStore('journals');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    async deleteJournal(id) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('journals', 'readwrite');
            const store = tx.objectStore('journals');
            const req = store.delete(id);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    async saveAppointment(aptData) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('appointments', 'readwrite');
            const store = tx.objectStore('appointments');
            const req = store.put(aptData);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async getAllAppointments() {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction('appointments', 'readonly');
            const store = tx.objectStore('appointments');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    async clearAllData() {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['checkins', 'journals', 'vault_meta', 'appointments'], 'readwrite');
            tx.objectStore('checkins').clear();
            tx.objectStore('journals').clear();
            tx.objectStore('vault_meta').clear();
            tx.objectStore('appointments').clear();
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }
}

// ---------------------------------------------------------------------
// Web Crypto API Engine (PBKDF2 + AES-GCM 256)
// ---------------------------------------------------------------------
class WellnessCrypto {
    static bufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    static base64ToBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    static generateSalt() {
        return window.crypto.getRandomValues(new Uint8Array(16));
    }

    static generateIV() {
        return window.crypto.getRandomValues(new Uint8Array(12));
    }

    static async deriveKey(pinOrPassphrase, saltBuffer) {
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            enc.encode(pinOrPassphrase),
            { name: 'PBKDF2' },
            false,
            ['deriveKey', 'deriveBits']
        );

        return await window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBuffer,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    static async hashPin(pin, saltBuffer) {
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            enc.encode(pin),
            { name: 'PBKDF2' },
            false,
            ['deriveBits']
        );

        const bits = await window.crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: saltBuffer,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            256
        );

        return this.bufferToBase64(bits);
    }

    static async encryptText(plainText, cryptoKey) {
        if (!plainText) return { cipherText: '', iv: '' };
        const enc = new TextEncoder();
        const iv = this.generateIV();
        const cipherBuffer = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            cryptoKey,
            enc.encode(plainText)
        );

        return {
            cipherText: this.bufferToBase64(cipherBuffer),
            iv: this.bufferToBase64(iv)
        };
    }

    static async decryptText(cipherTextBase64, ivBase64, cryptoKey) {
        if (!cipherTextBase64 || !ivBase64) return '';
        try {
            const cipherBuffer = this.base64ToBuffer(cipherTextBase64);
            const ivBuffer = this.base64ToBuffer(ivBase64);
            const decryptedBuffer = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
                cryptoKey,
                cipherBuffer
            );
            const dec = new TextDecoder();
            return dec.decode(decryptedBuffer);
        } catch (e) {
            console.error('Decryption failed with current key:', e);
            return '[Encrypted Entry — Incorrect Key or Locked]';
        }
    }
}

// ---------------------------------------------------------------------
// Application State & Controller
// ---------------------------------------------------------------------
class WellnessApp {
    constructor() {
        this.db = new WellnessDB();
        this.currentView = 'home';
        this.vaultKey = null;
        this.isUnlocked = false;
        this.pinBuffer = '';
        this.pinMode = 'unlock'; // 'unlock', 'set', 'confirm'
        this.tempPin = '';
        this.isStealthMode = false;
        this.autoLockMinutes = 5;
        this.lastActiveTime = Date.now();
        this.failedAttempts = 0;
        this.lockoutUntil = 0;

        // Current Check-in Form State
        this.activeCheckIn = {
            date: new Date().toISOString().split('T')[0],
            mood: 'Calm',
            stress: 3,
            sleep: 'Good',
            tags: ['Academics'],
            journalNote: ''
        };

        // Charts container references
        this.weeklyMoodChart = null;
        this.stressSleepChart = null;
        this.tagFreqChart = null;

        // Companion daily reflection question pool
        this.reflectionQuestions = [
            "What is one small thing that gave you comfort or peace today?",
            "What is a heavy expectation you can gently let go of this week?",
            "When did you feel most like yourself in the past 48 hours?",
            "What is something you needed to hear today?",
            "Who is one person who makes you feel safe when hostel life gets loud?",
            "What is one small victory you achieved recently that no one noticed?"
        ];
    }

    async init() {
        await this.db.init();

        // Check if PIN is configured
        const pinHash = await this.db.getMeta('pin_hash');
        const autoLockVal = await this.db.getMeta('auto_lock_minutes');
        if (autoLockVal !== null) {
            this.autoLockMinutes = parseInt(autoLockVal, 10);
        }

        // Apply theme preference
        this.initTheme();

        // Setup global activity listener for auto-lock
        this.setupActivityListener();

        // Setup keyboard shortcuts (Escape for Stealth Mode)
        this.setupKeyboardShortcuts();

        // If PIN is not set yet, prompt to explore in Guest Mode or Set PIN
        if (!pinHash) {
            this.isUnlocked = true;
            this.showToast('🌿 Welcome to MANN Care. Your personal records will stay strictly on this device.', 'info');
        } else {
            // Require PIN unlock
            this.lockVault();
        }

        // Load today's checkin if existing
        await this.loadTodayCheckIn();

        // Set daily reflection question
        this.renderDailyReflection();

        // Populate initial UI
        this.navTo('home');
        this.updateHeaderStatus();
        this.renderUpcomingBookings();

        // Check for gentle intervention triggers
        await this.checkInterventions();

        // Service Worker registration
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/wellness-sw.js').catch(err => {
                console.log('SW registration note:', err);
            });
        }
    }

    // -----------------------------------------------------------------
    // Navigation & View Routing
    // -----------------------------------------------------------------
    navTo(viewId) {
        if (!this.isUnlocked && ['journal', 'calendar', 'vault'].includes(viewId)) {
            this.openPinModal('unlock', () => this.navTo(viewId));
            return;
        }

        this.currentView = viewId;
        const views = document.querySelectorAll('.wellness-view');
        views.forEach(v => v.classList.add('hidden'));

        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) {
            targetView.classList.remove('hidden');
        }

        // Update nav links styling
        document.querySelectorAll('.wellness-nav-btn').forEach(btn => {
            if (btn.getAttribute('data-view') === viewId) {
                btn.classList.add('wellness-nav-active');
            } else {
                btn.classList.remove('wellness-nav-active');
            }
        });

        // Trigger view-specific loads
        if (viewId === 'home') this.refreshHomeView();
        if (viewId === 'insights') this.renderInsights();
        if (viewId === 'journal') this.renderJournals();
        if (viewId === 'calendar') this.renderCalendar();
        if (viewId === 'vault') this.renderVaultStats();
        if (viewId === 'settings') this.renderSettings();

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // -----------------------------------------------------------------
    // Vault Security, PIN & Lock Handling
    // -----------------------------------------------------------------
    setupActivityListener() {
        const resetTimer = () => {
            this.lastActiveTime = Date.now();
        };

        window.addEventListener('mousemove', resetTimer);
        window.addEventListener('keydown', resetTimer);
        window.addEventListener('touchstart', resetTimer);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.autoLockMinutes > 0 && this.isUnlocked) {
                // Background lock check
                this.checkInactivityLock();
            } else {
                resetTimer();
            }
        });

        // Check inactivity every 15 seconds
        setInterval(() => this.checkInactivityLock(), 15000);
    }

    checkInactivityLock() {
        if (!this.isUnlocked || this.autoLockMinutes <= 0) return;
        const elapsedMinutes = (Date.now() - this.lastActiveTime) / 60000;
        if (elapsedMinutes >= this.autoLockMinutes) {
            this.lockVault();
            this.showToast('🔒 Vault automatically locked due to inactivity.', 'info');
        }
    }

    lockVault() {
        this.isUnlocked = false;
        this.vaultKey = null;
        this.updateHeaderStatus();
        this.openPinModal('unlock');
    }

    async openPinModal(mode = 'unlock', onSuccess = null) {
        this.pinMode = mode;
        this.pinBuffer = '';
        this.onPinSuccess = onSuccess;
        this.updatePinDots();

        const modal = document.getElementById('pinLockModal');
        const title = document.getElementById('pinModalTitle');
        const subtitle = document.getElementById('pinModalSubtitle');

        if (mode === 'unlock') {
            title.textContent = 'Unlock Private Vault';
            subtitle.textContent = 'Enter your 4-digit PIN to decrypt your personal journal & check-in records.';
        } else if (mode === 'set') {
            title.textContent = 'Set New 4-Digit PIN';
            subtitle.textContent = 'Choose a secure PIN to encrypt your personal wellness vault on this device.';
        } else if (mode === 'confirm') {
            title.textContent = 'Confirm 4-Digit PIN';
            subtitle.textContent = 'Re-enter your PIN to verify.';
        }

        modal.classList.remove('hidden');
    }

    closePinModal() {
        if (!this.isUnlocked && this.currentView !== 'home') {
            this.navTo('home');
        }
        document.getElementById('pinLockModal').classList.add('hidden');
    }

    pinKeyPress(digit) {
        if (Date.now() < this.lockoutUntil) {
            const secLeft = Math.ceil((this.lockoutUntil - Date.now()) / 1000);
            this.showToast(`⏳ Too many incorrect attempts. Please wait ${secLeft}s.`, 'error');
            return;
        }

        if (this.pinBuffer.length < 4) {
            this.pinBuffer += digit;
            this.updatePinDots();

            if (this.pinBuffer.length === 4) {
                setTimeout(() => this.handlePinSubmit(), 120);
            }
        }
    }

    pinBackspace() {
        if (this.pinBuffer.length > 0) {
            this.pinBuffer = this.pinBuffer.slice(0, -1);
            this.updatePinDots();
        }
    }

    updatePinDots() {
        for (let i = 1; i <= 4; i++) {
            const dot = document.getElementById(`pinDot${i}`);
            if (dot) {
                if (i <= this.pinBuffer.length) {
                    dot.classList.add('filled');
                } else {
                    dot.classList.remove('filled');
                }
            }
        }
    }

    async handlePinSubmit() {
        const pin = this.pinBuffer;
        this.pinBuffer = '';
        this.updatePinDots();

        if (this.pinMode === 'unlock') {
            const savedHash = await this.db.getMeta('pin_hash');
            const savedSaltBase64 = await this.db.getMeta('pin_salt');

            if (!savedHash || !savedSaltBase64) {
                // No PIN set: generate key directly and unlock
                this.isUnlocked = true;
                this.closePinModal();
                if (this.onPinSuccess) this.onPinSuccess();
                return;
            }

            const saltBuffer = WellnessCrypto.base64ToBuffer(savedSaltBase64);
            const computedHash = await WellnessCrypto.hashPin(pin, saltBuffer);

            if (computedHash === savedHash) {
                // Correct PIN
                this.failedAttempts = 0;
                this.vaultKey = await WellnessCrypto.deriveKey(pin, saltBuffer);
                this.isUnlocked = true;
                this.updateHeaderStatus();
                this.closePinModal();
                this.showToast('🔓 Vault unlocked. Your records are decrypted locally.', 'success');
                if (this.onPinSuccess) this.onPinSuccess();
            } else {
                this.failedAttempts++;
                if (this.failedAttempts >= 5) {
                    this.lockoutUntil = Date.now() + 30000;
                    this.showToast('🚨 5 incorrect attempts. Lockout for 30 seconds.', 'error');
                } else {
                    this.showToast(`Incorrect PIN. ${5 - this.failedAttempts} attempts remaining.`, 'error');
                }
            }
        } else if (this.pinMode === 'set') {
            this.tempPin = pin;
            this.openPinModal('confirm', this.onPinSuccess);
        } else if (this.pinMode === 'confirm') {
            if (pin === this.tempPin) {
                const salt = WellnessCrypto.generateSalt();
                const hash = await WellnessCrypto.hashPin(pin, salt);
                await this.db.setMeta('pin_hash', hash);
                await this.db.setMeta('pin_salt', WellnessCrypto.bufferToBase64(salt));
                this.vaultKey = await WellnessCrypto.deriveKey(pin, salt);
                this.isUnlocked = true;
                this.updateHeaderStatus();
                this.closePinModal();
                this.showToast('✨ PIN configured successfully! Your data is now Web Crypto encrypted.', 'success');
                if (this.onPinSuccess) this.onPinSuccess();
            } else {
                this.showToast('PINs did not match. Please start over.', 'error');
                this.openPinModal('set', this.onPinSuccess);
            }
        }
    }

    updateHeaderStatus() {
        const badge = document.getElementById('headerVaultBadge');
        if (badge) {
            if (this.isUnlocked) {
                badge.className = 'text-[11px] px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30';
                badge.innerHTML = '<i class="fa-solid fa-lock-open text-xs"></i> <span>Vault Unlocked</span>';
            } else {
                badge.className = 'text-[11px] px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30';
                badge.innerHTML = '<i class="fa-solid fa-lock text-xs"></i> <span>Vault Locked</span>';
            }
        }
    }

    // -----------------------------------------------------------------
    // Stealth Mode
    // -----------------------------------------------------------------
    setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            // Quick Stealth Shortcut: Escape or Alt+S
            if (e.key === 'Escape' || (e.altKey && e.key.toLowerCase() === 's')) {
                this.toggleStealthMode();
            }
        });
    }

    toggleStealthMode() {
        this.isStealthMode = !this.isStealthMode;
        const stealthContainer = document.getElementById('stealthOverlayContainer');
        const mainApp = document.getElementById('mainWellnessApp');
        const stealthBtn = document.getElementById('stealthToggleBtn');

        if (this.isStealthMode) {
            document.title = 'Personal Notes & Study Checklist';
            mainApp.classList.add('hidden');
            stealthContainer.classList.remove('hidden');
            if (stealthBtn) stealthBtn.innerHTML = '<i class="fa-solid fa-eye text-xs"></i> Exit Stealth (Esc)';
            this.showToast('🎭 Stealth Mode active. Wellness data disguised as study notes.', 'info');
        } else {
            document.title = 'MANN Care | Private Wellness Check-In';
            stealthContainer.classList.add('hidden');
            mainApp.classList.remove('hidden');
            if (stealthBtn) stealthBtn.innerHTML = '<i class="fa-solid fa-mask text-xs"></i> Stealth Mode (Esc)';
            this.showToast('🌿 Returned to Private Wellness view.', 'info');
        }
    }

    // -----------------------------------------------------------------
    // Daily Check-In Engine (<30 seconds)
    // -----------------------------------------------------------------
    async loadTodayCheckIn() {
        const todayStr = new Date().toISOString().split('T')[0];
        const existing = await this.db.getCheckIn(todayStr);

        if (existing) {
            this.activeCheckIn = {
                date: existing.date,
                mood: existing.mood,
                stress: existing.stress,
                sleep: existing.sleep,
                tags: existing.tags || [],
                journalNote: '' // Decrypted on demand
            };

            // If journal is attached and vault key is active, decrypt preview
            if (existing.encrypted_journal && this.vaultKey) {
                this.activeCheckIn.journalNote = await WellnessCrypto.decryptText(
                    existing.encrypted_journal.cipherText,
                    existing.encrypted_journal.iv,
                    this.vaultKey
                );
            }

            this.updateCheckInUI();
            this.updateTodayStatusBadge(true);
        } else {
            this.updateTodayStatusBadge(false);
        }
    }

    selectMood(moodName) {
        this.activeCheckIn.mood = moodName;
        document.querySelectorAll('.feeling-choice-card').forEach(card => {
            if (card.getAttribute('data-mood') === moodName) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });
    }

    updateStressSlider(value) {
        const val = parseInt(value, 10);
        this.activeCheckIn.stress = val;
        const valLabel = document.getElementById('stressValueLabel');
        const descLabel = document.getElementById('stressDescLabel');

        if (valLabel) valLabel.textContent = `${val}/10`;
        if (descLabel) {
            if (val <= 3) descLabel.textContent = 'Mild / Gentle and manageable';
            else if (val <= 6) descLabel.textContent = 'Moderate / Typical college pressure';
            else if (val <= 8) descLabel.textContent = 'High / Notable emotional tension';
            else descLabel.textContent = 'Severe / Intense pressure, take a break';
        }
    }

    selectSleep(sleepName) {
        this.activeCheckIn.sleep = sleepName;
        document.querySelectorAll('.sleep-choice-card').forEach(card => {
            if (card.getAttribute('data-sleep') === sleepName) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });
    }

    toggleTag(tagElement, tagName) {
        const idx = this.activeCheckIn.tags.indexOf(tagName);
        if (idx > -1) {
            this.activeCheckIn.tags.splice(idx, 1);
            tagElement.classList.remove('active');
        } else {
            this.activeCheckIn.tags.push(tagName);
            tagElement.classList.add('active');
        }
    }

    updateCheckInUI() {
        this.selectMood(this.activeCheckIn.mood);
        const slider = document.getElementById('stressSliderInput');
        if (slider) {
            slider.value = this.activeCheckIn.stress;
            this.updateStressSlider(this.activeCheckIn.stress);
        }
        this.selectSleep(this.activeCheckIn.sleep);

        // Update tag buttons
        document.querySelectorAll('.tag-chip').forEach(chip => {
            const tagName = chip.getAttribute('data-tag');
            if (this.activeCheckIn.tags.includes(tagName)) {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
        });

        // Journal input
        const journalInput = document.getElementById('checkinJournalInput');
        if (journalInput && this.activeCheckIn.journalNote) {
            journalInput.value = this.activeCheckIn.journalNote;
        }
    }

    updateTodayStatusBadge(completed) {
        const badge = document.getElementById('homeTodayStatusBadge');
        const checkinBtn = document.getElementById('homeCheckinActionBtn');

        if (badge) {
            if (completed) {
                badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5';
                badge.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-600"></i> Check-in Completed Today';
            } else {
                badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1.5 animate-pulse';
                badge.innerHTML = '<i class="fa-solid fa-circle-dot text-amber-500"></i> Check-in Pending for Today';
            }
        }

        if (checkinBtn) {
            checkinBtn.textContent = completed ? 'Edit Today\'s Check-In' : 'Start 30s Check-In';
        }
    }

    async submitCheckIn() {
        const journalText = (document.getElementById('checkinJournalInput')?.value || '').trim();
        const dateStr = this.activeCheckIn.date;

        let encryptedJournalPayload = null;
        if (journalText) {
            if (this.vaultKey) {
                encryptedJournalPayload = await WellnessCrypto.encryptText(journalText, this.vaultKey);
            } else {
                // If vault is unlocked without key, store unencrypted locally with flag
                encryptedJournalPayload = {
                    plainText: journalText,
                    unencrypted: true
                };
            }
        }

        const record = {
            date: dateStr,
            mood: this.activeCheckIn.mood,
            stress: this.activeCheckIn.stress,
            sleep: this.activeCheckIn.sleep,
            tags: [...this.activeCheckIn.tags],
            encrypted_journal: encryptedJournalPayload,
            updated_at: new Date().toISOString()
        };

        await this.db.saveCheckIn(record);

        // Also add to journals store if note is present
        if (journalText) {
            await this.db.saveJournal({
                date: dateStr,
                mood: this.activeCheckIn.mood,
                tags: [...this.activeCheckIn.tags],
                encrypted_payload: encryptedJournalPayload,
                created_at: new Date().toISOString()
            });
        }

        this.updateTodayStatusBadge(true);
        this.showToast('🌿 Check-in saved securely on your device.', 'success');
        this.navTo('home');
        await this.checkInterventions();
    }

    // -----------------------------------------------------------------
    // Home Dashboard & Overview
    // -----------------------------------------------------------------
    async refreshHomeView() {
        const allCheckins = await this.db.getAllCheckIns();
        allCheckins.sort((a, b) => b.date.localeCompare(a.date));

        // 1. Calculate Streak
        let streak = 0;
        let checkDate = new Date();
        while (true) {
            const dateStr = checkDate.toISOString().split('T')[0];
            const hasRecord = allCheckins.some(c => c.date === dateStr);
            if (hasRecord) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                // Check if yesterday had it (allowing today to still be completed)
                if (streak === 0) {
                    checkDate.setDate(checkDate.getDate() - 1);
                    const hadYesterday = allCheckins.some(c => c.date === checkDate.toISOString().split('T')[0]);
                    if (hadYesterday) {
                        streak++;
                        checkDate.setDate(checkDate.getDate() - 1);
                        continue;
                    }
                }
                break;
            }
        }

        const streakEl = document.getElementById('homeStreakCount');
        if (streakEl) streakEl.textContent = `${streak} ${streak === 1 ? 'day' : 'days'}`;

        // 2. Render 7-day pill timeline on home
        const pillsContainer = document.getElementById('homeWeekPillsContainer');
        if (pillsContainer) {
            pillsContainer.innerHTML = '';
            const today = new Date();
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(today.getDate() - i);
                const dStr = d.toISOString().split('T')[0];
                const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                const checkin = allCheckins.find(c => c.date === dStr);

                const pill = document.createElement('div');
                pill.className = 'flex flex-col items-center p-3 rounded-2xl border transition ' +
                    (checkin ? 'bg-[#D5EBDD]/50 border-[#176B50]/30 dark:bg-[#1C332A] dark:border-[#A8D5BA]/30' : 'bg-transparent border-dashed border-gray-300 dark:border-gray-700 opacity-60');

                pill.innerHTML = `
                    <span class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">${dayName}</span>
                    <span class="text-xl my-1">${checkin ? this.getMoodEmoji(checkin.mood) : '—'}</span>
                    <span class="text-[9px] font-bold ${checkin ? 'text-[#176B50] dark:text-[#A8D5BA]' : 'text-gray-400'}">${checkin ? `${checkin.stress}/10` : 'Skip'}</span>
                `;
                pillsContainer.appendChild(pill);
            }
        }
    }

    getMoodEmoji(mood) {
        switch (mood) {
            case 'Happy': return '😊';
            case 'Calm': return '😌';
            case 'Okay': return '😐';
            case 'Stressed': return '😰';
            case 'Sad': return '😢';
            case 'Overwhelmed': return '🤯';
            default: return '🌿';
        }
    }

    renderDailyReflection() {
        const textEl = document.getElementById('homeReflectionPrompt');
        if (textEl) {
            const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
            const question = this.reflectionQuestions[dayOfYear % this.reflectionQuestions.length];
            textEl.textContent = `"${question}"`;
        }
    }

    // -----------------------------------------------------------------
    // Mood Intelligence Dashboard & Analytics
    // -----------------------------------------------------------------
    async renderInsights() {
        const checkins = await this.db.getAllCheckIns();
        checkins.sort((a, b) => a.date.localeCompare(b.date));

        if (checkins.length === 0) {
            document.getElementById('insightsEmptyState')?.classList.remove('hidden');
            document.getElementById('insightsContent')?.classList.add('hidden');
            return;
        }

        document.getElementById('insightsEmptyState')?.classList.add('hidden');
        document.getElementById('insightsContent')?.classList.remove('hidden');

        // 1. Stats calculation
        const total = checkins.length;
        const avgStress = (checkins.reduce((sum, c) => sum + (c.stress || 0), 0) / total).toFixed(1);

        // Dominant mood
        const moodCounts = {};
        checkins.forEach(c => moodCounts[c.mood] = (moodCounts[c.mood] || 0) + 1);
        let dominantMood = 'Calm';
        let maxCount = 0;
        for (const [m, count] of Object.entries(moodCounts)) {
            if (count > maxCount) {
                maxCount = count;
                dominantMood = m;
            }
        }
        const dominantPct = Math.round((maxCount / total) * 100);

        // Tag frequencies
        const tagCounts = {};
        checkins.forEach(c => {
            (c.tags || []).forEach(t => tagCounts[t] = (tagCounts[t] || 0) + 1);
        });

        // Set KPI cards
        const avgStressEl = document.getElementById('kpiAvgStress');
        const dominantMoodEl = document.getElementById('kpiDominantMood');
        const checkinCountEl = document.getElementById('kpiTotalCheckins');

        if (avgStressEl) avgStressEl.textContent = `${avgStress}/10`;
        if (dominantMoodEl) dominantMoodEl.textContent = `${this.getMoodEmoji(dominantMood)} ${dominantMood} (${dominantPct}%)`;
        if (checkinCountEl) checkinCountEl.textContent = `${total} check-ins`;

        // 2. Observations & Pattern correlations
        this.renderCorrelationObservations(checkins, tagCounts, avgStress);

        // 3. Render Chart.js visual charts
        this.renderCharts(checkins, tagCounts);
    }

    renderCorrelationObservations(checkins, tagCounts, overallAvgStress) {
        const container = document.getElementById('insightsObservationsList');
        if (!container) return;
        container.innerHTML = '';

        const observations = [];

        // Check tags with significantly higher stress
        for (const [tag, count] of Object.entries(tagCounts)) {
            if (count >= 2) {
                const taggedRecords = checkins.filter(c => (c.tags || []).includes(tag));
                const tagAvgStress = (taggedRecords.reduce((s, c) => s + c.stress, 0) / taggedRecords.length).toFixed(1);

                if (tagAvgStress >= overallAvgStress + 1.2) {
                    observations.push({
                        icon: 'fa-triangle-exclamation',
                        color: 'text-amber-500',
                        bg: 'bg-amber-500/10 border-amber-500/30',
                        title: `Noticeable Strain Around "${tag}"`,
                        text: `On days influenced by **${tag}**, your reported stress averaged **${tagAvgStress}/10** (compared to your ${overallAvgStress}/10 baseline). Giving yourself intentional breathers around this can help.`
                    });
                } else if (tagAvgStress <= overallAvgStress - 1.0) {
                    observations.push({
                        icon: 'fa-seedling',
                        color: 'text-emerald-500',
                        bg: 'bg-emerald-500/10 border-emerald-500/30',
                        title: `Calming Anchor: "${tag}"`,
                        text: `Days tagged with **${tag}** correlated with a much calmer stress level of **${tagAvgStress}/10**. Investing time in this seems to restore your energy.`
                    });
                }
            }
        }

        // Sleep correlation observation
        const goodSleepDays = checkins.filter(c => c.sleep === 'Good' || c.sleep === 'Excellent');
        if (goodSleepDays.length >= 2) {
            const calmHappyOnGoodSleep = goodSleepDays.filter(c => c.mood === 'Calm' || c.mood === 'Happy').length;
            const pct = Math.round((calmHappyOnGoodSleep / goodSleepDays.length) * 100);
            observations.push({
                icon: 'fa-moon',
                color: 'text-indigo-400',
                bg: 'bg-indigo-500/10 border-indigo-500/30',
                title: 'Sleep & Mood Rhythm',
                text: `On nights with Restful or Rejuvenating sleep, **${pct}% of your check-ins** were Calm or Happy. Deep rest serves as a significant stabilizer.`
            });
        }

        if (observations.length === 0) {
            observations.push({
                icon: 'fa-compass',
                color: 'text-[#176B50]',
                bg: 'bg-[#D5EBDD]/40 border-[#176B50]/20 dark:bg-[#1C332A]',
                title: 'Building Your Baseline',
                text: 'As you complete more check-ins over the next several days, your on-device intelligence engine will surface deeper correlations between daily hostel influences and mood patterns.'
            });
        }

        observations.forEach(obs => {
            const card = document.createElement('div');
            card.className = `p-4 rounded-2xl border text-xs leading-relaxed flex items-start gap-3.5 ${obs.bg}`;
            card.innerHTML = `
                <i class="fa-solid ${obs.icon} ${obs.color} text-lg mt-0.5"></i>
                <div class="space-y-1">
                    <h5 class="font-bold text-sm">${obs.title}</h5>
                    <p class="text-gray-600 dark:text-gray-300">${obs.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>
                </div>
            `;
            container.appendChild(card);
        });
    }

    renderCharts(checkins, tagCounts) {
        const isDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark-theme');
        const textColor = isDark ? '#A8D5BA' : '#1C2923';
        const gridColor = isDark ? 'rgba(168, 213, 186, 0.1)' : 'rgba(23, 107, 80, 0.1)';

        // Chart 1: 7-Day Trend
        const last7 = checkins.slice(-7);
        const labels7 = last7.map(c => {
            const d = new Date(c.date + 'T00:00:00');
            return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
        });
        const stressData = last7.map(c => c.stress);
        const moodScoreMap = { 'Happy': 5, 'Calm': 4, 'Okay': 3, 'Stressed': 2, 'Sad': 1, 'Overwhelmed': 1 };
        const moodData = last7.map(c => moodScoreMap[c.mood] || 3);

        const ctx1 = document.getElementById('chartWeeklyJourney')?.getContext('2d');
        if (ctx1) {
            if (this.weeklyMoodChart) this.weeklyMoodChart.destroy();
            this.weeklyMoodChart = new Chart(ctx1, {
                type: 'line',
                data: {
                    labels: labels7,
                    datasets: [
                        {
                            label: 'Reported Stress (1-10)',
                            data: stressData,
                            borderColor: '#176B50',
                            backgroundColor: 'rgba(23, 107, 80, 0.15)',
                            fill: true,
                            tension: 0.35,
                            borderWidth: 3,
                            pointRadius: 5,
                            pointBackgroundColor: '#176B50'
                        },
                        {
                            label: 'Mood Valence (1-5)',
                            data: moodData,
                            borderColor: '#A8D5BA',
                            backgroundColor: 'rgba(168, 213, 186, 0.2)',
                            tension: 0.35,
                            borderDash: [5, 5],
                            borderWidth: 2,
                            pointRadius: 4,
                            pointBackgroundColor: '#A8D5BA'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 11 } } }
                    },
                    scales: {
                        y: {
                            min: 0,
                            max: 10,
                            grid: { color: gridColor },
                            ticks: { color: textColor }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: textColor }
                        }
                    }
                }
            });
        }

        // Chart 2: Influencing Factor Frequency
        const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
        const ctx2 = document.getElementById('chartTagFrequency')?.getContext('2d');
        if (ctx2) {
            if (this.tagFreqChart) this.tagFreqChart.destroy();
            this.tagFreqChart = new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels: sortedTags.map(t => t[0]),
                    datasets: [{
                        label: 'Check-In Occurrences',
                        data: sortedTags.map(t => t[1]),
                        backgroundColor: '#176B50',
                        borderRadius: 8
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: {
                            beginAtZero: true,
                            grid: { color: gridColor },
                            ticks: { color: textColor, precision: 0 }
                        },
                        y: {
                            grid: { display: false },
                            ticks: { color: textColor }
                        }
                    }
                }
            });
        }
    }

    // -----------------------------------------------------------------
    // Calendar Timeline View
    // -----------------------------------------------------------------
    async renderCalendar() {
        const container = document.getElementById('calendarDaysGrid');
        if (!container) return;
        container.innerHTML = '';

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        // Month title
        const monthTitle = document.getElementById('calendarMonthTitle');
        if (monthTitle) {
            monthTitle.textContent = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }

        const firstDayIndex = new Date(year, month, 1).getDay();
        const totalDays = new Date(year, month + 1, 0).getDate();

        const allCheckins = await this.db.getAllCheckIns();
        const checkinMap = {};
        allCheckins.forEach(c => checkinMap[c.date] = c);

        // Blank padding for days before the 1st
        for (let i = 0; i < firstDayIndex; i++) {
            const blank = document.createElement('div');
            blank.className = 'h-20 sm:h-24 p-1 rounded-xl opacity-20';
            container.appendChild(blank);
        }

        // Days of month
        for (let day = 1; day <= totalDays; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const checkin = checkinMap[dateStr];
            const isToday = dateStr === new Date().toISOString().split('T')[0];

            const cell = document.createElement('div');
            cell.className = `h-20 sm:h-24 p-2 rounded-2xl border transition flex flex-col justify-between cursor-pointer ${
                isToday ? 'border-[#176B50] ring-2 ring-[#176B50]/30' : 'border-gray-200 dark:border-gray-800'
            } ${checkin ? 'bg-[#D5EBDD]/40 dark:bg-[#1C332A]/70 hover:scale-[1.02]' : 'hover:bg-gray-100 dark:hover:bg-gray-800/40'}`;

            cell.onclick = () => this.inspectDay(dateStr, checkin);

            cell.innerHTML = `
                <div class="flex items-center justify-between text-xs">
                    <span class="font-bold ${isToday ? 'text-[#176B50] dark:text-[#A8D5BA]' : 'text-gray-500'}">${day}</span>
                    ${checkin && checkin.encrypted_journal ? '<i class="fa-solid fa-lock text-[10px] text-gray-400" title="Private Journal Attached"></i>' : ''}
                </div>
                ${checkin ? `
                    <div class="text-center my-auto">
                        <span class="text-xl sm:text-2xl">${this.getMoodEmoji(checkin.mood)}</span>
                    </div>
                    <div class="flex items-center justify-between text-[9px] font-bold text-gray-500">
                        <span>${checkin.stress}/10</span>
                        <span>${checkin.sleep.slice(0, 4)}</span>
                    </div>
                ` : `
                    <div class="text-center text-[10px] text-gray-400 my-auto">—</div>
                `}
            `;
            container.appendChild(cell);
        }
    }

    async inspectDay(dateStr, checkin) {
        if (!checkin) {
            this.showToast(`No check-in recorded for ${dateStr}.`, 'info');
            return;
        }

        const modal = document.getElementById('dayDetailModal');
        const title = document.getElementById('dayDetailTitle');
        const body = document.getElementById('dayDetailBody');

        if (title) title.textContent = `Check-In Record: ${dateStr}`;

        let journalContent = '<em>No journal attached to this entry.</em>';
        if (checkin.encrypted_journal) {
            if (this.vaultKey) {
                const decrypted = await WellnessCrypto.decryptText(
                    checkin.encrypted_journal.cipherText,
                    checkin.encrypted_journal.iv,
                    this.vaultKey
                );
                journalContent = `<div class="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border text-xs whitespace-pre-wrap leading-relaxed">${decrypted}</div>`;
            } else {
                journalContent = `<div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 text-xs flex items-center justify-between">
                    <span><i class="fa-solid fa-lock mr-1.5"></i> Journal entry is encrypted.</span>
                    <button onclick="app.openPinModal('unlock', () => app.inspectDay('${dateStr}', ${JSON.stringify(checkin).replace(/"/g, '&quot;')}))" class="px-2.5 py-1 rounded bg-[#176B50] text-white text-[11px] font-bold">Unlock</button>
                </div>`;
            }
        }

        if (body) {
            body.innerHTML = `
                <div class="space-y-4 text-xs">
                    <div class="grid grid-cols-3 gap-3 text-center">
                        <div class="p-3 rounded-xl bg-[#D5EBDD]/40 dark:bg-[#1C332A] border border-[#176B50]/20">
                            <span class="text-gray-500 text-[10px] uppercase font-bold block">Feeling</span>
                            <span class="text-lg">${this.getMoodEmoji(checkin.mood)}</span>
                            <span class="font-bold block text-sm">${checkin.mood}</span>
                        </div>
                        <div class="p-3 rounded-xl bg-[#D5EBDD]/40 dark:bg-[#1C332A] border border-[#176B50]/20">
                            <span class="text-gray-500 text-[10px] uppercase font-bold block">Stress</span>
                            <span class="text-lg font-black text-[#176B50] dark:text-[#A8D5BA] mt-1">${checkin.stress}/10</span>
                        </div>
                        <div class="p-3 rounded-xl bg-[#D5EBDD]/40 dark:bg-[#1C332A] border border-[#176B50]/20">
                            <span class="text-gray-500 text-[10px] uppercase font-bold block">Sleep</span>
                            <span class="text-sm font-bold block mt-1">${checkin.sleep}</span>
                        </div>
                    </div>
                    <div>
                        <span class="text-gray-500 text-[10px] uppercase font-bold block mb-1.5">Influences Tagged</span>
                        <div class="flex flex-wrap gap-1.5">
                            ${(checkin.tags || []).map(t => `<span class="px-2.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-800 text-[11px] font-medium">${t}</span>`).join('') || '<span class="text-gray-400">None</span>'}
                        </div>
                    </div>
                    <div>
                        <span class="text-gray-500 text-[10px] uppercase font-bold block mb-1.5">Encrypted Journal Note</span>
                        ${journalContent}
                    </div>
                </div>
            `;
        }

        modal.classList.remove('hidden');
    }

    closeDayDetailModal() {
        document.getElementById('dayDetailModal')?.classList.add('hidden');
    }

    // -----------------------------------------------------------------
    // My Journal View
    // -----------------------------------------------------------------
    async renderJournals() {
        const container = document.getElementById('journalsListContainer');
        if (!container) return;
        container.innerHTML = '';

        const journals = await this.db.getAllJournals();
        journals.sort((a, b) => b.created_at.localeCompare(a.created_at));

        if (journals.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center text-gray-500 space-y-2">
                    <i class="fa-solid fa-book-bookmark text-3xl text-gray-400"></i>
                    <h4 class="font-bold text-sm">No Journal Entries Yet</h4>
                    <p class="text-xs max-w-sm mx-auto">Journal entries added during your daily check-ins or written here will be encrypted with Web Crypto AES-256 and stored on your device.</p>
                </div>
            `;
            return;
        }

        for (const j of journals) {
            let notePreview = '🔒 Encrypted on-device';
            if (this.vaultKey && j.encrypted_payload) {
                notePreview = await WellnessCrypto.decryptText(
                    j.encrypted_payload.cipherText,
                    j.encrypted_payload.iv,
                    this.vaultKey
                );
            } else if (j.encrypted_payload && j.encrypted_payload.unencrypted) {
                notePreview = j.encrypted_payload.plainText;
            }

            const card = document.createElement('div');
            card.className = 'wellness-card p-5 space-y-2.5 text-xs';
            card.innerHTML = `
                <div class="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                    <div class="flex items-center gap-2">
                        <span class="text-base">${this.getMoodEmoji(j.mood)}</span>
                        <span class="font-bold text-sm text-[#176B50] dark:text-[#A8D5BA]">${j.date}</span>
                    </div>
                    <button onclick="app.deleteJournalEntry(${j.id})" class="text-gray-400 hover:text-red-500 transition p-1" title="Delete Entry">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>
                </div>
                <div class="whitespace-pre-wrap leading-relaxed text-gray-700 dark:text-gray-200">${notePreview}</div>
                <div class="flex flex-wrap gap-1 pt-1">
                    ${(j.tags || []).map(t => `<span class="px-2 py-0.5 rounded-full text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">${t}</span>`).join('')}
                </div>
            `;
            container.appendChild(card);
        }
    }

    async deleteJournalEntry(id) {
        if (confirm('Delete this journal entry from your local vault? This action cannot be undone.')) {
            await this.db.deleteJournal(id);
            this.showToast('Journal entry deleted.', 'info');
            this.renderJournals();
        }
    }

    // -----------------------------------------------------------------
    // Counselor Booking Prototype (Anonymous Alias)
    // -----------------------------------------------------------------
    generateRandomAlias() {
        const randId = Math.floor(100 + Math.random() * 900);
        return `Student #${randId}`;
    }

    initBookingForm() {
        const aliasField = document.getElementById('bookingAliasDisplay');
        if (aliasField) {
            aliasField.textContent = this.generateRandomAlias();
        }
        // Set min date to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateInput = document.getElementById('bookingDateInput');
        if (dateInput) {
            dateInput.min = tomorrow.toISOString().split('T')[0];
            dateInput.value = tomorrow.toISOString().split('T')[0];
        }
    }

    async submitCounselorBooking(e) {
        e.preventDefault();
        const alias = document.getElementById('bookingAliasDisplay')?.textContent || 'Student #402';
        const date = document.getElementById('bookingDateInput')?.value;
        const slot = document.getElementById('bookingSlotInput')?.value;
        const mode = document.getElementById('bookingModeInput')?.value;
        const category = document.getElementById('bookingCategoryInput')?.value;
        const notes = document.getElementById('bookingNotesInput')?.value || '';

        if (!date || !slot) {
            this.showToast('Please select a date and preferred time slot.', 'error');
            return;
        }

        const bookingRef = `APT-${Math.floor(10000 + Math.random() * 90000)}`;

        const localApt = {
            ref: bookingRef,
            alias,
            date,
            slot,
            mode,
            category,
            status: 'Confirmed (Local Scheduled)',
            created_at: new Date().toISOString()
        };

        // Save into local IndexedDB
        await this.db.saveAppointment(localApt);

        // Also submit to Flask backend /api/wellness/appointments so the campus counselor dashboard syncs!
        try {
            await fetch('/api/wellness/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    preferred_date: date,
                    preferred_time_slot: slot,
                    session_mode: mode,
                    issue_category: category,
                    notes: `[Booked via Private Alias: ${alias}] ${notes}`
                })
            });
        } catch (err) {
            console.log('Backend sync note (running offline or unauth):', err);
        }

        // Show confirmation modal
        document.getElementById('bookingConfirmRef').textContent = bookingRef;
        document.getElementById('bookingConfirmDate').textContent = `${date} at ${slot}`;
        document.getElementById('bookingConfirmAlias').textContent = alias;
        document.getElementById('bookingConfirmModal').classList.remove('hidden');

        this.renderUpcomingBookings();
    }

    closeBookingConfirmModal() {
        document.getElementById('bookingConfirmModal')?.classList.add('hidden');
        this.navTo('home');
    }

    async renderUpcomingBookings() {
        const list = document.getElementById('upcomingBookingsList');
        if (!list) return;
        const apts = await this.db.getAllAppointments();
        if (apts.length === 0) {
            list.innerHTML = '<span class="text-xs text-gray-400">No active confidential appointments booked.</span>';
            return;
        }

        list.innerHTML = apts.map(a => `
            <div class="p-3 rounded-xl bg-white dark:bg-[#162420] border text-xs flex items-center justify-between">
                <div>
                    <span class="font-bold text-[#176B50] dark:text-[#A8D5BA]">${a.ref}</span> • <span>${a.date} (${a.slot})</span>
                    <div class="text-[10px] text-gray-500">${a.mode} • Alias: ${a.alias}</div>
                </div>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600">${a.status}</span>
            </div>
        `).join('');
    }

    // -----------------------------------------------------------------
    // Gentle Interventions & Grounding Tools
    // -----------------------------------------------------------------
    async checkInterventions() {
        const checkins = await this.db.getAllCheckIns();
        checkins.sort((a, b) => b.date.localeCompare(a.date));

        if (checkins.length < 3) return;

        const banner = document.getElementById('gentleInterventionBanner');
        if (!banner) return;

        const last3 = checkins.slice(0, 3);
        const highStressCount = last3.filter(c => c.stress >= 7).length;
        const lowMoodCount = last3.filter(c => c.mood === 'Sad' || c.mood === 'Overwhelmed').length;

        if (highStressCount >= 3) {
            banner.classList.remove('hidden');
            banner.innerHTML = `
                <div class="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs">
                    <i class="fa-solid fa-heart-pulse text-amber-500 text-lg mt-0.5"></i>
                    <div class="flex-1 space-y-1">
                        <h5 class="font-bold text-amber-900 dark:text-amber-200">Gentle Check-In: Stress Notice</h5>
                        <p class="text-amber-800 dark:text-amber-300">Your logs show high strain over the past 3 days. Would you like to take a 2-minute breath break or speak with campus counselor Dr. Sharma?</p>
                        <div class="flex gap-2 pt-1">
                            <button onclick="app.openBoxBreathingModal()" class="px-3 py-1 rounded-lg bg-[#176B50] text-white font-bold text-[11px]">Start Box Breathing</button>
                            <button onclick="app.navTo('counselor')" class="px-3 py-1 rounded-lg border border-amber-500/40 text-amber-800 dark:text-amber-200 font-bold text-[11px]">Counselor Support</button>
                        </div>
                    </div>
                </div>
            `;
        } else if (lowMoodCount >= 3) {
            banner.classList.remove('hidden');
            banner.innerHTML = `
                <div class="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-start gap-3 text-xs">
                    <i class="fa-solid fa-hand-holding-heart text-indigo-400 text-lg mt-0.5"></i>
                    <div class="flex-1 space-y-1">
                        <h5 class="font-bold text-indigo-900 dark:text-indigo-200">You don't have to carry this alone</h5>
                        <p class="text-indigo-800 dark:text-indigo-300">It's completely okay not to feel okay. Confidential support via Tele-MANAS (14416) or campus counseling is always judgment-free and 100% private.</p>
                        <div class="flex gap-2 pt-1">
                            <a href="tel:14416" class="px-3 py-1 rounded-lg bg-indigo-600 text-white font-bold text-[11px]"><i class="fa-solid fa-phone mr-1"></i> Call Tele-MANAS (14416)</a>
                            <button onclick="app.openGroundingModal()" class="px-3 py-1 rounded-lg border border-indigo-500/40 text-indigo-800 dark:text-indigo-200 font-bold text-[11px]">5-4-3-2-1 Grounding</button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            banner.classList.add('hidden');
        }
    }

    openBoxBreathingModal() {
        const modal = document.getElementById('boxBreathingModal');
        modal.classList.remove('hidden');

        // Start 4-4-4-4 cycle sequence
        const promptText = document.getElementById('breathingStepText');
        const timerText = document.getElementById('breathingTimerText');

        let step = 0;
        const steps = [
            { text: 'Inhale gently through nose...', seconds: 4 },
            { text: 'Hold your breath gently...', seconds: 4 },
            { text: 'Exhale slowly through mouth...', seconds: 4 },
            { text: 'Rest and hold empty...', seconds: 4 }
        ];

        let count = 4;
        if (this.breathingInterval) clearInterval(this.breathingInterval);

        const updateTick = () => {
            promptText.textContent = steps[step].text;
            timerText.textContent = `${count}s`;
            count--;
            if (count < 0) {
                step = (step + 1) % steps.length;
                count = steps[step].seconds;
            }
        };

        updateTick();
        this.breathingInterval = setInterval(updateTick, 1000);
    }

    closeBoxBreathingModal() {
        if (this.breathingInterval) clearInterval(this.breathingInterval);
        document.getElementById('boxBreathingModal')?.classList.add('hidden');
    }

    openGroundingModal() {
        document.getElementById('groundingModal')?.classList.remove('hidden');
    }

    closeGroundingModal() {
        document.getElementById('groundingModal')?.classList.add('hidden');
    }

    // -----------------------------------------------------------------
    // Privacy Vault & Security Center
    // -----------------------------------------------------------------
    async renderVaultStats() {
        const checkins = await this.db.getAllCheckIns();
        const journals = await this.db.getAllJournals();
        const pinHash = await this.db.getMeta('pin_hash');

        const pinStatusEl = document.getElementById('vaultPinStatusText');
        if (pinStatusEl) {
            pinStatusEl.innerHTML = pinHash
                ? '<span class="text-emerald-600 font-bold"><i class="fa-solid fa-shield-halved"></i> Active & Encrypted (PBKDF2 + AES-GCM 256)</span>'
                : '<span class="text-amber-600 font-bold"><i class="fa-solid fa-triangle-exclamation"></i> Not Set (Guest Local Mode)</span>';
        }

        const countsEl = document.getElementById('vaultItemCountsText');
        if (countsEl) {
            countsEl.textContent = `${checkins.length} check-in logs, ${journals.length} journal notes stored in on-device IndexedDB.`;
        }

        const autoLockSelect = document.getElementById('vaultAutoLockSelect');
        if (autoLockSelect) {
            autoLockSelect.value = String(this.autoLockMinutes);
        }
    }

    async updateAutoLockSetting(val) {
        this.autoLockMinutes = parseInt(val, 10);
        await this.db.setMeta('auto_lock_minutes', this.autoLockMinutes);
        this.showToast(`Auto-lock set to ${this.autoLockMinutes === 0 ? 'Never' : `${this.autoLockMinutes} minutes`}.`, 'info');
    }

    async emergencyWipeData() {
        const confirmed = confirm('CAUTION: This will permanently wipe all local check-in records, encrypted journals, and your PIN from this device. There is no cloud copy.\n\nAre you absolutely sure?');
        if (confirmed) {
            await this.db.clearAllData();
            this.vaultKey = null;
            this.isUnlocked = true;
            this.showToast('All local wellness data purged.', 'info');
            this.navTo('home');
        }
    }

    // -----------------------------------------------------------------
    // Encrypted Backup & Restore (.enc)
    // -----------------------------------------------------------------
    async exportEncryptedBackup() {
        const passphrase = prompt('Enter a secure passphrase to encrypt this backup file:');
        if (!passphrase || passphrase.length < 4) {
            this.showToast('Backup cancelled. A passphrase of at least 4 characters is required.', 'error');
            return;
        }

        const checkins = await this.db.getAllCheckIns();
        const journals = await this.db.getAllJournals();
        const appointments = await this.db.getAllAppointments();

        const payload = JSON.stringify({
            version: '1.0',
            exported_at: new Date().toISOString(),
            checkins,
            journals,
            appointments
        });

        const salt = WellnessCrypto.generateSalt();
        const backupKey = await WellnessCrypto.deriveKey(passphrase, salt);
        const encrypted = await WellnessCrypto.encryptText(payload, backupKey);

        const fileData = JSON.stringify({
            header: 'MANN_CARE_ENCRYPTED_VAULT_BACKUP',
            salt: WellnessCrypto.bufferToBase64(salt),
            iv: encrypted.iv,
            cipherText: encrypted.cipherText
        });

        const blob = new Blob([fileData], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wellness_vault_backup_${new Date().toISOString().split('T')[0]}.enc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast('🔒 Encrypted backup downloaded securely.', 'success');
    }

    async importEncryptedBackup(fileInput) {
        const file = fileInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (parsed.header !== 'MANN_CARE_ENCRYPTED_VAULT_BACKUP') {
                    throw new Error('Invalid file format. Not a recognized MANN Care backup.');
                }

                const passphrase = prompt('Enter the passphrase used when creating this backup:');
                if (!passphrase) return;

                const saltBuffer = WellnessCrypto.base64ToBuffer(parsed.salt);
                const backupKey = await WellnessCrypto.deriveKey(passphrase, saltBuffer);

                const decryptedJSON = await WellnessCrypto.decryptText(parsed.cipherText, parsed.iv, backupKey);
                if (decryptedJSON.startsWith('[Encrypted')) {
                    throw new Error('Incorrect passphrase or corrupted backup.');
                }

                const data = JSON.parse(decryptedJSON);
                const count = (data.checkins || []).length;

                if (confirm(`Backup verified!\nFound ${count} check-ins and ${(data.journals || []).length} journal entries.\n\nRestore this data into your local vault now?`)) {
                    for (const c of (data.checkins || [])) {
                        await this.db.saveCheckIn(c);
                    }
                    for (const j of (data.journals || [])) {
                        await this.db.saveJournal(j);
                    }
                    for (const a of (data.appointments || [])) {
                        await this.db.saveAppointment(a);
                    }
                    this.showToast(`✨ Successfully restored ${count} check-ins.`, 'success');
                    this.refreshHomeView();
                }
            } catch (err) {
                console.error(err);
                this.showToast(`Restore failed: ${err.message}`, 'error');
            }
        };
        reader.readAsText(file);
    }

    // -----------------------------------------------------------------
    // Hackathon Demo Mode Seeder
    // -----------------------------------------------------------------
    async loadDemoSampleData() {
        const confirmed = confirm('Load 10 days of safe sample check-in history to test charts, sleep-stress correlations, and the calendar?\n\n(Existing records will be merged).');
        if (!confirmed) return;

        const today = new Date();
        const sampleEntries = [
            { dayOffset: 9, mood: 'Calm', stress: 3, sleep: 'Good', tags: ['Academics', 'Friendships'], note: 'Spent peaceful evening at hostel terrace reading.' },
            { dayOffset: 8, mood: 'Happy', stress: 2, sleep: 'Excellent', tags: ['Friendships', 'Personal Growth'], note: 'Great conversation with my roommate, felt very supportive.' },
            { dayOffset: 7, mood: 'Stressed', stress: 7, sleep: 'Average', tags: ['Exams', 'Academics'], note: 'Mid-term prep started. Too much syllabus to cover.' },
            { dayOffset: 6, mood: 'Overwhelmed', stress: 8, sleep: 'Poor', tags: ['Exams', 'Roommates'], note: 'Noisy corridor, could not sleep past 2 AM.' },
            { dayOffset: 5, mood: 'Stressed', stress: 8, sleep: 'Poor', tags: ['Exams', 'Financial Concerns'], note: 'Stress peak before the algorithms quiz.' },
            { dayOffset: 4, mood: 'Okay', stress: 5, sleep: 'Average', tags: ['Exams'], note: 'Quiz finished. Relieved that it is over.' },
            { dayOffset: 3, mood: 'Calm', stress: 3, sleep: 'Good', tags: ['Homesickness', 'Family'], note: 'Called mom, felt much more grounded afterwards.' },
            { dayOffset: 2, mood: 'Happy', stress: 2, sleep: 'Good', tags: ['Friendships'], note: 'Mess food was actually delicious tonight, had fun with friends.' },
            { dayOffset: 1, mood: 'Calm', stress: 4, sleep: 'Good', tags: ['Personal Growth', 'Academics'], note: 'Productive study session in the library.' }
        ];

        for (const s of sampleEntries) {
            const d = new Date();
            d.setDate(today.getDate() - s.dayOffset);
            const dStr = d.toISOString().split('T')[0];

            let encryptedNote = null;
            if (this.vaultKey) {
                encryptedNote = await WellnessCrypto.encryptText(s.note, this.vaultKey);
            } else {
                encryptedNote = { plainText: s.note, unencrypted: true };
            }

            await this.db.saveCheckIn({
                date: dStr,
                mood: s.mood,
                stress: s.stress,
                sleep: s.sleep,
                tags: s.tags,
                encrypted_journal: encryptedNote,
                created_at: d.toISOString()
            });

            await this.db.saveJournal({
                date: dStr,
                mood: s.mood,
                tags: s.tags,
                encrypted_payload: encryptedNote,
                created_at: d.toISOString()
            });
        }

        this.showToast('✨ 10-day historical demo data populated into local IndexedDB!', 'success');
        this.navTo('insights');
    }

    // -----------------------------------------------------------------
    // Theme & UI Helpers
    // -----------------------------------------------------------------
    initTheme() {
        const saved = localStorage.getItem('mann_theme');
        if (saved === 'dark') {
            document.documentElement.classList.add('dark');
            document.body.classList.add('dark-theme');
        } else {
            document.documentElement.classList.remove('dark');
            document.body.classList.remove('dark-theme');
        }
    }

    toggleTheme() {
        const isDark = document.documentElement.classList.toggle('dark');
        document.body.classList.toggle('dark-theme', isDark);
        localStorage.setItem('mann_theme', isDark ? 'dark' : 'light');
        this.showToast(isDark ? '🌙 Switched to Calm Dark Theme' : '☀️ Switched to Soft Light Theme', 'info');

        // Re-render charts with updated theme text colors if in insights
        if (this.currentView === 'insights') {
            this.renderInsights();
        }
    }

    renderSettings() {
        const select = document.getElementById('settingsAutoLockSelect');
        if (select) select.value = String(this.autoLockMinutes);
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('wellnessToastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `p-3 rounded-2xl shadow-xl border text-xs font-semibold flex items-center gap-2.5 transition transform duration-300 max-w-sm ${
            type === 'success' ? 'bg-emerald-800 text-white border-emerald-600' :
            type === 'error' ? 'bg-rose-800 text-white border-rose-600' :
            'bg-[#176B50] text-white border-[#208F6C]'
        }`;

        toast.innerHTML = `
            <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info'} text-sm"></i>
            <span>${message}</span>
        `;

        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }
}

// Global Application Instance
const app = new WellnessApp();
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
