class Database {
    constructor() {
        this.db = null;
        this.DB_NAME = 'Noterian';
        this.DB_VERSION = 9;
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
                if (!db.objectStoreNames.contains('images')) {
                    const images = db.createObjectStore('images', { keyPath: 'id' });
                    images.createIndex('blockId', 'blockId', { unique: false });
                    images.createIndex('noteId', 'noteId', { unique: false });
                    images.createIndex('url', 'url', { unique: false });
                    images.createIndex('status', 'status', { unique: false });
                    images.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('[DB] Created images store');
                }
                if (!db.objectStoreNames.contains('queueFiles')) {
                    const queueFiles = db.createObjectStore('queueFiles', { keyPath: 'id' });
                    queueFiles.createIndex('queuedAt', 'queuedAt', { unique: false });
                    queueFiles.createIndex('blockId', 'blockId', { unique: false });
                    queueFiles.createIndex('noteId', 'noteId', { unique: false });
                    console.log('[DB] Created queueFiles store');
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
        return this._promise('blockFormatting', 'readonly', s => s.get(blockId));
    }

    async formattingGetByNoteId(noteId) {
        return this._promise('blockFormatting', 'readonly', (s) => {
            const index = s.index('noteId');
            return index.getAll(noteId);
        }).then(records => {
            const map = {};
            (records || []).forEach(record => {
                map[record.blockId] = record.formatting?.ranges || [];
            });
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

    async imagesPut(image) {
        return this._promise('images', 'readwrite', s => s.put(image));
    }

    async imagesGet(id) {
        return this._promise('images', 'readonly', s => s.get(id));
    }

    async imagesGetByNoteId(noteId) {
        return this._promise('images', 'readonly', (s) => {
            const index = s.index('noteId');
            return index.getAll(noteId);
        });
    }

    async imagesGetByBlockId(blockId) {
        return this._promise('images', 'readonly', (s) => {
            const index = s.index('blockId');
            return index.getAll(blockId);
        });
    }

    async imagesGetByUrl(url) {
        return this._promise('images', 'readonly', (s) => {
            const index = s.index('url');
            return index.getAll(url);
        });
    }

    async imagesGetAll() {
        return this._promise('images', 'readonly', s => s.getAll());
    }

    async imagesDelete(id) {
        return this._promise('images', 'readwrite', s => s.delete(id));
    }

    async imagesDeleteByNoteId(noteId) {
        const images = await this.imagesGetByNoteId(noteId);
        for (const image of images) {
            await this.imagesDelete(image.id);
        }
    }

    async imagesClear() {
        return this._promise('images', 'readwrite', s => s.clear());
    }

    async queueFilePut(fileData) {
        return this._promise('queueFiles', 'readwrite', s => s.put(fileData));
    }

    async queueFileGet(id) {
        return this._promise('queueFiles', 'readonly', s => s.get(id));
    }

    async queueFileDelete(id) {
        return this._promise('queueFiles', 'readwrite', s => s.delete(id));
    }

    async queueFileGetByBlockId(blockId) {
        return this._promise('queueFiles', 'readonly', (s) => {
            const index = s.index('blockId');
            return index.getAll(blockId);
        });
    }

    async clearQueueFiles() {
        return this._promise('queueFiles', 'readwrite', s => s.clear());
    }

    async clear() {
        return Promise.all([this.notesClear(), this.formattingClear(), this.imagesClear(), this.clearQueueFiles()]);
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