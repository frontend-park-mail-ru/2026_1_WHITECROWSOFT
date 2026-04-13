import type { StoreState, User, Note, ActiveNote, Block } from './types';

type SubscriberCallback<T> = (value: T) => void;
type Subscribers = {
    user: Map<number, SubscriberCallback<User | null>>;
    notes: Map<number, SubscriberCallback<Note[]>>;
    activeNoteId: Map<number, SubscriberCallback<string | number | null>>;
    activeNote: Map<number, SubscriberCallback<ActiveNote | null>>;
    activeBlocks: Map<number, SubscriberCallback<Block[]>>;
    online: Map<number, SubscriberCallback<boolean>>;
};

class Store {
    private state: StoreState;
    private subscribers: Subscribers;
    private nextId: number;

    constructor() {
        this.state = {
            user: null,
            notes: [],
            activeNoteId: null,
            activeNote: null,
            activeBlocks: [],
            online: navigator.onLine,
        };
        this.subscribers = {
            user: new Map(),
            notes: new Map(),
            activeNoteId: new Map(),
            activeNote: new Map(),
            activeBlocks: new Map(),
            online: new Map(),
        };
        this.nextId = 0;
    }

    getState(): StoreState {
        return { ...this.state };
    }

    getUser(): User | null {
        return this.state.user;
    }

    getNotes(): Note[] {
        return [...this.state.notes];
    }

    getActiveNoteId(): string | number | null {
        return this.state.activeNoteId;
    }

    getActiveNote(): ActiveNote | null {
        return this.state.activeNote ? { ...this.state.activeNote } : null;
    }

    getActiveBlocks(): Block[] {
        return [...this.state.activeBlocks];
    }

    getOnline(): boolean {
        return this.state.online;
    }

    setUser(user: User | null): void {
        this.state.user = user;
        this._notify('user', user);
    }

    setNotes(notes: Note[]): void {
        this.state.notes = [...notes];
        this._notify('notes', this.state.notes);
    }

    setActiveNoteId(noteId: string | number | null): void {
        this.state.activeNoteId = noteId;
        this._notify('activeNoteId', noteId);
    }

    setActiveNote(note: ActiveNote | null): void {
        this.state.activeNote = note ? { ...note } : null;
        this._notify('activeNote', this.state.activeNote);
    }

    setActiveBlocks(blocks: Block[]): void {
        this.state.activeBlocks = [...blocks];
        this._notify('activeBlocks', this.state.activeBlocks);
    }

    setOnline(online: boolean): void {
        this.state.online = online;
        this._notify('online', online);
    }

    reorderBlocks(blockId: string | number, newIndex: number): void {
        const blocks = [...this.state.activeBlocks];
        const oldIndex = blocks.findIndex(b => b.id === blockId);
        
        if (oldIndex === -1) return;

        const [moved] = blocks.splice(oldIndex, 1);
        blocks.splice(newIndex, 0, moved);

        const updated = blocks.map((b, i) => ({ ...b, position: i }));
        this.setActiveBlocks(updated);
    }

    subscribe<K extends keyof Subscribers>(
        key: K,
        callback: SubscriberCallback<StoreState[K]>
    ): () => void {
        const id = this.nextId++;
        this.subscribers[key].set(id, callback as never);

        return () => {
            this.subscribers[key].delete(id);
        };
    }

    private _notify<K extends keyof Subscribers>(key: K, value: StoreState[K]): void {
        this.subscribers[key].forEach(callback => callback(value as never));
    }
}

export const store = new Store();
