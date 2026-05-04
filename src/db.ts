import type {
	AudioAttachment,
	BlockFormatting,
	FormattingRange,
	ImageAttachment,
	Note,
	QueueFile,
	QueuedRequest,
	VideoAttachment,
} from './types';

interface FormattingRecord {
	blockId: string | number;
	noteId: string | number;
	formatting: BlockFormatting;
	synced: boolean;
	updatedAt: number;
}

interface RecentNote {
	noteId: string | number;
	lastOpenedAt: number;
	title: string;
}

class Database {
	private db: IDBDatabase | null = null;
	private readonly DB_NAME = 'Noterian';
	private readonly DB_VERSION = 14;

	async open(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

			request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
				const db = (e.target as IDBOpenDBRequest).result;

				if (!db.objectStoreNames.contains('notes')) {
					const notes = db.createObjectStore('notes', { keyPath: 'ID' });
					notes.createIndex('updatedAt', 'updatedAt', { unique: false });
					notes.createIndex('parent_id', 'parent_id', { unique: false });
				}
				if (!db.objectStoreNames.contains('recentNotes')) {
					const recentNotes = db.createObjectStore('recentNotes', {
						keyPath: 'noteId',
					});
					recentNotes.createIndex('lastOpenedAt', 'lastOpenedAt', {
						unique: false,
					});
				}
				if (!db.objectStoreNames.contains('settings')) {
					db.createObjectStore('settings', { keyPath: 'key' });
				}
				if (!db.objectStoreNames.contains('requestQueue')) {
					const queue = db.createObjectStore('requestQueue', {
						keyPath: 'id',
						autoIncrement: true,
					});
					queue.createIndex('queuedAt', 'queuedAt', { unique: false });
				}
				if (!db.objectStoreNames.contains('blockFormatting')) {
					const fmt = db.createObjectStore('blockFormatting', {
						keyPath: 'blockId',
					});
					fmt.createIndex('noteId', 'noteId', { unique: false });
					fmt.createIndex('synced', 'synced', { unique: false });
				}
				if (!db.objectStoreNames.contains('images')) {
					const images = db.createObjectStore('images', { keyPath: 'id' });
					images.createIndex('blockId', 'blockId', { unique: false });
					images.createIndex('noteId', 'noteId', { unique: false });
					images.createIndex('url', 'url', { unique: false });
					images.createIndex('status', 'status', { unique: false });
				}
				if (!db.objectStoreNames.contains('audios')) {
					const audios = db.createObjectStore('audios', { keyPath: 'id' });
					audios.createIndex('blockId', 'blockId', { unique: false });
					audios.createIndex('noteId', 'noteId', { unique: false });
					audios.createIndex('url', 'url', { unique: false });
					audios.createIndex('status', 'status', { unique: false });
				}
				if (!db.objectStoreNames.contains('videos')) {
					const videos = db.createObjectStore('videos', { keyPath: 'id' });
					videos.createIndex('blockId', 'blockId', { unique: false });
					videos.createIndex('noteId', 'noteId', { unique: false });
					videos.createIndex('url', 'url', { unique: false });
					videos.createIndex('status', 'status', { unique: false });
				}
				if (!db.objectStoreNames.contains('queueFiles')) {
					const queueFiles = db.createObjectStore('queueFiles', {
						keyPath: 'id',
					});
					queueFiles.createIndex('queuedAt', 'queuedAt', { unique: false });
					queueFiles.createIndex('blockId', 'blockId', { unique: false });
					queueFiles.createIndex('noteId', 'noteId', { unique: false });
				}
			};

			request.onsuccess = (e) => {
				this.db = (e.target as IDBOpenDBRequest).result;
				resolve(this.db);
			};

