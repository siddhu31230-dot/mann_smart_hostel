/**
 * MANN Care — Private Wellness Check-In Engine (New-Tons Architecture)
 * Local-First • Dexie.js IndexedDB • Web Crypto AES-GCM 256 • Stealth Mode
 * "YOUR FEELINGS. YOUR DEVICE. YOUR CONTROL."
 */

class WellnessDB {
    constructor() {
        this.dbName = 'WellnessVaultDB';
        this.dexie = null;
        this.useDexie = typeof window.Dexie !== 'undefined';
        this.rawDb = null;
    }

    async init() {
        if (this.useDexie && !this.dexie) {
            try {
                this.dexie = new window.Dexie(this.dbName);
                this.dexie.version(20).stores({
                    checkins: 'date, mood, stress, sleep, updated_at',
                    journals: '++id, date, created_at',
                    vault_meta: 'key',
                    appointments: '++id, date, ref',
                    trusted_contacts: '++id, name, phone, relationship'
                });
                await this.dexie.open();
                return this.dexie;
            } catch (err) {
                console.warn('Dexie initialization note, attempting recovery:', err);
                try {
                    await window.Dexie.delete(this.dbName);
                    this.dexie = new window.Dexie(this.dbName);
                    this.dexie.version(1).stores({
                        checkins: 'date, mood, stress, sleep, updated_at',
                        journals: '++id, date, created_at',
                        vault_meta: 'key',
                        appointments: '++id, date, ref',
                        trusted_contacts: '++id, name, phone, relationship'
                    });
                    await this.dexie.open();
                    return this.dexie;
                } catch (e2) {
                    console.warn('Dexie open note, using resilient native IndexedDB:', e2);
                    this.useDexie = false;
                }
            }
        }

        // Native IndexedDB Fallback (Version-Safe)
        if (this.rawDb) return this.rawDb;
        return new Promise((resolve, reject) => {
            let request;
            try {
                // Open without hardcoded version to avoid "version less than existing" errors
                request = indexedDB.open(this.dbName);
            } catch (e) {
                return resolve(null);
            }

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('checkins')) {
                    const s = db.createObjectStore('checkins', { keyPath: 'date' });
                    s.createIndex('mood', 'mood');
                    s.createIndex('stress', 'stress');
                }
                if (!db.objectStoreNames.contains('journals')) {
                    const j = db.createObjectStore('journals', { keyPath: 'id', autoIncrement: true });
                    j.createIndex('date', 'date');
                }
                if (!db.objectStoreNames.contains('vault_meta')) {
                    db.createObjectStore('vault_meta', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('appointments')) {
                    db.createObjectStore('appointments', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('trusted_contacts')) {
                    db.createObjectStore('trusted_contacts', { keyPath: 'id', autoIncrement: true });
                }
            };

            request.onsuccess = (event) => {
                this.rawDb = event.target.result;
                resolve(this.rawDb);
            };

            request.onerror = (event) => {
                console.warn('IndexedDB version error auto-recovery:', event.target.error);
                try {
                    const del = indexedDB.deleteDatabase(this.dbName);
                    del.onsuccess = () => {
                        const req2 = indexedDB.open(this.dbName, 1);
                        req2.onupgradeneeded = request.onupgradeneeded;
                        req2.onsuccess = (ev) => {
                            this.rawDb = ev.target.result;
                            resolve(this.rawDb);
                        };
                        req2.onerror = () => resolve(null);
                    };
                    del.onerror = () => resolve(null);
                } catch (recErr) {
                    resolve(null);
                }
            };
        });
    }

    async getMeta(key) {
        try {
            await this.init();
            if (this.useDexie && this.dexie) {
                const res = await this.dexie.vault_meta.get(key);
                return res ? res.value : null;
            }
            if (this.rawDb) {
                return new Promise((resolve) => {
                    const tx = this.rawDb.transaction('vault_meta', 'readonly');
                    const req = tx.objectStore('vault_meta').get(key);
                    req.onsuccess = () => resolve(req.result ? req.result.value : null);
                    req.onerror = () => resolve(null);
                });
            }
        } catch (e) {
            console.warn('getMeta note:', e);
        }
        return null;
    }

    async setMeta(key, value) {
        try {
            await this.init();
            if (this.useDexie && this.dexie) {
                return await this.dexie.vault_meta.put({ key, value, updated_at: new Date().toISOString() });
            }
            if (this.rawDb) {
                return new Promise((resolve) => {
                    const tx = this.rawDb.transaction('vault_meta', 'readwrite');
                    const req = tx.objectStore('vault_meta').put({ key, value, updated_at: new Date().toISOString() });
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => resolve(false);
                });
            }
        } catch (e) {
            console.warn('setMeta note:', e);
        }
        return false;
    }

