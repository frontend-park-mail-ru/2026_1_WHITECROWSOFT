class Database {
    constructor () {
        this.db = null;
        this.DB_NAME = 'Noterian';
        this.DB_VERSION = 3;
    }

    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('notes')) {
                    const notes = db.createObjectStore('notes', { keyPath: 'ID' });
                    notes.createIndex('updatedAt', 'updatedAt', { unique: false });
                    console.log('[DB] Created notes store');
                }
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                    console.log('[DB] Created settings store');
                }
                if (!db.objectStoreNames.contains('requestQueue')) {
                    const queue = db.createObjectStore('requestQueue', { keyPath: 'id', autoIncrement: true });
                    queue.createIndex('queuedAt', 'queuedAt', { unique: false });
                    console.log('[DB] Created requestQueue store');
                }
                if (!db.objectStoreNames.contains('blockFormatting')) {
                    const fmt = db.createObjectStore('blockFormatting', { keyPath: 'blockId' });
                    fmt.createIndex('noteId', 'noteId', { unique: false });
                    fmt.createIndex('synced', 'synced', { unique: false });
                    console.log('[DB] Created blockFormatting store');
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };

            request.onerror = (e) => {
                console.error('[DB] Error:', e);
                reject(e);
            };
        });
    }

    async notesGetAll() { return this._promise('notes', 'readonly', s => s.getAll()); }
    async notesGet(noteID) { return this._promise('notes', 'readonly', s => s.get(noteID)); }
    async notesPut(note) { return this._promise('notes', 'readwrite', s => s.put(note)); }
    async notesDelete(noteID) { return this._promise('notes', 'readwrite', s => s.delete(noteID)); }
    async notesClear() { return this._promise('notes', 'readwrite', s => s.clear()); }

    async settingsGet(key) { 
        return this._promise('settings', 'readonly', s => s.get(key)).then(r => r?.value); 
    }
    async settingsSet(key, value) { return this._promise('settings', 'readwrite', s => s.put({ key, value })); }
    async settingsClear() { return this._promise('settings', 'readwrite', s => s.clear()); }

    async queueRequest(request) { return this._promise('requestQueue', 'readwrite', s => s.add(request)); }
    async getQueuedRequests() { return this._promise('requestQueue', 'readonly', s => s.getAll()); }
    async deleteQueuedRequest(id) { return this._promise('requestQueue', 'readwrite', s => s.delete(id)); }
    async clearQueuedRequests() { return this._promise('requestQueue', 'readwrite', s => s.clear()); }

    async formattingPut(data) {
        return this._promise('blockFormatting', 'readwrite', s => s.put(data));
    }

    async formattingGet(blockId) {
        return this._promise('blockFormatting', 'readonly', s => s.get(blockId)).then(r => r?.formatting || null);
    }

    async formattingGetByNoteId(noteId) {
        return this._promise('blockFormatting', 'readonly', (s) => s.index('noteId').getAll(noteId))
            .then(records => {
                const map = {};
                (records || []).forEach(r => map[r.blockId] = r.formatting);
                return map;
            });
    }

    async formattingMarkSynced(blockId) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('blockFormatting', 'readwrite');
            const store = tx.objectStore('blockFormatting');
            const getReq = store.get(blockId);
            
            getReq.onsuccess = () => {
                const record = getReq.result;
                if (record) {
                    record.synced = true;
                    const putReq = store.put(record);
                    putReq.onsuccess = () => resolve();
                    putReq.onerror = () => reject(putReq.error);
                } else {
                    resolve();
                }
            };
            getReq.onerror = () => reject(getReq.error);
        });
    }

    async formattingGetUnsynced() {
        return this._promise('blockFormatting', 'readonly', s => s.getAll())
            .then(records => (records || []).filter(r => !r.synced));
    }

    async formattingDelete(blockId) {
        return this._promise('blockFormatting', 'readwrite', s => s.delete(blockId));
    }

    async formattingClear() {
        return this._promise('blockFormatting', 'readwrite', s => s.clear());
    }

    async clear() {
        return Promise.all([this.notesClear(), this.formattingClear()]);
    }

    _promise(storeName, mode, operation) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const request = operation(store);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

export const db = new Database();