			request.onerror = (e) => {
				reject((e.target as IDBOpenDBRequest).error);
			};
		});
	}

	async notesGetAll(): Promise<Note[]> {
		return this._getAll<Note>('notes');
	}

	async notesGet(noteID: string | number): Promise<Note | undefined> {
		return this._get<Note>('notes', noteID);
	}

	async notesGetByParentId(parentId: string | number | null): Promise<Note[]> {
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction('notes', 'readonly');
			const store = transaction.objectStore('notes');
			const index = store.index('parent_id');
			const request = index.getAll(parentId === null ? null : parentId);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	async notesGetTree(noteId: string | number): Promise<Note[]> {
		const notes: Note[] = [];
		const stack = [noteId];
		while (stack.length > 0) {
			const currentId = stack.pop()!;
			const children = await this.notesGetByParentId(currentId);
			for (const child of children) {
				notes.push(child);
				stack.push(child.ID);
			}
		}
		return notes;
	}

	async notesGetAllWithChildren(): Promise<Note[]> {
		const allNotes = await this.notesGetAll();
		const noteMap = new Map<string | number, Note & { children?: Note[] }>();
		const roots: Note[] = [];
		for (const note of allNotes) {
			noteMap.set(note.ID, { ...note, children: [] });
		}
		for (const note of noteMap.values()) {
			if (note.parent_id && noteMap.has(note.parent_id)) {
				const parent = noteMap.get(note.parent_id)!;
				parent.children = parent.children || [];
				parent.children.push(note);
			} else {
				roots.push(note);
			}
		}
		return roots;
	}

	async notesPut(note: Note): Promise<void> {
		return this._put('notes', note);
	}

	async notesDelete(noteID: string | number): Promise<void> {
		return this._delete('notes', noteID);
	}

	async notesClear(): Promise<void> {
		return this._clear('notes');
	}

	async recentNotesGetAll(): Promise<RecentNote[]> {
		return this._getAll<RecentNote>('recentNotes');
	}

	async recentNotesPut(recentNote: RecentNote): Promise<void> {
		return this._put('recentNotes', recentNote);
	}

	async recentNotesDelete(noteId: string | number): Promise<void> {
		return this._delete('recentNotes', noteId);
	}

	async recentNotesClear(): Promise<void> {
		return this._clear('recentNotes');
	}

	async settingsGet<T = unknown>(key: string): Promise<T | undefined> {
		const result = await this._get<{ key: string; value: T }>('settings', key);
		return result?.value;
	}

	async settingsSet(key: string, value: unknown): Promise<void> {
		return this._put('settings', { key, value });
	}

	async settingsClear(): Promise<void> {
		return this._clear('settings');
	}

	async queueRequest(request: Omit<QueuedRequest, 'id'>): Promise<number> {
		return this._add('requestQueue', request);
	}

	async getQueuedRequests(): Promise<QueuedRequest[]> {
		return this._getAll<QueuedRequest>('requestQueue');
	}

	async deleteQueuedRequest(id: number): Promise<void> {
		return this._delete('requestQueue', id);
	}

	async clearQueuedRequests(): Promise<void> {
		return this._clear('requestQueue');
	}

	async formattingPut(data: FormattingRecord): Promise<void> {
		return this._put('blockFormatting', data);
	}

	async formattingGet(
		blockId: string | number,
	): Promise<FormattingRecord | undefined> {
		return this._get<FormattingRecord>('blockFormatting', blockId);
	}

	async formattingGetByNoteId(
		noteId: string | number,
	): Promise<Record<string, FormattingRange[]>> {
		const records = await this._getAll<FormattingRecord>('blockFormatting');
		const map: Record<string, FormattingRange[]> = {};
		records
			.filter((r) => r.noteId === noteId)
			.forEach((record) => {
				map[String(record.blockId)] = record.formatting?.ranges || [];
			});
		return map;
	}

	async formattingMarkSynced(blockId: string | number): Promise<void> {
		const record = await this.formattingGet(blockId);
		if (record) {
			await this.formattingPut({ ...record, synced: true });
		}
	}

	async formattingGetUnsynced(): Promise<FormattingRecord[]> {
		const records = await this._getAll<FormattingRecord>('blockFormatting');
		return records.filter((r) => !r.synced);
	}

	async formattingDelete(blockId: string | number): Promise<void> {
		return this._delete('blockFormatting', blockId);
	}

	async formattingDeleteByNoteId(noteId: string | number): Promise<void> {
		const records = await this._getAll<FormattingRecord>('blockFormatting');
		for (const record of records) {
			if (record.noteId === noteId) {
				await this.formattingDelete(record.blockId);
			}
		}
	}

	async formattingClear(): Promise<void> {
		return this._clear('blockFormatting');
	}

	async imagesPut(image: ImageAttachment): Promise<void> {
		return this._put('images', image);
	}

	async imagesGet(id: string | number): Promise<ImageAttachment | undefined> {
		return this._get<ImageAttachment>('images', id);
	}

	async imagesGetByNoteId(noteId: string | number): Promise<ImageAttachment[]> {
		const all = await this._getAll<ImageAttachment>('images');
		return all.filter((img) => img.noteId === noteId);
	}

	async imagesGetByBlockId(
		blockId: string | number,
	): Promise<ImageAttachment[]> {
		const all = await this._getAll<ImageAttachment>('images');
		return all.filter((img) => img.blockId === blockId);
	}

	async imagesGetByUrl(url: string): Promise<ImageAttachment[]> {
		const all = await this._getAll<ImageAttachment>('images');
		return all.filter((img) => img.url === url);
	}

	async imagesGetAll(): Promise<ImageAttachment[]> {
		return this._getAll<ImageAttachment>('images');
	}

	async imagesDelete(id: string | number): Promise<void> {
		return this._delete('images', id);
	}

	async imagesDeleteByNoteId(noteId: string | number): Promise<void> {
		const images = await this.imagesGetByNoteId(noteId);
		for (const image of images) {
			await this.imagesDelete(image.id);
		}
	}

	async imagesClear(): Promise<void> {
		return this._clear('images');
	}

	async audiosPut(audio: AudioAttachment): Promise<void> {
		return this._put('audios', audio);
	}

	async audiosGet(id: string | number): Promise<AudioAttachment | undefined> {
		return this._get<AudioAttachment>('audios', id);
	}

	async audiosGetByNoteId(noteId: string | number): Promise<AudioAttachment[]> {
		const all = await this._getAll<AudioAttachment>('audios');
		return all.filter((audio) => audio.noteId === noteId);
	}

	async audiosGetByBlockId(
		blockId: string | number,
	): Promise<AudioAttachment[]> {
		const all = await this._getAll<AudioAttachment>('audios');
		return all.filter((audio) => audio.blockId === blockId);
	}

	async audiosGetByUrl(url: string): Promise<AudioAttachment[]> {
		const all = await this._getAll<AudioAttachment>('audios');
		return all.filter((audio) => audio.url === url);
	}

	async audiosGetAll(): Promise<AudioAttachment[]> {
		return this._getAll<AudioAttachment>('audios');
	}

	async audiosDelete(id: string | number): Promise<void> {
		return this._delete('audios', id);
	}

	async audiosDeleteByNoteId(noteId: string | number): Promise<void> {
		const audios = await this.audiosGetByNoteId(noteId);
		for (const audio of audios) {
			await this.audiosDelete(audio.id);
		}
	}

	async audiosClear(): Promise<void> {
		return this._clear('audios');
	}

	async videosPut(video: VideoAttachment): Promise<void> {
		return this._put('videos', video);
	}

	async videosGet(id: string | number): Promise<VideoAttachment | undefined> {
		return this._get<VideoAttachment>('videos', id);
	}

	async videosGetByNoteId(noteId: string | number): Promise<VideoAttachment[]> {
		const all = await this._getAll<VideoAttachment>('videos');
		return all.filter((video) => video.noteId === noteId);
	}

	async videosDelete(id: string | number): Promise<void> {
		return this._delete('videos', id);
	}

	async queueFilePut(file: QueueFile): Promise<void> {
		return this._put('queueFiles', file);
	}

	async queueFileGet(id: string): Promise<QueueFile | undefined> {
		return this._get<QueueFile>('queueFiles', id);
	}

	async queueFileDelete(id: string): Promise<void> {
		return this._delete('queueFiles', id);
	}

	async queueFileGetByBlockId(blockId: string | number): Promise<QueueFile[]> {
		const all = await this._getAll<QueueFile>('queueFiles');
		return all.filter((file) => file.blockId === blockId);
	}

	async queueFileGetByNoteId(noteId: string | number): Promise<QueueFile[]> {
		const all = await this._getAll<QueueFile>('queueFiles');
		return all.filter((file) => file.noteId === noteId);
	}

	async clearQueueFiles(): Promise<void> {
		return this._clear('queueFiles');
	}

	async clear(): Promise<void[]> {
		return Promise.all([
			this.notesClear(),
			this.formattingClear(),
			this.imagesClear(),
			this.clearQueueFiles(),
		]);
	}

	private _getAll<T>(storeName: string): Promise<T[]> {
		return new Promise((resolve, reject) => {
			if (!this.db) return reject(new Error('Database not initialized'));
			const transaction = this.db.transaction(storeName, 'readonly');
			const store = transaction.objectStore(storeName);
			const request = store.getAll();
			request.onsuccess = () => resolve(request.result as T[]);
			request.onerror = () => reject(request.error);
		});
	}

	private _get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
		return new Promise((resolve, reject) => {
			if (!this.db) return reject(new Error('Database not initialized'));
			const transaction = this.db.transaction(storeName, 'readonly');
			const store = transaction.objectStore(storeName);
			const request = store.get(key);
			request.onsuccess = () => resolve(request.result as T | undefined);
			request.onerror = () => reject(request.error);
		});
	}

	private _put(
		storeName: string,
		value: unknown,
		key?: IDBValidKey,
	): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!this.db) return reject(new Error('Database not initialized'));
			const transaction = this.db.transaction(storeName, 'readwrite');
			const store = transaction.objectStore(storeName);
			const request =
				key !== undefined ? store.put(value, key) : store.put(value);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	private _add(storeName: string, value: unknown): Promise<number> {
		return new Promise((resolve, reject) => {
			if (!this.db) return reject(new Error('Database not initialized'));
			const transaction = this.db.transaction(storeName, 'readwrite');
			const store = transaction.objectStore(storeName);
			const request = store.add(value);
			request.onsuccess = () => resolve(request.result as number);
			request.onerror = () => reject(request.error);
		});
	}

	private _delete(storeName: string, key: IDBValidKey): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!this.db) return reject(new Error('Database not initialized'));
			const transaction = this.db.transaction(storeName, 'readwrite');
			const store = transaction.objectStore(storeName);
			const request = store.delete(key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	private _clear(storeName: string): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!this.db) return reject(new Error('Database not initialized'));
			const transaction = this.db.transaction(storeName, 'readwrite');
			const store = transaction.objectStore(storeName);
			const request = store.clear();
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}
}

export const db = new Database();
