import { client } from '../client/client.js';
import { db } from '../db.js';
import { store } from '../store.js';

const QUEUEABLE_METHODS = ['POST', 'PUT', 'DELETE'];

export const queueService = {
	async enqueueRequest(request) {
		if (!QUEUEABLE_METHODS.includes(request.method)) {
			return null;
		}

		const queuedRequest = {
			method: request.method,
			endpoint: request.endpoint,
			body: request.body || null,
			localId: request.localId || null,
			queuedAt: Date.now(),
		};

		return db.queueRequest(queuedRequest);
	},

	async flushQueue() {
		const queue = await db.getQueuedRequests();
		if (!queue.length) {
			return [];
		}

		const results = [];
		for (const requestItem of queue) {
			try {
				const response = await client.request(requestItem.endpoint, {
					method: requestItem.method,
					body: requestItem.body ? JSON.stringify(requestItem.body) : undefined,
					headers: { 'Content-Type': 'application/json' },
				});

				if (requestItem.localId && requestItem.method === 'POST' && requestItem.endpoint === '/notes') {
					await this._commitLocalNoteId(requestItem.localId, response);
				} else if (requestItem.localId && requestItem.method === 'POST' && requestItem.endpoint.includes('/blocks')) {
					await this._commitLocalBlockId(requestItem.localId, response);
				}

				await db.deleteQueuedRequest(requestItem.id);
				results.push({ id: requestItem.id, status: 'synced' });
			} catch (error) {
				console.warn('[Queue] Failed to sync request', requestItem, error);
				if (!navigator.onLine) {
					break;
				}
				results.push({ id: requestItem.id, status: 'failed', error: error.message });
			}
		}

		return results;
	},

	async _commitLocalNoteId(localId, serverData) {
		const localNote = await db.notesGet(localId);
		if (!localNote) {
			return;
		}

		const newNote = {
			...localNote,
			ID: serverData.id,
			title: serverData.title ?? localNote.title,
			updatedAt: serverData.updated_at ?? serverData.updatedAt ?? localNote.updatedAt,
		};

		await db.notesDelete(localId);
		await db.notesPut(newNote);

		const notes = store.getNotes().map(note => note.ID === localId ? newNote : note);
		store.setNotes(notes);

		if (store.getActiveNoteId() === localId) {
			store.setActiveNoteId(newNote.ID);
			store.setActiveNote({
				...store.getActiveNote(),
				ID: newNote.ID,
				title: newNote.title,
			});
		}
	},

	async _commitLocalBlockId(localId, serverData) {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId) return;

		const cachedNote = await db.notesGet(activeNoteId);
		if (!cachedNote || !cachedNote.blocks) return;

		const updatedBlocks = cachedNote.blocks.map(block => 
			block.id === localId ? { ...block, id: serverData.id } : block
		);

		await db.notesPut({ ...cachedNote, blocks: updatedBlocks });

		const activeBlocks = store.getActiveBlocks().map(block => 
			block.id === localId ? { ...block, id: serverData.id } : block
		);
		store.setActiveBlocks(activeBlocks);
	},
};
