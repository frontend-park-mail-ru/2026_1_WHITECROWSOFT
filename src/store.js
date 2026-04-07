class Store {
    constructor () {
        this.state = {
            user: null,
            notes: [],
            activeNoteId: null,
            activeNote: null,
            activeBlocks: [],
            online: navigator.onLine,
        };
        this.subscribers = {};
    }

    getState() {
        return this.state;
    }

    getUser() {
        return this.state.user;
    }

    getNotes() {
        return this.state.notes;
    }

    getActiveNoteId() {
        return this.state.activeNoteId;
    }

    getActiveNote() {
        return this.state.activeNote;
    }

    getActiveBlocks() {
        return this.state.activeBlocks;
    }

    getOnline() {
        return this.state.online;
    }

    setUser(user) {
        this.state.user = user;
        this._notify('user', user);
    }

    setNotes(notes) {
        this.state.notes = notes;
        this._notify('notes', notes);
    }

    setActiveNoteId(noteId) {
        this.state.activeNoteId = noteId;
        this._notify('activeNoteId', noteId);
    }

    setActiveNote(note) {
        this.state.activeNote = note;
        this._notify('activeNote', note);
    }

    setActiveBlocks(blocks) {
        this.state.activeBlocks = blocks;
        this._notify('activeBlocks', blocks);
    }

    setOnline(online) {
        this.state.online = online;
        this._notify('online', online);
    }

    reorderBlocks(blockId, newIndex) {
        const blocks = [...this.state.activeBlocks];

        const oldIndex = blocks.findIndex(b => b.id === blockId);
        if (oldIndex === -1) return;

        const [moved] = blocks.splice(oldIndex, 1);
        blocks.splice(newIndex, 0, moved);

        const updated = blocks.map((b, i) => ({
            ...b,
            position: i
        }));

        this.setActiveBlocks(updated);
    }

    subscribe(key, callback) {
        if (!this.subscribers[key]) {
            this.subscribers[key] = [];
        }
        this.subscribers[key].push(callback);
    }

    _notify(key, value) {
        if (this.subscribers[key]) {
            this.subscribers[key].forEach(callback => callback(value));
        }
    }
}

export const store = new Store();