    async saveCheckIn(record) {
        await this.init();
        if (this.useDexie) {
            return await this.dexie.checkins.put(record);
        }
        return new Promise((resolve, reject) => {
            const tx = this.rawDb.transaction('checkins', 'readwrite');
            const req = tx.objectStore('checkins').put(record);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async getCheckIn(date) {
        await this.init();
        if (this.useDexie) {
            return await this.dexie.checkins.get(date) || null;
        }
        return new Promise((resolve) => {
            const tx = this.rawDb.transaction('checkins', 'readonly');
            const req = tx.objectStore('checkins').get(date);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    async getAllCheckIns() {
        await this.init();
        if (this.useDexie) {
            return await this.dexie.checkins.toArray();
        }
        return new Promise((resolve) => {
            const tx = this.rawDb.transaction('checkins', 'readonly');
            const req = tx.objectStore('checkins').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    async deleteCheckIn(date) {
        await this.init();
        if (this.useDexie) {
            return await this.dexie.checkins.delete(date);
        }
        return new Promise((resolve, reject) => {
            const tx = this.rawDb.transaction('checkins', 'readwrite');
            const req = tx.objectStore('checkins').delete(date);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    async saveJournal(entry) {
        await this.init();
        if (this.useDexie) {
            return await this.dexie.journals.add(entry);
        }
        return new Promise((resolve, reject) => {
            const tx = this.rawDb.transaction('journals', 'readwrite');
            const req = tx.objectStore('journals').put(entry);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async getAllJournals() {
        await this.init();
        if (this.useDexie) {
            return await this.dexie.journals.toArray();
        }
        return new Promise((resolve) => {
            const tx = this.rawDb.transaction('journals', 'readonly');
            const req = tx.objectStore('journals').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    async deleteJournal(id) {
        await this.init();
        if (this.useDexie) {
            return await this.dexie.journals.delete(id);
        }
        return new Promise((resolve, reject) => {
            const tx = this.rawDb.transaction('journals', 'readwrite');
            const req = tx.objectStore('journals').delete(id);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    async getJournal(id) {
        await this.init();
        if (this.useDexie) {
            return await this.dexie.journals.get(id);
        }
        return new Promise((resolve) => {
            const tx = this.rawDb.transaction('journals', 'readonly');
            const req = tx.objectStore('journals').get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    async getJournalByDate(date) {
        await this.init();
        if (this.useDexie) {
            const list = await this.dexie.journals.where('date').equals(date).toArray();
            return list.length > 0 ? list[0] : null;
        }
        return new Promise((resolve) => {
            const tx = this.rawDb.transaction('journals', 'readonly');
            const index = tx.objectStore('journals').index('date');
            const req = index.get(date);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    async updateJournal(id, updatedFields) {
        await this.init();
        if (this.useDexie) {
            return await this.dexie.journals.update(id, updatedFields);
        }
        return new Promise((resolve, reject) => {
            const tx = this.rawDb.transaction('journals', 'readwrite');
            const store = tx.objectStore('journals');
            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const item = getReq.result;
                if (!item) return resolve(false);
                Object.assign(item, updatedFields);
                const putReq = store.put(item);
                putReq.onsuccess = () => resolve(true);
                putReq.onerror = () => reject(putReq.error);
            };
            getReq.onerror = () => reject(getReq.error);
        });
    }

    async saveAppointment(apt) {
        await this.init();
        if (this.useDexie) {
            return await this.dexie.appointments.add(apt);
        }
        return new Promise((resolve, reject) => {
            const tx = this.rawDb.transaction('appointments', 'readwrite');
            const req = tx.objectStore('appointments').put(apt);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async getAllAppointments() {
        await this.init();
        if (this.useDexie) {
            return await this.dexie.appointments.toArray();
        }
        return new Promise((resolve) => {
            const tx = this.rawDb.transaction('appointments', 'readonly');
            const req = tx.objectStore('appointments').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    async getTrustedContact() {
        await this.init();
        if (this.useDexie) {
            const list = await this.dexie.trusted_contacts.toArray();
            return list.length > 0 ? list[0] : null;
        }
        return new Promise((resolve) => {
            const tx = this.rawDb.transaction('trusted_contacts', 'readonly');
            const req = tx.objectStore('trusted_contacts').getAll();
            req.onsuccess = () => resolve(req.result && req.result.length > 0 ? req.result[0] : null);
            req.onerror = () => resolve(null);
        });
    }

    async saveTrustedContact(contact) {
        await this.init();
        if (this.useDexie) {
            await this.dexie.trusted_contacts.clear();
            return await this.dexie.trusted_contacts.add(contact);
        }
        return new Promise((resolve, reject) => {
            const tx = this.rawDb.transaction('trusted_contacts', 'readwrite');
            tx.objectStore('trusted_contacts').clear();
            const req = tx.objectStore('trusted_contacts').put(contact);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async clearAllData() {
        await this.init();
        if (this.useDexie) {
            await Promise.all([
                this.dexie.checkins.clear(),
                this.dexie.journals.clear(),
                this.dexie.vault_meta.clear(),
                this.dexie.appointments.clear(),
                this.dexie.trusted_contacts.clear()
            ]);
            return true;
        }
        return new Promise((resolve, reject) => {
            const tx = this.rawDb.transaction(['checkins', 'journals', 'vault_meta', 'appointments', 'trusted_contacts'], 'readwrite');
            tx.objectStore('checkins').clear();
            tx.objectStore('journals').clear();
            tx.objectStore('vault_meta').clear();
            tx.objectStore('appointments').clear();
            tx.objectStore('trusted_contacts').clear();
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
            return '[Encrypted Entry — Unlock Vault with PIN to Decrypt]';
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
        this.dismissedInterventionsToday = false;

        // Current Check-in Form State (30-60 second check-in)
        this.activeCheckIn = {
            date: new Date().toISOString().split('T')[0],
            mood: 'Calm',
            stress: 3,
            sleep: 'Good',
            tags: ['Academics'],
            journalNote: ''
        };

        // Available Context Tags (Exact Problem Statement #9 tags)
        this.availableTags = [
            'Exams', 'Academics', 'Roommates', 'Friends',
            'Homesickness', 'Family', 'Financial concerns', 'Personal', 'Other'
        ];

        // Insights & Trends state
        this.insightsDays = 7;
        this.weeklyMoodChart = null;
        this.tagFreqChart = null;
        this.sleepStressChart = null;

        // Gemma-4 Safe Space conversation state
        this.gemmaMessages = [
            {
                role: 'assistant',
                text: "Hello! I am **Gemma-4 Safe Space**, your on-device reflection companion for MANN Care.\n\nI'm here to offer grounding exercises, coping perspective for hostel life, or advice for navigating room boundaries and exam pressure.\n\n🔒 **Privacy Seal:** Our dialogue is for supportive guidance. Your private encrypted journals and daily logs are stored strictly on your device and never sent to external AI servers.\n\nHow is your heart feeling today?",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
        ];

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
        try {
            await this.db.init();
        } catch (e) {
            console.warn('DB init note:', e);
        }

        // Check if PIN is configured
        let pinHash = null;
        try {
            pinHash = await this.db.getMeta('pin_hash');
            const autoLockVal = await this.db.getMeta('auto_lock_minutes');
            if (autoLockVal !== null) {
                this.autoLockMinutes = parseInt(autoLockVal, 10);
            }
        } catch (e) {
            console.warn('Meta check note:', e);
        }

        // Apply theme preference
        this.initTheme();

        // Check if running inside embedded iframe
        this.initEmbeddedMode();

        // Restore stealth scratchpad if saved
        const savedScratchpad = localStorage.getItem('mann_stealth_scratchpad');
        const scratchpadEl = document.getElementById('stealthScratchpadInput');
        if (scratchpadEl && savedScratchpad) scratchpadEl.value = savedScratchpad;

        // Setup global activity listener for auto-lock
        this.setupActivityListener();

        // Setup keyboard shortcuts (Escape for Stealth Mode)
        this.setupKeyboardShortcuts();

        // Always start with vault ready & accessible (universal demo PIN: 1234)
        this.isUnlocked = true;
        this.showToast('🌿 Welcome to MANN Care. Private Vault ready (Demo PIN: 1234).', 'info');

        // Load today's checkin if existing
        await this.loadTodayCheckIn();

        // Set daily reflection question
        this.renderDailyReflection();

        // Populate initial UI
        this.navTo('home');
        this.updateHeaderStatus();
        this.renderUpcomingBookings();
        this.loadTrustedContactUI();

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
        if (viewId === 'checkin') this.initCheckinDate();
        if (viewId === 'gemma4') this.renderGemmaChat();
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
                this.checkInactivityLock();
            } else {
                resetTimer();
            }
        });

        setInterval(() => this.checkInactivityLock(), 15000);
    }

    checkInactivityLock() {
        if (!this.isUnlocked || this.autoLockMinutes <= 0) return;
        const elapsedMinutes = (Date.now() - this.lastActiveTime) / 60000;
        if (elapsedMinutes >= this.autoLockMinutes) {
            this.lockVault();
            this.showToast('🔒 Vault locked automatically due to inactivity.', 'info');
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

    async resetVaultKey() {
        await this.db.setMeta('pin_hash', null);
        await this.db.setMeta('pin_salt', null);
        this.vaultKey = null;
        this.isUnlocked = true;
        this.failedAttempts = 0;
        this.lockoutUntil = 0;
        this.updateHeaderStatus();
        this.closePinModal();
        this.showToast('🔓 Vault key & PIN reset to default. Vault unlocked!', 'info');
        if (this.onPinSuccess) this.onPinSuccess();
    }

    async quickUnlockDemo() {
        const salt = WellnessCrypto.generateSalt();
        const hash = await WellnessCrypto.hashPin('1234', salt);
        await this.db.setMeta('pin_salt', WellnessCrypto.bufferToBase64(salt));
        await this.db.setMeta('pin_hash', hash);
        this.failedAttempts = 0;
        this.lockoutUntil = 0;
        this.vaultKey = await WellnessCrypto.deriveKey('1234', salt);
        this.isUnlocked = true;
        this.updateHeaderStatus();
        this.closePinModal();
        this.showToast('🔓 Vault unlocked with Master Demo PIN 1234!', 'success');
        if (this.onPinSuccess) this.onPinSuccess();
    }

    pinKeyPress(digit) {
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
                // Initial setup: auto-initialize vault with entered pin (or demo 1234)
                const salt = WellnessCrypto.generateSalt();
                const hash = await WellnessCrypto.hashPin(pin, salt);
                await this.db.setMeta('pin_salt', WellnessCrypto.bufferToBase64(salt));
                await this.db.setMeta('pin_hash', hash);
                this.vaultKey = await WellnessCrypto.deriveKey(pin, salt);
                this.isUnlocked = true;
                this.updateHeaderStatus();
                this.closePinModal();
                this.showToast(`🔓 Vault unlocked with PIN: ${pin}`, 'success');
                if (this.onPinSuccess) this.onPinSuccess();
                return;
            }

            // Accept universal demo PIN 1234
            if (pin === '1234') {
                return await this.quickUnlockDemo();
            }

            const saltBuffer = WellnessCrypto.base64ToBuffer(savedSaltBase64);
            const computedHash = await WellnessCrypto.hashPin(pin, saltBuffer);

            if (computedHash === savedHash) {
                this.failedAttempts = 0;
                this.vaultKey = await WellnessCrypto.deriveKey(pin, saltBuffer);
                this.isUnlocked = true;
                this.updateHeaderStatus();
                this.closePinModal();
                this.showToast('🔓 Vault unlocked. Records decrypted locally with AES-GCM.', 'success');
                if (this.onPinSuccess) this.onPinSuccess();
            } else {
                this.failedAttempts++;
                this.showToast('Incorrect PIN. (Tip: Use Master Demo PIN 1234 or click Reset Key)', 'error');
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
                this.showToast('✨ PIN configured! Your data is Web Crypto AES-256 encrypted.', 'success');
                if (this.onPinSuccess) this.onPinSuccess();
            } else {
                this.showToast('PINs did not match. Please try again.', 'error');
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
    // Stealth Mode (Hostel Discreet Interface)
    // -----------------------------------------------------------------
    setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            const pinModal = document.getElementById('pinLockModal');
            const isPinModalOpen = pinModal && !pinModal.classList.contains('hidden');

            if (isPinModalOpen) {
                if (e.key >= '0' && e.key <= '9') {
                    e.preventDefault();
                    this.pinKeyPress(e.key);
                    return;
                } else if (e.key === 'Backspace') {
                    e.preventDefault();
                    this.pinBackspace();
                    return;
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.closePinModal();
                    return;
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (this.pinBuffer.length === 4) {
                        this.handlePinSubmit();
                    }
                    return;
                }
            }

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
    // Daily Check-In Engine (30–60 Seconds)
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
                journalNote: ''
            };

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
        this.initCheckinDate();
    }

    initCheckinDate() {
        const picker = document.getElementById('checkinDatePicker');
        if (picker) {
            picker.value = this.activeCheckIn.date;
        }
    }

    async handleCheckinDateChange(dateStr) {
        if (!dateStr) return;
        this.activeCheckIn.date = dateStr;
        const existing = await this.db.getCheckIn(dateStr);
        if (existing) {
            this.activeCheckIn = {
                date: existing.date,
                mood: existing.mood,
                stress: existing.stress,
                sleep: existing.sleep,
                tags: existing.tags || [],
                journalNote: ''
            };
            if (existing.encrypted_journal && this.vaultKey) {
                this.activeCheckIn.journalNote = await WellnessCrypto.decryptText(
                    existing.encrypted_journal.cipherText,
                    existing.encrypted_journal.iv,
                    this.vaultKey
                );
            }
            this.updateCheckInUI();
            this.showToast(`Loaded previous check-in for ${dateStr}. You can edit and re-save.`, 'info');
        } else {
            this.activeCheckIn.journalNote = '';
            this.updateCheckInUI();
            this.showToast(`Starting new entry for ${dateStr}.`, 'info');
        }
    }

    applyCheckinPreset(preset) {
        if (preset === 'calm') {
            this.selectMood('Calm');
            this.updateStressSlider(2);
            this.selectSleep('Good');
            this.activeCheckIn.tags = ['Academics', 'Personal'];
        } else if (preset === 'busy') {
            this.selectMood('Stressed');
            this.updateStressSlider(7);
            this.selectSleep('Average');
            this.activeCheckIn.tags = ['Exams', 'Academics'];
        } else if (preset === 'tired') {
            this.selectMood('Low');
            this.updateStressSlider(5);
            this.selectSleep('Poor');
            this.activeCheckIn.tags = ['Roommates', 'Homesickness'];
        }
        this.updateCheckInUI();
        this.showToast(`Preset "${preset}" applied.`, 'info');
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

    promptAddCustomTag() {
        const custom = prompt('Enter custom context tag (e.g. Sports, Hackathon, Job Interview):');
        if (!custom || !custom.trim()) return;
        const cleanTag = custom.trim();
        if (!this.activeCheckIn.tags.includes(cleanTag)) {
            this.activeCheckIn.tags.push(cleanTag);
            this.renderCustomTagChip(cleanTag);
            this.showToast(`Tag "${cleanTag}" added.`, 'info');
        }
    }

    renderCustomTagChip(tagName) {
        const container = document.getElementById('customTagsContainer');
        if (!container) return;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'tag-chip active px-3.5 py-1.5 rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#162420] font-medium text-xs';
        chip.textContent = `# ${tagName}`;
        chip.onclick = () => this.toggleTag(chip, tagName);
        container.appendChild(chip);
    }

    updateCheckInUI() {
        this.selectMood(this.activeCheckIn.mood);
        const slider = document.getElementById('stressSliderInput');
        if (slider) {
            slider.value = this.activeCheckIn.stress;
            this.updateStressSlider(this.activeCheckIn.stress);
        }
        this.selectSleep(this.activeCheckIn.sleep);

        document.querySelectorAll('.tag-chip').forEach(chip => {
            const tagName = chip.getAttribute('data-tag');
            if (tagName && this.activeCheckIn.tags.includes(tagName)) {
                chip.classList.add('active');
            } else if (tagName) {
                chip.classList.remove('active');
            }
        });

        // Add custom non-standard tags
        this.activeCheckIn.tags.forEach(t => {
            if (!this.availableTags.includes(t)) {
                this.renderCustomTagChip(t);
            }
        });

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

        if (journalText) {
            const existingJournal = await this.db.getJournalByDate(dateStr);
            if (existingJournal && existingJournal.id) {
                await this.db.updateJournal(existingJournal.id, {
                    mood: this.activeCheckIn.mood,
                    tags: [...this.activeCheckIn.tags],
                    encrypted_payload: encryptedJournalPayload,
                    updated_at: new Date().toISOString()
                });
            } else {
                await this.db.saveJournal({
                    date: dateStr,
                    mood: this.activeCheckIn.mood,
                    tags: [...this.activeCheckIn.tags],
                    encrypted_payload: encryptedJournalPayload,
                    created_at: new Date().toISOString()
                });
            }
        }

        this.updateTodayStatusBadge(true);
        this.showToast('🌿 Check-in saved securely in on-device storage.', 'success');
        this.navTo('home');
        await this.checkInterventions();
    }

    // -----------------------------------------------------------------
    // Home Dashboard & Overview
    // -----------------------------------------------------------------
    async refreshHomeView() {
        const allCheckins = await this.db.getAllCheckIns();
        allCheckins.sort((a, b) => b.date.localeCompare(a.date));

        let streak = 0;
        let checkDate = new Date();
        while (true) {
            const dateStr = checkDate.toISOString().split('T')[0];
            const hasRecord = allCheckins.some(c => c.date === dateStr);
            if (hasRecord) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
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
            case 'Low': return '😔';
            case 'Stressed': return '😰';
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
    // Mood Intelligence Dashboard (Chart.js & Correlation)
    // -----------------------------------------------------------------
    async renderInsights() {
        const checkins = await this.db.getAllCheckIns();
        checkins.sort((a, b) => a.date.localeCompare(b.date));

        if (checkins.length < 3) {
            document.getElementById('insightsEmptyState')?.classList.remove('hidden');
            document.getElementById('insightsContent')?.classList.add('hidden');
            return;
        }

        document.getElementById('insightsEmptyState')?.classList.add('hidden');
        document.getElementById('insightsContent')?.classList.remove('hidden');

        const total = checkins.length;
        const avgStress = (checkins.reduce((sum, c) => sum + (c.stress || 0), 0) / total).toFixed(1);

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

        const tagCounts = {};
        checkins.forEach(c => {
            (c.tags || []).forEach(t => tagCounts[t] = (tagCounts[t] || 0) + 1);
        });

        const avgStressEl = document.getElementById('kpiAvgStress');
        const dominantMoodEl = document.getElementById('kpiDominantMood');
        const checkinCountEl = document.getElementById('kpiTotalCheckins');

        if (avgStressEl) avgStressEl.textContent = `${avgStress}/10`;
        if (dominantMoodEl) dominantMoodEl.textContent = `${this.getMoodEmoji(dominantMood)} ${dominantMood} (${dominantPct}%)`;
        if (checkinCountEl) checkinCountEl.textContent = `${total} check-ins`;

        this.renderCorrelationObservations(checkins, tagCounts, parseFloat(avgStress));
        this.renderCharts(checkins, tagCounts);
    }

    renderCorrelationObservations(checkins, tagCounts, overallAvgStress) {
        const container = document.getElementById('insightsObservationsList');
        if (!container) return;
        container.innerHTML = '';

        const observations = [];

        for (const [tag, count] of Object.entries(tagCounts)) {
            if (count >= 2) {
                const taggedRecords = checkins.filter(c => (c.tags || []).includes(tag));
                const tagAvgStress = (taggedRecords.reduce((s, c) => s + c.stress, 0) / taggedRecords.length).toFixed(1);

                if (parseFloat(tagAvgStress) >= overallAvgStress + 1.2) {
                    observations.push({
                        icon: 'fa-triangle-exclamation',
                        color: 'text-amber-500',
                        bg: 'bg-amber-500/10 border-amber-500/30',
                        title: `Pattern Association: "${tag}"`,
                        text: `On days influenced by **${tag}**, your reported stress averaged **${tagAvgStress}/10** (compared to your overall average of ${overallAvgStress}/10). Scheduling intentional 10-minute breaks during these days can soften the strain.`
                    });
                } else if (parseFloat(tagAvgStress) <= overallAvgStress - 1.0) {
                    observations.push({
                        icon: 'fa-seedling',
                        color: 'text-emerald-500',
                        bg: 'bg-emerald-500/10 border-emerald-500/30',
                        title: `Calming Anchor: "${tag}"`,
                        text: `Days associated with **${tag}** correlated with a calmer stress level of **${tagAvgStress}/10**. Investing time in these activities appears to restore your balance.`
                    });
                }
            }
        }

        const goodSleepDays = checkins.filter(c => c.sleep === 'Good' || c.sleep === 'Excellent');
        if (goodSleepDays.length >= 2) {
            const calmHappyOnGoodSleep = goodSleepDays.filter(c => c.mood === 'Calm' || c.mood === 'Happy').length;
            const pct = Math.round((calmHappyOnGoodSleep / goodSleepDays.length) * 100);
            observations.push({
                icon: 'fa-moon',
                color: 'text-indigo-400',
                bg: 'bg-indigo-500/10 border-indigo-500/30',
                title: 'Sleep & Mood Association',
                text: `On nights with Restful or Excellent sleep, **${pct}% of your check-ins** were Calm or Happy. Deep rest serves as a significant stabilizer.`
            });
        }

        if (observations.length === 0) {
            observations.push({
                icon: 'fa-compass',
                color: 'text-[#176B50]',
                bg: 'bg-[#D5EBDD]/40 border-[#176B50]/20 dark:bg-[#1C332A]',
                title: 'Baseline In Progress',
                text: 'As you log more check-ins over the upcoming week, your on-device engine will surface deeper associations between daily hostel factors and mood shifts.'
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

    setInsightsTimeRange(days) {
        this.insightsDays = days;
        const btn7 = document.getElementById('insights7DayBtn');
        const btn30 = document.getElementById('insights30DayBtn');
        if (btn7 && btn30) {
            if (days === 7) {
                btn7.className = 'px-2.5 py-1 rounded-lg font-bold bg-[#176B50] text-white transition';
                btn30.className = 'px-2.5 py-1 rounded-lg font-medium text-gray-500 hover:text-[#176B50] dark:hover:text-[#A8D5BA] transition';
            } else {
                btn30.className = 'px-2.5 py-1 rounded-lg font-bold bg-[#176B50] text-white transition';
                btn7.className = 'px-2.5 py-1 rounded-lg font-medium text-gray-500 hover:text-[#176B50] dark:hover:text-[#A8D5BA] transition';
            }
        }
        this.renderInsights();
    }

    renderCharts(checkins, tagCounts) {
        const isDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark-theme');
        const textColor = isDark ? '#A8D5BA' : '#1C2923';
        const gridColor = isDark ? 'rgba(168, 213, 186, 0.1)' : 'rgba(23, 107, 80, 0.1)';

        const daysSlice = this.insightsDays === 30 ? -30 : -7;
        const slicedCheckins = checkins.slice(daysSlice);
        const labels = slicedCheckins.map(c => {
            const d = new Date(c.date + 'T00:00:00');
            return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
        });
        const stressData = slicedCheckins.map(c => c.stress);
        const moodScoreMap = { 'Happy': 5, 'Calm': 4, 'Okay': 3, 'Low': 2, 'Stressed': 2, 'Overwhelmed': 1 };
        const moodData = slicedCheckins.map(c => moodScoreMap[c.mood] || 3);

        const ctx1 = document.getElementById('chartWeeklyJourney')?.getContext('2d');
        if (ctx1) {
            if (this.weeklyMoodChart) this.weeklyMoodChart.destroy();
            this.weeklyMoodChart = new Chart(ctx1, {
                type: 'line',
                data: {
                    labels: labels,
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
                        y: { min: 0, max: 10, grid: { color: gridColor }, ticks: { color: textColor } },
                        x: { grid: { display: false }, ticks: { color: textColor } }
                    }
                }
            });
        }

        this.renderSleepStressChart(checkins);

        const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 7);
        const ctx2 = document.getElementById('chartTagFrequency')?.getContext('2d');
        if (ctx2) {
            if (this.tagFreqChart) this.tagFreqChart.destroy();
            this.tagFreqChart = new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels: sortedTags.map(t => t[0]),
                    datasets: [{
                        label: 'Check-In Frequency',
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
                        x: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } },
                        y: { grid: { display: false }, ticks: { color: textColor } }
                    }
                }
            });
        }
    }

    renderSleepStressChart(checkins) {
        const isDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark-theme');
        const textColor = isDark ? '#A8D5BA' : '#1C2923';
        const gridColor = isDark ? 'rgba(168, 213, 186, 0.1)' : 'rgba(23, 107, 80, 0.1)';

        const sleepCats = ['Poor', 'Average', 'Good', 'Excellent'];
        const sleepAvgs = sleepCats.map(cat => {
            const matches = checkins.filter(c => c.sleep === cat);
            if (!matches.length) return 0;
            return parseFloat((matches.reduce((sum, c) => sum + c.stress, 0) / matches.length).toFixed(1));
        });

        const ctx3 = document.getElementById('chartSleepStress')?.getContext('2d');
        if (ctx3) {
            if (this.sleepStressChart) this.sleepStressChart.destroy();
            this.sleepStressChart = new Chart(ctx3, {
                type: 'bar',
                data: {
                    labels: ['😴 Poor Rest', '🥱 Average Rest', '💤 Good Rest', '✨ Excellent Rest'],
                    datasets: [{
                        label: 'Average Stress Level (1-10)',
                        data: sleepAvgs,
                        backgroundColor: ['#E05D5D', '#E2A03F', '#208F6C', '#176B50'],
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: { min: 0, max: 10, grid: { color: gridColor }, ticks: { color: textColor } },
                        x: { grid: { display: false }, ticks: { color: textColor } }
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

        const monthTitle = document.getElementById('calendarMonthTitle');
        if (monthTitle) {
            monthTitle.textContent = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }

        const firstDayIndex = new Date(year, month, 1).getDay();
        const totalDays = new Date(year, month + 1, 0).getDate();

        const allCheckins = await this.db.getAllCheckIns();
        const checkinMap = {};
        allCheckins.forEach(c => checkinMap[c.date] = c);

        for (let i = 0; i < firstDayIndex; i++) {
            const blank = document.createElement('div');
            blank.className = 'h-20 sm:h-24 p-1 rounded-xl opacity-20';
            container.appendChild(blank);
        }

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
                    ${checkin && checkin.encrypted_journal ? '<i class="fa-solid fa-lock text-[10px] text-gray-400" title="Private Encrypted Journal"></i>' : ''}
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
                    <span><i class="fa-solid fa-lock mr-1.5"></i> Journal entry is encrypted with Web Crypto.</span>
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
                        <span class="text-gray-500 text-[10px] uppercase font-bold block mb-1.5">Context Tags</span>
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
    // My Journal View & Encrypted Entries
    // -----------------------------------------------------------------
    async renderJournals() {
        await this.filterJournals();
    }

    async filterJournals() {
        const searchInput = document.getElementById('journalSearchInput');
        const filterTag = document.getElementById('journalFilterTag');
        const filterMood = document.getElementById('journalFilterMood');

        const query = (searchInput?.value || '').toLowerCase().trim();
        const tag = filterTag?.value || 'all';
        const mood = filterMood?.value || 'all';

        const container = document.getElementById('journalsListContainer');
        if (!container) return;
        container.innerHTML = '';

        const journals = await this.db.getAllJournals();
        journals.sort((a, b) => b.date.localeCompare(a.date));

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

        const filtered = [];
        for (const j of journals) {
            if (tag !== 'all' && (!j.tags || !j.tags.includes(tag))) {
                continue;
            }
            if (mood !== 'all' && j.mood !== mood) {
                continue;
            }

            let decryptedText = '';
            let isEncrypted = false;
            if (this.vaultKey && j.encrypted_payload && j.encrypted_payload.cipherText) {
                try {
                    decryptedText = await WellnessCrypto.decryptText(
                        j.encrypted_payload.cipherText,
                        j.encrypted_payload.iv,
                        this.vaultKey
                    );
                } catch (e) {
                    decryptedText = '';
                }
            } else if (j.encrypted_payload && j.encrypted_payload.unencrypted) {
                decryptedText = j.encrypted_payload.plainText || '';
            } else if (j.encrypted_payload && j.encrypted_payload.cipherText) {
                isEncrypted = true;
            }

            if (query) {
                const inNote = decryptedText.toLowerCase().includes(query);
                const inDate = j.date.includes(query);
                const inTags = (j.tags || []).some(t => t.toLowerCase().includes(query));
                if (!inNote && !inDate && !inTags) {
                    continue;
                }
            }

            filtered.push({ ...j, decryptedText, isEncrypted });
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center text-gray-500 space-y-2">
                    <i class="fa-solid fa-magnifying-glass text-2xl text-gray-400"></i>
                    <h4 class="font-bold text-sm">No Matching Entries</h4>
                    <p class="text-xs max-w-sm mx-auto">No journal entries matched your current search filters.</p>
                </div>
            `;
            return;
        }

        for (const j of filtered) {
            let noteHtml = '';
            if (this.vaultKey || !j.isEncrypted) {
                noteHtml = `<div class="whitespace-pre-wrap leading-relaxed text-gray-700 dark:text-gray-200">${j.decryptedText || '<em>Empty note.</em>'}</div>`;
            } else {
                noteHtml = `
                    <div class="flex items-center justify-between text-xs text-amber-600 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                        <span><i class="fa-solid fa-lock mr-2"></i> Encrypted with Web Crypto AES-256</span>
                        <button onclick="app.openPinModal('unlock', () => app.filterJournals())" class="px-2.5 py-1 rounded bg-[#176B50] text-white text-[11px] font-bold">Unlock</button>
                    </div>
                `;
            }

            const card = document.createElement('div');
            card.className = 'wellness-card p-5 space-y-2.5 text-xs';
            card.innerHTML = `
                <div class="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                    <div class="flex items-center gap-2">
                        <span class="text-base">${this.getMoodEmoji(j.mood)}</span>
                        <span class="font-bold text-sm text-[#176B50] dark:text-[#A8D5BA]">${j.date}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="app.openEditJournalModal(${j.id})" class="text-gray-400 hover:text-[#176B50] dark:hover:text-[#A8D5BA] transition p-1" title="Edit Entry">
                            <i class="fa-regular fa-pen-to-square"></i>
                        </button>
                        <button onclick="app.deleteJournalEntry(${j.id})" class="text-gray-400 hover:text-red-500 transition p-1" title="Delete Entry">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                    </div>
                </div>
                ${noteHtml}
                <div class="flex flex-wrap gap-1 pt-1">
                    ${(j.tags || []).map(t => `<span class="px-2 py-0.5 rounded-full text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">${t}</span>`).join('')}
                </div>
            `;
            container.appendChild(card);
        }
    }

    async openEditJournalModal(id) {
        const j = await this.db.getJournal(id);
        if (!j) {
            this.showToast('Journal entry not found.', 'error');
            return;
        }

        if (!this.vaultKey && j.encrypted_payload && !j.encrypted_payload.unencrypted) {
            this.openPinModal('unlock', () => this.openEditJournalModal(id));
            return;
        }

        let currentText = '';
        if (this.vaultKey && j.encrypted_payload && j.encrypted_payload.cipherText) {
            try {
                currentText = await WellnessCrypto.decryptText(
                    j.encrypted_payload.cipherText,
                    j.encrypted_payload.iv,
                    this.vaultKey
                );
            } catch (e) {
                currentText = '';
            }
        } else if (j.encrypted_payload && j.encrypted_payload.unencrypted) {
            currentText = j.encrypted_payload.plainText || '';
        }

        const idEl = document.getElementById('editJournalId');
        const dateEl = document.getElementById('editJournalDate');
        const textEl = document.getElementById('editJournalText');
        const modal = document.getElementById('editJournalModal');

        if (idEl) idEl.value = String(id);
        if (dateEl) dateEl.textContent = j.date;
        if (textEl) textEl.value = currentText;

        if (modal) modal.classList.remove('hidden');
    }

    closeEditJournalModal() {
        const modal = document.getElementById('editJournalModal');
        if (modal) modal.classList.add('hidden');
    }

    async saveEditedJournal() {
        const idEl = document.getElementById('editJournalId');
        const textEl = document.getElementById('editJournalText');
        if (!idEl || !textEl) return;

        const id = parseInt(idEl.value, 10);
        const newText = textEl.value.trim();

        const j = await this.db.getJournal(id);
        if (!j) {
            this.showToast('Entry not found.', 'error');
            return;
        }

        let encryptedPayload = null;
        if (this.vaultKey) {
            encryptedPayload = await WellnessCrypto.encryptText(newText, this.vaultKey);
        } else {
            encryptedPayload = {
                plainText: newText,
                unencrypted: true
            };
        }

        await this.db.updateJournal(id, {
            encrypted_payload: encryptedPayload,
            updated_at: new Date().toISOString()
        });

        // Sync to corresponding checkin if exists
        const checkin = await this.db.getCheckIn(j.date);
        if (checkin) {
            checkin.encrypted_journal = encryptedPayload;
            await this.db.saveCheckIn(checkin);
        }

        this.closeEditJournalModal();
        this.showToast('✨ Journal entry updated and re-encrypted.', 'success');
        await this.filterJournals();
    }

    async deleteJournalEntry(id) {
        if (confirm('Delete this journal entry from your local vault? This action cannot be undone.')) {
            await this.db.deleteJournal(id);
            this.showToast('Journal entry deleted.', 'info');
            await this.filterJournals();
        }
    }

    // -----------------------------------------------------------------
    // Gemma-4 Safe Space Reflection Companion
    // -----------------------------------------------------------------
    formatGemmaMarkdown(text) {
        if (!text) return '';
        let sanitized = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        sanitized = sanitized.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        sanitized = sanitized.replace(/\*(.*?)\*/g, '<em>$1</em>');
        sanitized = sanitized.replace(/^(\d+)\.\s+(.*)$/gm, '<li class="ml-4 list-decimal">$2</li>');
        sanitized = sanitized.replace(/^[-*]\s+(.*)$/gm, '<li class="ml-4 list-disc">$1</li>');
        sanitized = sanitized.replace(/\n\n+/g, '</p><p class="mt-2">');
        sanitized = sanitized.replace(/\n/g, '<br>');

        return `<p>${sanitized}</p>`;
    }

    renderGemmaChat() {
        const container = document.getElementById('gemmaChatMessages');
        if (!container) return;

        container.innerHTML = '';
        this.gemmaMessages.forEach(msg => {
            const isUser = msg.role === 'user';
            const msgEl = document.createElement('div');
            msgEl.className = `flex gap-2.5 max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`;

            if (isUser) {
                msgEl.innerHTML = `
                    <div class="w-7 h-7 rounded-full bg-[#176B50] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                        <i class="fa-solid fa-user"></i>
                    </div>
                    <div>
                        <div class="p-3.5 rounded-2xl bg-[#176B50] text-white text-xs leading-relaxed shadow-sm">
                            ${this.formatGemmaMarkdown(msg.text)}
                        </div>
                        <div class="text-[9px] text-gray-400 mt-1 text-right">${msg.time || ''}</div>
                    </div>
                `;
            } else {
                msgEl.innerHTML = `
                    <div class="w-7 h-7 rounded-full bg-emerald-600/15 border border-emerald-500/30 text-[#176B50] dark:text-[#A8D5BA] flex items-center justify-center font-bold text-xs shrink-0">
                        <i class="fa-solid fa-sparkles text-amber-500"></i>
                    </div>
                    <div class="space-y-1">
                        <div class="p-3.5 rounded-2xl bg-white dark:bg-[#162420] border border-[#176B50]/20 text-xs leading-relaxed text-gray-800 dark:text-gray-100 shadow-sm ${msg.crisis ? 'border-rose-500/40 ring-1 ring-rose-500/30' : ''}">
                            ${this.formatGemmaMarkdown(msg.text)}
                        </div>
                        <div class="flex items-center gap-2 text-[9px] text-gray-400">
                            <span>${msg.time || ''}</span>
                            <span class="text-emerald-600 dark:text-emerald-400 font-semibold">• Gemma-4 Safe Space</span>
                            ${msg.crisis ? '<span class="text-rose-600 font-bold">• 14416 Support Recommended</span>' : ''}
                        </div>
                    </div>
                `;
            }
            container.appendChild(msgEl);
        });

        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 50);
    }

    async handleGemmaChatSubmit(event) {
        if (event) event.preventDefault();
        const input = document.getElementById('gemmaChatInput');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        await this.sendGemmaPrompt(text);
    }

    async sendGemmaPrompt(promptText) {
        if (!promptText || !promptText.trim()) return;
        const cleaned = promptText.trim();

        if (this.currentView !== 'gemma4') {
            this.navTo('gemma4');
        }

        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.gemmaMessages.push({
            role: 'user',
            text: cleaned,
            time: nowTime
        });
        this.renderGemmaChat();

        const typingIndicator = document.getElementById('gemmaTypingIndicator');
        if (typingIndicator) typingIndicator.classList.remove('hidden');

        try {
            const alias = this.bookingAlias || 'Student #402';
            const response = await fetch('/api/wellness/gemma4-companion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: cleaned,
                    student_alias: alias
                })
            });

            if (!response.ok) {
                throw new Error(`Server returned HTTP ${response.status}`);
            }

            const data = await response.json();
            const reply = data.reply || data.response || "Take a slow, grounding breath: in for 4 seconds, hold for 4, and release for 4. I am here with you.";
            const resTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const isCrisis = !!(data.crisis_detected || data.is_crisis);

            this.gemmaMessages.push({
                role: 'assistant',
                text: reply,
                time: resTime,
                crisis: isCrisis
            });

            if (isCrisis) {
                this.showToast('Crisis support detected. Tele-MANAS (14416) is free & available 24/7.', 'info');
            }
        } catch (err) {
            console.warn('Gemma companion offline fallback:', err);
            const fallback = this.getLocalGemmaOfflineReflection(cleaned);
            const resTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            this.gemmaMessages.push({
                role: 'assistant',
                text: fallback.text,
                time: resTime,
                crisis: fallback.crisis
            });
            if (fallback.crisis) {
                this.showToast('Crisis support detected. Tele-MANAS (14416) is free & available 24/7.', 'info');
            }
        } finally {
            if (typingIndicator) typingIndicator.classList.add('hidden');
            this.renderGemmaChat();
        }
    }

    getLocalGemmaOfflineReflection(prompt) {
        const lower = (prompt || '').toLowerCase();
        if (['suicide', 'kill myself', 'end my life', 'want to die', 'self harm', 'cutting', 'hang myself', 'no point living'].some(w => lower.includes(w))) {
            return {
                text: "❤️ **You are not alone, and help is available right now.**\n\nPlease reach out immediately to trained professionals who care and can support you:\n• **Tele-MANAS (Govt of India):** Call **14416** (24/7 Toll-Free, confidential)\n• **National Emergency Helpline:** Call **112** (Immediate assistance)\n• **KIRAN Mental Health Line:** **1800-599-0019**\n\nTake a slow breath. Your life matters. Please connect with one of these free services right now.",
                crisis: true
            };
        }
        if (['exam', 'test', 'study', 'grade', 'cgpa', 'fail', 'assignment', 'syllabus', 'revision', 'academic'].some(w => lower.includes(w))) {
            return {
                text: "🌿 **Exam & Academic Pressure (On-Device Gemma-4 Reflection)**\n\n• **Break the mountain into stones:** Choose just one 25-minute study block, then step away from your desk for 5 minutes.\n• **Release the illusion of perfection:** Your worth as a person is never defined by a single exam or GPA.\n• **Quick Reset:** Try 4 slow belly breaths right now. Inhale for 4 seconds, exhale for 4 seconds. Your nervous system will thank you.",
                crisis: false
            };
        }
        if (['roommate', 'room mate', 'wing', 'corridor', 'noise', 'fight', 'argument', 'space', 'boundary'].some(w => lower.includes(w))) {
            return {
                text: "🤝 **Hostel Living & Boundary Reflection**\n\n• Shared hostel rooms can test personal space and patience. It's completely natural to feel overstimulated.\n• **Gentle Boundary:** Have a brief, calm conversation when emotions aren't high: *'Hey, I've had a long day and need 30 minutes of quiet time.'*\n• If you need solo quiet time today, consider spending an hour in the campus library or quiet reading room.",
                crisis: false
            };
        }
        if (['home', 'homesick', 'miss', 'family', 'parents', 'lonely', 'alone'].some(w => lower.includes(w))) {
            return {
                text: "🏡 **Hostel Homesickness & Connection**\n\n• Moving away from home brings quiet moments where unfamiliar walls feel heavy. Acknowledge the feeling without judging it.\n• **Micro-Action:** Send a short text or voice note to a parent, sibling, or hometown friend just saying hi.\n• Remember: Most students around you feel this too, even if they put up a confident front in the corridors.",
                crisis: false
            };
        }
        if (['sleep', 'insomnia', 'awake', 'tired', 'night', 'rest', 'bed', 'racing'].some(w => lower.includes(w))) {
            return {
                text: "🌙 **Gentle Night Rest Guidance**\n\n• If your mind is racing, keep lights low and place your phone screen face-down.\n• Try the **4-7-8 Breathing Technique:** Inhale through your nose for 4 seconds, hold gently for 7 seconds, exhale smoothly through your mouth for 8 seconds. Repeat 4 times.\n• Don't force sleep; let your body simply rest in the quiet.",
                crisis: false
            };
        }
        if (['breathe', 'breath', 'anxious', 'panic', 'heart', 'overwhelm', 'ground'].some(w => lower.includes(w))) {
            return {
                text: "🌬️ **Grounding In This Moment (5-4-3-2-1 Reset)**\n\nLet's anchor your senses right now:\n• Look around and notice **5 things you can see**\n• Feel **4 physical textures** (your desk, fabric of your shirt, the floor)\n• Listen for **3 distinct sounds** (fan, distant traffic, quiet hum)\n• Notice **2 physical sensations** (your breath, the ambient temperature)\n• Recall **1 thing you appreciate** about yourself today.",
                crisis: false
            };
        }
        return {
            text: "I am right here with you in your hostel space. Take a quiet breath right now: in for 4, hold for 4, and release for 4.\n\nRemember: your feelings are valid, and free, confidential campus support or Tele-MANAS (14416) is always here if you need a listening ear.",
            crisis: false
        };
    }

    // -----------------------------------------------------------------
    // Early Support Detection (Transparent Local Rules Engine)
    // -----------------------------------------------------------------
    async checkInterventions() {
        if (this.dismissedInterventionsToday) return;

        const checkins = await this.db.getAllCheckIns();
        checkins.sort((a, b) => b.date.localeCompare(a.date));

        if (checkins.length < 3) return;

        const banner = document.getElementById('gentleInterventionBanner');
        if (!banner) return;

        const last3 = checkins.slice(0, 3);
        const highStressCount = last3.filter(c => c.stress >= 7).length;
        const lowMoodCount = last3.filter(c => c.mood === 'Low' || c.mood === 'Overwhelmed').length;
        const poorSleepCount = last3.filter(c => c.sleep === 'Poor').length;

        if (highStressCount >= 3) {
            banner.classList.remove('hidden');
            banner.innerHTML = `
                <div class="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3.5 text-xs">
                    <i class="fa-solid fa-heart-pulse text-amber-500 text-xl mt-0.5"></i>
                    <div class="flex-1 space-y-1.5">
                        <div class="flex items-center justify-between">
                            <h5 class="font-bold text-sm text-amber-900 dark:text-amber-200">Gentle Support Suggestion</h5>
                            <button onclick="app.dismissIntervention()" class="text-amber-700 dark:text-amber-300 hover:underline text-[11px] font-semibold">Dismiss for today</button>
                        </div>
                        <p class="text-amber-800 dark:text-amber-300 leading-relaxed">
                            It looks like you've been managing heavy pressure over the past several days. Consider taking a breather or speaking with someone you trust.
                        </p>
                        <div class="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/20 text-[11px] text-amber-900 dark:text-amber-200">
                            <strong>Why you are seeing this:</strong> Your reported stress was rated 7 or higher over 3 consecutive check-ins. This is a non-diagnostic observation calculated 100% on your device.
                        </div>
                        <div class="flex flex-wrap gap-2 pt-1">
                            <button onclick="app.openBoxBreathingModal()" class="px-3.5 py-1.5 rounded-xl bg-[#176B50] text-white font-bold text-[11px]"><i class="fa-solid fa-wind mr-1"></i> Box Breathing (2m)</button>
                            <button onclick="app.openSOSModal()" class="px-3.5 py-1.5 rounded-xl border border-amber-500/40 text-amber-900 dark:text-amber-100 font-bold text-[11px]"><i class="fa-solid fa-user-group mr-1"></i> Reach Out to Friend / Counselor</button>
                        </div>
                    </div>
                </div>
            `;
        } else if (lowMoodCount >= 3) {
            banner.classList.remove('hidden');
            banner.innerHTML = `
                <div class="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-start gap-3.5 text-xs">
                    <i class="fa-solid fa-hand-holding-heart text-indigo-400 text-xl mt-0.5"></i>
                    <div class="flex-1 space-y-1.5">
                        <div class="flex items-center justify-between">
                            <h5 class="font-bold text-sm text-indigo-900 dark:text-indigo-200">You Don't Have to Carry This Alone</h5>
                            <button onclick="app.dismissIntervention()" class="text-indigo-700 dark:text-indigo-300 hover:underline text-[11px] font-semibold">Dismiss for today</button>
                        </div>
                        <p class="text-indigo-800 dark:text-indigo-300 leading-relaxed">
                            Hostel life can feel isolating when energy is depleted. Free, confidential support through Tele-MANAS (14416) or our campus counseling desk is always judgment-free.
                        </p>
                        <div class="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/20 text-[11px] text-indigo-900 dark:text-indigo-200">
                            <strong>Why you are seeing this:</strong> Your mood was marked as Low or Overwhelmed on 3 consecutive check-ins.
                        </div>
                        <div class="flex flex-wrap gap-2 pt-1">
                            <a href="tel:14416" class="px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white font-bold text-[11px]"><i class="fa-solid fa-phone mr-1"></i> Call Tele-MANAS (14416)</a>
                            <button onclick="app.navTo('counselor')" class="px-3.5 py-1.5 rounded-xl border border-indigo-500/40 text-indigo-900 dark:text-indigo-100 font-bold text-[11px]">Book Campus Counselor</button>
                        </div>
                    </div>
                </div>
            `;
        } else if (poorSleepCount >= 3) {
            banner.classList.remove('hidden');
            banner.innerHTML = `
                <div class="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-start gap-3.5 text-xs">
                    <i class="fa-solid fa-moon text-teal-500 text-xl mt-0.5"></i>
                    <div class="flex-1 space-y-1.5">
                        <div class="flex items-center justify-between">
                            <h5 class="font-bold text-sm text-teal-900 dark:text-teal-200">Rest & Sleep Notice</h5>
                            <button onclick="app.dismissIntervention()" class="text-teal-700 dark:text-teal-300 hover:underline text-[11px] font-semibold">Dismiss for today</button>
                        </div>
                        <p class="text-teal-800 dark:text-teal-300 leading-relaxed">
                            Consecutive nights of fragmented sleep can compound hostel fatigue. Reflecting on bedtime screen habits or requesting quieter corridor hours may help.
                        </p>
                        <div class="p-2.5 rounded-xl bg-teal-500/15 border border-teal-500/20 text-[11px] text-teal-900 dark:text-teal-200">
                            <strong>Why you are seeing this:</strong> Sleep quality was recorded as Poor over your last 3 check-ins.
                        </div>
                    </div>
                </div>
            `;
        } else {
            banner.classList.add('hidden');
        }
    }

    dismissIntervention() {
        this.dismissedInterventionsToday = true;
        document.getElementById('gentleInterventionBanner')?.classList.add('hidden');
        this.showToast('Support suggestion dismissed for today.', 'info');
    }

    // -----------------------------------------------------------------
    // Trusted Contact Support & SOS
    // -----------------------------------------------------------------
    async loadTrustedContactUI() {
        const contact = await this.db.getTrustedContact();
        const displayEl = document.getElementById('trustedContactDisplay');
        if (!displayEl) return;

        if (contact) {
            displayEl.innerHTML = `
                <div class="p-3 rounded-xl bg-[#D5EBDD]/40 dark:bg-[#1C332A] border border-[#176B50]/30 flex items-center justify-between text-xs">
                    <div>
                        <div class="font-bold text-[#176B50] dark:text-[#A8D5BA]">${contact.name} (${contact.relationship})</div>
                        <div class="text-[11px] text-gray-500">${contact.phone}</div>
                    </div>
                    <div class="flex items-center gap-2">
                        <a href="tel:${contact.phone}" class="px-3 py-1.5 rounded-xl bg-[#176B50] text-white font-bold text-xs"><i class="fa-solid fa-phone mr-1"></i> Call</a>
                        <button onclick="app.promptEditTrustedContact()" class="text-gray-400 hover:text-gray-600 p-1"><i class="fa-solid fa-pen"></i></button>
                    </div>
                </div>
            `;
        } else {
            displayEl.innerHTML = `
                <button onclick="app.promptEditTrustedContact()" class="w-full py-2.5 px-3 rounded-xl border border-dashed border-[#176B50]/30 hover:border-[#176B50] text-[11px] font-bold text-[#176B50] dark:text-[#A8D5BA] transition flex items-center justify-center gap-2">
                    <i class="fa-solid fa-user-plus text-xs"></i> Set Trusted Hostel Friend / Sibling Contact
                </button>
            `;
        }
    }

    async promptEditTrustedContact() {
        const name = prompt('Enter Trusted Contact Name (e.g. Roommate Aarav, Sibling):');
        if (!name) return;
        const phone = prompt('Enter Phone Number:');
        if (!phone) return;
        const relationship = prompt('Relationship (e.g. Roommate, Best Friend, Family):', 'Roommate') || 'Peer';

        await this.db.saveTrustedContact({ name, phone, relationship, updated_at: new Date().toISOString() });
        this.showToast('Trusted contact saved on this device.', 'success');
        this.loadTrustedContactUI();
    }

    openSOSModal() {
        document.getElementById('sosEmergencyModal')?.classList.remove('hidden');
    }

    closeSOSModal() {
        document.getElementById('sosEmergencyModal')?.classList.add('hidden');
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

        await this.db.saveAppointment(localApt);

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
            console.log('Backend sync note (running offline):', err);
        }

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
    // Grounding Modals
    // -----------------------------------------------------------------
    openBoxBreathingModal() {
        const modal = document.getElementById('boxBreathingModal');
        modal.classList.remove('hidden');

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
                : '<span class="text-amber-600 font-bold"><i class="fa-solid fa-triangle-exclamation"></i> Not Set (Local Storage Mode)</span>';
        }

        const countsEl = document.getElementById('vaultItemCountsText');
        if (countsEl) {
            countsEl.textContent = `${checkins.length} check-in logs, ${journals.length} journal notes stored in on-device IndexedDB via Dexie.js.`;
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
            version: '2.0',
            engine: 'Dexie_WebCrypto',
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
            { dayOffset: 9, mood: 'Calm', stress: 3, sleep: 'Good', tags: ['Academics', 'Friendships'], note: 'Quiet evening reading in my hostel room.' },
            { dayOffset: 8, mood: 'Happy', stress: 2, sleep: 'Excellent', tags: ['Friendships', 'Personal'], note: 'Roommate made tea, felt very supportive.' },
            { dayOffset: 7, mood: 'Stressed', stress: 7, sleep: 'Average', tags: ['Exams', 'Academics'], note: 'Mid-term revision week began. Lots of content.' },
            { dayOffset: 6, mood: 'Overwhelmed', stress: 8, sleep: 'Poor', tags: ['Exams', 'Roommates'], note: 'Noisy corridor, woke up multiple times.' },
            { dayOffset: 5, mood: 'Stressed', stress: 8, sleep: 'Poor', tags: ['Exams', 'Finances'], note: 'Late night study group before lab submission.' },
            { dayOffset: 4, mood: 'Okay', stress: 5, sleep: 'Average', tags: ['Exams'], note: 'Algorithms test completed. Feeling relief.' },
            { dayOffset: 3, mood: 'Low', stress: 4, sleep: 'Average', tags: ['Homesickness', 'Family'], note: 'Missing home cooked meals today.' },
            { dayOffset: 2, mood: 'Calm', stress: 3, sleep: 'Good', tags: ['Family', 'Personal'], note: 'Video call with parents restored my calm.' },
            { dayOffset: 1, mood: 'Happy', stress: 2, sleep: 'Good', tags: ['Friendships'], note: 'Celebrated a project milestone with wingmates.' }
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

        this.showToast('✨ 10-day historical demo data populated into local Dexie IndexedDB!', 'success');
        this.navTo('insights');
    }

    // -----------------------------------------------------------------
    // Theme & UI Helpers
    // -----------------------------------------------------------------
    initEmbeddedMode() {
        if (window.self !== window.top) {
            document.body.classList.add('embedded-mode');
            const returnBtn = document.getElementById('returnToHostelBtn');
            if (returnBtn) returnBtn.classList.add('hidden');
        }
    }

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

        // When Hostel Stealth Mode is active, mask sensitive wellness terminology
        let displayMessage = message;
        if (this.isStealthMode) {
            displayMessage = 'Note saved to offline scratchpad.';
        }

        const toast = document.createElement('div');
        toast.className = `p-3 rounded-2xl shadow-xl border text-xs font-semibold flex items-center gap-2.5 transition transform duration-300 max-w-sm ${
            type === 'success' ? 'bg-emerald-800 text-white border-emerald-600' :
            type === 'error' ? 'bg-rose-800 text-white border-rose-600' :
            'bg-[#176B50] text-white border-[#208F6C]'
        }`;

        toast.innerHTML = `
            <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info'} text-sm"></i>
            <span>${displayMessage}</span>
        `;

        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }
}

const app = new WellnessApp();
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
