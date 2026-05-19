import { client } from '../client/client.js';
import { db } from '../db.js';
import { store } from '../store.js';
import type {
	Block,
	BlockApiResponse,
	FormattingRange,
	Note,
	NoteApiResponse,
} from '../types.js';
import { collabManager } from '../utils/collaborativeManager.js';
import { handleAuthError } from '../utils/handleAuthError';
import { queueService } from './requestQueueService.js';

interface GetNoteResponse {
	note: {
		id: string | number;
		title: string;
		updated_at: string;
		parent_id?: string | number | null;
		is_public?: boolean;
		is_favorite?: boolean;
	};
	blocks: Block[];
}

interface CreateNoteData {
	title: string;
	content?: string;
	parent_id: number | string | null;
}

interface CreateBlockData {
	note_id: string | number;
	block_type_id: number;
	position: number;
}

interface FormattingPayload {
	start_pos: number;
	end_pos: number;
	bold?: boolean | null;
	italic?: boolean | null;
	underline?: boolean | null;
}

interface FormattingResponse {
	block_id: string | number;
	ranges: FormattingPayload[];
}

export const noteService = {
	async getNotes(): Promise<Note[]> {
		const isOnline = store.getOnline();
		if (isOnline) {
			await queueService.flushQueue();
			try {
				const response = await client.get<{
					notes: NoteApiResponse[];
					total?: number;
				}>('/notes');
				const notesArray = response.notes || [];
				const notes: Note[] = notesArray.map((note) => ({
					ID: note.id,
					title: note.title,
					parent_id: note.parent_id || null,
					updatedAt: note.updated_at || Date.now(),
					is_public: note.is_public || false,
					is_favorite: note.is_favorite || false,
				}));
				await db.notesClear();
				for (const note of notes) {
					if (note.ID) {
						await db.notesPut(note);
					}
				}
				console.log(notes);
				store.setNotesSilently(notes);
				return notes;
			} catch (error) {
				handleAuthError(error);
			}
		}
		const cachedNotes = await db.notesGetAll();
		store.setNotes(cachedNotes);
		return cachedNotes;
	},

	async getNote(noteID: string | number): Promise<GetNoteResponse | null> {
		const storeNote = store.getNotes().find((n) => n.ID === noteID);
		if (storeNote && storeNote.blocks && storeNote.blocks.length > 0) {
			const formattingMap = await db.formattingGetByNoteId(noteID);
			const blocksWithFormatting: Block[] = (storeNote.blocks || []).map(
				(block) => ({
					...block,
					formatting: formattingMap[block.id]
						? { ranges: formattingMap[block.id] }
						: block.formatting || { ranges: [] },
				}),
			);
			store.setActiveBlocks(blocksWithFormatting);
			return {
				note: {
					id: storeNote.ID,
					title: storeNote.title,
					updated_at:
						typeof storeNote.updatedAt === 'string'
							? storeNote.updatedAt
							: new Date(storeNote.updatedAt).toISOString(),
					is_public: storeNote.is_public || false,
					is_favorite: storeNote.is_favorite || false,
				},
				blocks: blocksWithFormatting,
			};
		}
		const cachedNote = await db.notesGet(noteID);
		if (cachedNote && cachedNote.blocks && cachedNote.blocks.length > 0) {
			const currentNotes = store.getNotes();
			const existingIndex = currentNotes.findIndex(
				(n) => n.ID === cachedNote.ID,
			);
			let updatedNotes;
			if (existingIndex === -1) {
				updatedNotes = [cachedNote, ...currentNotes];
			} else {
				updatedNotes = [...currentNotes];
				updatedNotes[existingIndex] = cachedNote;
			}
			store.setNotes(updatedNotes);
			const blocks = Array.isArray(cachedNote.blocks) ? cachedNote.blocks : [];
			const formattingMap = await db.formattingGetByNoteId(noteID);
			const blocksWithFormatting: Block[] = blocks.map((block) => ({
				...block,
				formatting: formattingMap[block.id]
					? { ranges: formattingMap[block.id] }
					: block.formatting || { ranges: [] },
			}));
			store.setActiveBlocks(blocksWithFormatting);
			return {
				note: {
					id: cachedNote.ID,
					title: cachedNote.title,
					updated_at:
						typeof cachedNote.updatedAt === 'string'
							? cachedNote.updatedAt
							: new Date(cachedNote.updatedAt).toISOString(),
					is_public: cachedNote.is_public || false,
				},
				blocks: blocksWithFormatting,
			};
		}
		if (store.getOnline()) {
			return await this._fetchNoteFromNetwork(noteID);
		}
		return null;
	},

	async _fetchNoteFromNetwork(
		noteID: string | number,
	): Promise<GetNoteResponse | null> {
		try {
			const data = await client.get<GetNoteResponse>(`/notes/${noteID}`);
			const serverNote = data.note;
			const serverBlocks = data.blocks || [];
			const note: Note = {
				ID: serverNote.id,
				title: serverNote.title,
				parent_id: serverNote.parent_id || null,
				blocks: serverBlocks,
				updatedAt: serverNote.updated_at,
				is_public: serverNote.is_public || false,
				is_favorite: serverNote.is_favorite || false,
			};
			await db.notesPut(note);
			const currentNotes = store.getNotes();
			const existingIndex = currentNotes.findIndex((n) => n.ID === note.ID);
			let updatedNotes;
			if (existingIndex === -1) {
				updatedNotes = [note, ...currentNotes];
			} else {
				updatedNotes = [...currentNotes];
				updatedNotes[existingIndex] = note;
			}
			store.setNotes(updatedNotes);
			for (const block of serverBlocks) {
				if (block.formatting && block.formatting.ranges) {
					await db.formattingPut({
						blockId: block.id,
						noteId: serverNote.id,
						formatting: block.formatting,
						synced: true,
						updatedAt: Date.now(),
					});
				}
			}
			store.setActiveBlocks(serverBlocks);
			await db.settingsSet('activeNoteId', noteID);
			return {
				note: serverNote,
				blocks: serverBlocks,
			};
		} catch (error) {
			console.warn('[noteService] Network fetch failed:', error);
			handleAuthError(error);
			return null;
		}
	},

	_isLocalNote(noteID: string | number): boolean {
		return String(noteID).startsWith('local-');
	},

	async _setActiveNoteState(activeNote: {
		ID: string | number;
		title: string;
		breadcrumb: string;
		text: string;
		section?: 'personal' | 'shared' | 'favorite';
	}): Promise<void> {
		store.setActiveNote(activeNote);
		store.setActiveNoteId(activeNote.ID);
		await db.settingsSet('activeNoteId', activeNote.ID);
	},

	async createNote(data: CreateNoteData): Promise<Note> {
		const isOnline = store.getOnline();
		const localNoteId = `local-${Date.now()}`;
		const localNote: Note = {
			...data,
			ID: localNoteId,
			isLocal: true,
			updatedAt: Date.now(),
			blocks: [],
			section: 'personal',
		};
		if (isOnline) {
			try {
				const result = await client.post<NoteApiResponse>('/notes', data);
				const note: Note = {
					ID: result.id,
					title: result.title,
					updatedAt: result.updated_at || Date.now(),
					blocks: [],
					parent_id: data.parent_id || null,
					section: 'personal',
				};
				const blockData: CreateBlockData = {
					note_id: note.ID,
					block_type_id: 1,
					position: 0,
				};
				const createdBlock = await client.post<BlockApiResponse>(
					`/notes/${note.ID}/blocks`,
					blockData,
				);
				const updatedNote = { ...note, blocks: [createdBlock] };
				const currentNotes = store.getNotes();
				store.setNotes([updatedNote, ...currentNotes]);
				await db.notesPut(updatedNote);
				const section: 'personal' | 'shared' | 'favorite' = 'personal';
				const activeNote = {
					ID: note.ID,
					title: note.title,
					breadcrumb: note.title,
					text: '',
					section: section,
				};
				await this._setActiveNoteState(activeNote);
				store.setPendingFocus(createdBlock.id, 'start');
				return note;
			} catch (error) {
				console.warn(`[noteService] Network failed, queueing create request`);
				if (handleAuthError(error)) throw error;
				await db.notesPut(localNote);
				const currentNotes = store.getNotes();
				store.setNotes([localNote, ...currentNotes]);
				const section: 'personal' | 'shared' | 'favorite' = 'personal';
				const activeNote = {
					ID: localNoteId,
					title: localNote.title,
					breadcrumb: localNote.title,
					text: '',
					section: section,
				};
				await this._setActiveNoteState(activeNote);
				store.setActiveBlocks([]);
				await queueService.enqueueRequest({
					method: 'POST',
					endpoint: '/notes',
					body: data,
					localId: localNoteId,
				});

				return localNote;
			}
		}
		await db.notesPut(localNote);
		const currentNotes = store.getNotes();
		store.setNotes([localNote, ...currentNotes]);
		const section: 'personal' | 'shared' | 'favorite' = 'personal';
		const activeNote = {
			ID: localNoteId,
			title: localNote.title,
			breadcrumb: localNote.title,
			text: '',
			section: section,
		};
		await this._setActiveNoteState(activeNote);
		store.setActiveBlocksSilently([]);
		await queueService.enqueueRequest({
			method: 'POST',
			endpoint: '/notes',
			body: data,
			localId: localNoteId,
		});
		const block = await noteService.createBlock(localNoteId, {
			note_id: localNoteId,
			block_type_id: 1,
			position: 0,
		});
		store.setActiveBlocksSilently([block]);
		return localNote;
	},

	async deleteNote(noteID: string | number): Promise<void> {
		const isOnline = store.getOnline();
		const isLocal = this._isLocalNote(noteID);
		if (isOnline && !isLocal) {
			try {
				await client.delete(`/notes/${noteID}`);
			} catch (error) {
				console.warn(
					`[noteService] Network failed (${error}), queueing delete request`,
				);
				if (handleAuthError(error)) {
					throw error;
				}
				await queueService.enqueueRequest({
					method: 'DELETE',
					endpoint: `/notes/${noteID}`,
					body: null,
				});
			}
		} else if (!isOnline && !isLocal) {
			await queueService.enqueueRequest({
				method: 'DELETE',
				endpoint: `/notes/${noteID}`,
				body: null,
			});
		}

		const allSubnotes: (string | number)[] = [];
		const collectSubnotes = (id: string | number) => {
			const children = store.getNotes().filter((n) => n.parent_id === id);
			for (const child of children) {
				allSubnotes.push(child.ID);
				collectSubnotes(child.ID);
			}
		};
		collectSubnotes(noteID);
		const parentNote = store
			.getNotes()
			.find((n) =>
				(n.blocks || []).some(
					(b) => b.block_type_id === 5 && b.content === String(noteID),
				),
			);

		if (parentNote) {
			const linkBlock = (parentNote.blocks || []).find(
				(b) => b.block_type_id === 5 && b.content === String(noteID),
			);
			if (linkBlock) {
				await client.delete(`/notes/${parentNote.ID}/blocks/${linkBlock.id}`);
				const updatedBlocks = (parentNote.blocks || []).filter(
					(b) => b.id !== linkBlock.id,
				);
				updatedBlocks.forEach((b, idx) => {
					b.position = idx;
				});

				const updatedNote = { ...parentNote, blocks: updatedBlocks };
				const updatedNotes = store
					.getNotes()
					.map((n) => (n.ID === parentNote.ID ? updatedNote : n));
				store.setNotesSilently(updatedNotes);

				if (store.getActiveNoteId() === parentNote.ID) {
					store.setActiveBlocks(updatedBlocks);
				}

				const cachedNote = await db.notesGet(parentNote.ID);
				if (cachedNote) {
					await db.notesPut({ ...cachedNote, blocks: updatedBlocks });
				}
			}
		}
		const idsToDelete = [noteID, ...allSubnotes];
		for (const id of idsToDelete) {
			await db.notesDelete(id);
			await db.imagesDeleteByNoteId?.(id);
			await db.audiosDeleteByNoteId?.(id);
			await db.videosDeleteByNoteId?.(id);
			await db.formattingDeleteByNoteId?.(id);
			await db.queueFileDeleteByNoteId?.(id);
		}
		let currentNotes = store.getNotes();
		currentNotes = currentNotes.filter((n) => !idsToDelete.includes(n.ID));
		store.setNotes(currentNotes);
		const activeNoteId = store.getActiveNoteId();
		if (activeNoteId && idsToDelete.includes(activeNoteId)) {
			await db.settingsSet('activeNoteId', null);
			if (currentNotes.length > 0) {
				const firstNote = currentNotes[0];
				const activeNote = {
					ID: firstNote.ID,
					title: firstNote.title,
					breadcrumb: firstNote.title,
					text: '',
					section: firstNote.section,
				};
				store.setActiveNote(activeNote);
				store.setActiveNoteId(currentNotes[0].ID);
			} else {
				store.setActiveNote(null);
				store.setActiveBlocks([]);
				store.setActiveNoteId(null);
			}
		}
	},

	async updateNote(
		noteID: string | number,
		data: Partial<Note>,
		silence?: boolean,
	): Promise<Note | null> {
		const currentNotes = store.getNotes();
		const noteIndex = currentNotes.findIndex((n) => n.ID === noteID);

		if (noteIndex !== -1) {
			const updatedNote = {
				...currentNotes[noteIndex],
				...data,
				updatedAt: Date.now(),
				parent_id: currentNotes[noteIndex].parent_id ?? null,
			};
			await db.notesPut(updatedNote);
			const updatedNotes = [...currentNotes];
			updatedNotes[noteIndex] = updatedNote;
			if (silence === false) {
				store.setNotesSilently(updatedNotes);
			} else {
				store.setNotesSilently(updatedNotes);
			}
			if (store.getActiveNoteId() === noteID) {
				let newSection: 'personal' | 'shared' | 'favorite' = 'personal';
				if (updatedNote.is_favorite) {
					newSection = 'favorite';
				} else if (updatedNote.is_public) {
					newSection = 'shared';
				}
				const activeNote = {
					ID: updatedNote.ID,
					title: updatedNote.title,
					breadcrumb: updatedNote.title,
					text: store.getActiveNote()?.text || '',
					parent_id: updatedNote.parent_id || null,
					section: newSection,
				};
				store.setActiveNote(activeNote);
				store.setActiveNoteId(updatedNote.ID);
			}

			const isOnline = store.getOnline();

			if (isOnline) {
				try {
					await client.put(`/notes/${noteID}`, data);
				} catch {
					await queueService.enqueueRequest({
						method: 'PUT',
						endpoint: `/notes/${noteID}`,
						body: data,
						localId: String(noteID),
					});
				}
			} else {
				await queueService.enqueueRequest({
					method: 'PUT',
					endpoint: `/notes/${noteID}`,
					body: data,
					localId: String(noteID),
				});
			}

			return updatedNote;
		}

		return null;
	},

	async createBlockAfter(
		noteID: string | number,
		blockData: Omit<CreateBlockData, 'position'>,
		afterBlockId: string | null = null,
	): Promise<Block> {
		const blocks = store.getActiveBlocks();
		const sortedBlocks = [...blocks].sort((a, b) => a.position - b.position);
		let insertIndex: number;
		if (afterBlockId) {
			const afterIndex = sortedBlocks.findIndex(
				(b) => String(b.id) === afterBlockId,
			);
			insertIndex = afterIndex !== -1 ? afterIndex + 1 : sortedBlocks.length;
		} else {
			insertIndex = sortedBlocks.length;
		}
		const shifted = sortedBlocks.map((block, i) => {
			if (i >= insertIndex) {
				return { ...block, position: i + 1 };
			}
			return { ...block, position: i };
		});
		store.setActiveBlocksSilently(shifted);
		const cachedNote = await db.notesGet(noteID);
		if (cachedNote) {
			const updatedBlocks = shifted;
			await db.notesPut({ ...cachedNote, blocks: updatedBlocks });
		}
		const position = insertIndex;
		return this.createBlock(noteID, {
			...blockData,
			position,
		});
	},

	async createBlock(
		noteID: string | number,
		blockData: CreateBlockData,
		silence?: boolean,
	): Promise<Block> {
		const isOnline = store.getOnline();
		const localBlock: Block = {
			...blockData,
			content: '',
			id: `local-${Date.now()}`,
			isLocal: true,
			formatting: { ranges: [] },
		};
		if (isOnline) {
			try {
				const result = await client.post<BlockApiResponse>(
					`/notes/${noteID}/blocks`,
					blockData,
				);
				const block: Block = {
					id: result.id,
					block_type_id: result.block_type_id,
					content: result.content,
					position: result.position,
					formatting: { ranges: [] },
					note_id: noteID,
				};
				const currentBlocks = store.getActiveBlocks();
				const updatedBlocks = [...currentBlocks, block];
				updatedBlocks.sort((a, b) => a.position - b.position);
				store.setActiveBlocks(updatedBlocks);
				const currentNotes = store.getNotes();
				const noteIndex = currentNotes.findIndex((n) => n.ID === noteID);
				if (noteIndex !== -1) {
					const updatedNote = {
						...currentNotes[noteIndex],
						blocks: updatedBlocks,
					};
					const updatedNotes = [...currentNotes];
					updatedNotes[noteIndex] = updatedNote;
					store.setNotesSilently(updatedNotes);
				}
				await db.notesUpdateBlocks(noteID, updatedBlocks);
				await this._updateCachedBlocksWithPosition(noteID, block, 'add');
				store.setPendingFocus(block.id, 0);
				return block;
			} catch (error) {
				console.log(error);
				console.warn(
					`[noteService] Network failed, queueing create block request`,
				);
				if (handleAuthError(error)) {
					throw error;
				}
			}
		}
		await this._updateCachedBlocksWithPosition(noteID, localBlock, 'add');
		const currentBlocks = store.getActiveBlocks();
		const existingLocalIndex = currentBlocks.findIndex(
			(b) => b.id === localBlock.id,
		);
		if (existingLocalIndex === -1) {
			const updated = [...currentBlocks, localBlock];
			updated.sort((a, b) => a.position - b.position);
			if (blockData.block_type_id === 1) {
				store.setActiveBlocks(updated);
			} else {
				store.setActiveBlocksSilently(updated);
			}
			await db.notesUpdateBlocks(noteID, updated);
			const currentNotes = store.getNotes();
			const noteIndex = currentNotes.findIndex((n) => n.ID === noteID);
			if (noteIndex !== -1) {
				const updatedNote = {
					...currentNotes[noteIndex],
					blocks: updated,
				};
				const updatedNotes = [...currentNotes];
				updatedNotes[noteIndex] = updatedNote;
				store.setNotesSilently(updatedNotes);
			}
			store.setPendingFocus(localBlock.id, 0);
		}
		if (!silence) {
			await queueService.enqueueRequest({
				method: 'POST',
				endpoint: `/notes/${noteID}/blocks`,
				body: blockData,
				localId: localBlock.id as string,
			});
		}

		return localBlock;
	},

	async updateBlockContent(
		noteID: string | number,
		blockID: string | number,
		content: string,
	): Promise<Block> {
		const isOnline = store.getOnline();
		const isLocal = String(blockID).startsWith('local-');
		if (isOnline && !isLocal) {
			try {
				await client.put(`/notes/${noteID}/blocks/${blockID}/content`, {
					content,
				});
			} catch (error) {
				console.warn(
					`[noteService] Network failed (${error}), queueing block update request`,
				);
				if (handleAuthError(error)) {
					throw error;
				}
				await queueService.enqueueRequest({
					method: 'PUT',
					endpoint: `/notes/${noteID}/blocks/${blockID}/content`,
					body: { content },
				});
			}
		} else {
			await queueService.enqueueRequest({
				method: 'PUT',
				endpoint: `/notes/${noteID}/blocks/${blockID}/content`,
				body: { content },
			});
		}
		const existingBlocks = store.getActiveBlocks();
		const existingBlock = existingBlocks.find((b) => b.id === blockID);
		const block: Block = {
			id: blockID,
			block_type_id: existingBlock?.block_type_id || 0,
			content: content,
			position: existingBlock?.position || 0,
			formatting: existingBlock?.formatting || null,
		};
		await this._updateCachedBlocksWithPosition(noteID, block, 'update');
		const updatedActiveBlocks = existingBlocks.map((b) =>
			b.id === blockID ? { ...b, content } : b,
		);
		store.setActiveBlocksSilently(updatedActiveBlocks);
		const currentNotes = store.getNotes();
		const noteIndex = currentNotes.findIndex((n) => n.ID === noteID);
		if (noteIndex !== -1) {
			const updatedBlocks = (currentNotes[noteIndex].blocks || []).map((b) =>
				b.id === blockID ? { ...b, content } : b,
			);
			const updatedNote = {
				...currentNotes[noteIndex],
				blocks: updatedBlocks,
			};
			const updatedNotes = [...currentNotes];
			updatedNotes[noteIndex] = updatedNote;
			store.setNotesSilently(updatedNotes);
			const noteForBlocks = await db.notesGet(noteID);
			if (noteForBlocks) {
				const updatedNoteBlocks = (noteForBlocks.blocks || []).map((b) =>
					b.id === blockID ? { ...b, content } : b,
				);
				await db.notesPut({ ...noteForBlocks, blocks: updatedNoteBlocks });
			}
		}
		return block;
	},

	async moveBlock(
		noteID: string | number,
		blockID: string | number,
		newPosition: number,
	): Promise<Block> {
		const isOnline = store.getOnline();
		const isLocalBlock = String(blockID).startsWith('local-');
		const isLocalNote = this._isLocalNote(noteID);
		const existingBlocks = store.getActiveBlocks();
		const existingBlock = existingBlocks.find((b) => b.id === blockID);
		if (!existingBlock) {
			throw new Error(`Block ${blockID} not found`);
		}
		const shouldQueue = isLocalBlock || isLocalNote || !isOnline;
		if (isOnline && !isLocalBlock && !isLocalNote) {
			try {
				const result = await client.put<BlockApiResponse>(
					`/notes/${noteID}/blocks/${blockID}/move`,
					{ new_position: newPosition },
				);
				const block: Block = {
					id: result.id,
					block_type_id: result.block_type_id,
					content: result.content,
					position: result.position,
					formatting: { ranges: [] },
				};
				await this._updateCachedBlocksWithPosition(noteID, block, 'update');
				return block;
			} catch (error) {
				console.warn(
					`[noteService] Network failed, queueing block move request`,
				);
				if (handleAuthError(error)) {
					throw error;
				}
			}
		}
		if (shouldQueue) {
			await queueService.enqueueRequest({
				method: 'PUT',
				endpoint: `/notes/${noteID}/blocks/${blockID}/move`,
				body: { new_position: newPosition },
			});
		}
		const block: Block = {
			...existingBlock,
			position: newPosition,
		};
		await this._updateCachedBlocksWithPosition(noteID, block, 'update');
		const updatedBlocks = existingBlocks.map((b) =>
			b.id === blockID ? block : b,
		);
		updatedBlocks.sort((a, b) => a.position - b.position);
		store.setActiveBlocks(updatedBlocks);
		store.reorderBlocks(blockID, newPosition);
		const noteForMove = await db.notesGet(noteID);
		if (noteForMove) {
			await db.notesPut({ ...noteForMove, blocks: updatedBlocks });
		}
		return block;
	},

	async deleteBlock(
		noteID: string | number,
		blockID: string | number,
	): Promise<void> {
		const note = store.getNotes().find((n) => n.ID === noteID);
		const isPublic = note?.is_public === true;
		const isOnline = store.getOnline();
		const isLocal = String(blockID).startsWith('local-');

		if (isPublic && !isLocal) {
			collabManager.sendDeleteBlock(String(blockID));
			const currentBlocks = store.getActiveBlocks();
			const updatedBlocks = currentBlocks.filter((b) => b.id !== blockID);
			updatedBlocks.forEach((block, idx) => {
				block.position = idx;
			});
			store.setActiveBlocks(updatedBlocks);
			await this._updateCachedBlocksWithPosition(
				noteID,
				{ id: blockID } as Block,
				'delete',
			);
			return;
		}
		if (isOnline && !isLocal) {
			try {
				await client.delete(`/notes/${noteID}/blocks/${blockID}`);
			} catch (error) {
				console.warn(
					`[noteService] Network failed (${error}), queueing block deletion request`,
				);
				if (handleAuthError(error)) {
					throw error;
				}
				await queueService.enqueueRequest({
					method: 'DELETE',
					endpoint: `/notes/${noteID}/blocks/${blockID}`,
					body: null,
				});
			}
		} else if (!isOnline && !isLocal) {
			await queueService.enqueueRequest({
				method: 'DELETE',
				endpoint: `/notes/${noteID}/blocks/${blockID}`,
				body: null,
			});
		}

		await this._updateCachedBlocksWithPosition(
			noteID,
			{ id: blockID } as Block,
			'delete',
		);
		const currentBlocks = store.getActiveBlocks();
		const updatedBlocks = currentBlocks.filter((b) => b.id !== blockID);
		updatedBlocks.forEach((block, idx) => {
			block.position = idx;
		});
		store.setActiveBlocks(updatedBlocks);
		const currentNotes = store.getNotes();
		const noteIndex = currentNotes.findIndex((n) => n.ID === noteID);
		if (noteIndex !== -1) {
			const updatedNote = {
				...currentNotes[noteIndex],
				blocks: (currentNotes[noteIndex].blocks || []).filter(
					(b) => b.id !== blockID,
				),
			};
			updatedNote.blocks.forEach((b, idx) => {
				b.position = idx;
			});
			const updatedNotes = [...currentNotes];
			updatedNotes[noteIndex] = updatedNote;
			store.setNotesSilently(updatedNotes);
			const noteForDelete = await db.notesGet(noteID);
			if (noteForDelete) {
				const updatedNoteBlocks = (noteForDelete.blocks || []).filter(
					(b) => b.id !== blockID,
				);
				updatedNoteBlocks.forEach((b, idx) => {
					b.position = idx;
				});
				await db.notesPut({ ...noteForDelete, blocks: updatedNoteBlocks });
			}
		}
	},

	async _updateCachedBlocksWithPosition(
		noteID: string | number,
		block: Block,
		action: 'add' | 'update' | 'delete',
	): Promise<void> {
		const cachedNote = await db.notesGet(noteID);
		if (!cachedNote) return;
		let blocks = cachedNote.blocks || [];
		if (action === 'add') {
			const exists = blocks.some((b) => b.id === block.id);
			if (!exists) {
				blocks.push(block);
				blocks.sort((a, b) => a.position - b.position);
			}
		} else if (action === 'update') {
			blocks = blocks.map((b) =>
				b.id === block.id ? { ...b, ...block, updatedAt: Date.now() } : b,
			);
			blocks.sort((a, b) => a.position - b.position);
		} else if (action === 'delete') {
			blocks = blocks.filter((b) => b.id !== block.id);
			blocks.forEach((b, idx) => {
				b.position = idx;
			});
		}
		await db.notesPut({ ...cachedNote, blocks, updatedAt: Date.now() });
	},

	async saveBlockFormatting(
		noteId: string | number,
		blockId: string | number,
		startPos: number,
		endPos: number,
		formatting: { bold?: boolean; italic?: boolean; underline?: boolean },
	): Promise<FormattingResponse> {
		const isOnline = store.getOnline();
		const isLocal = String(blockId).startsWith('local-');
		const payload: FormattingPayload = {
			start_pos: startPos,
			end_pos: endPos,
			bold: formatting.bold ?? null,
			italic: formatting.italic ?? null,
			underline: formatting.underline ?? null,
		};
		const endpoint = `/notes/${noteId}/blocks/${blockId}/formatting`;
		if (isOnline && !isLocal) {
			try {
				const result = await client.put<FormattingResponse>(endpoint, payload);
				if (result && result.ranges) {
					const formattedRanges: FormattingRange[] = result.ranges.map(
						(range) => ({
							start_pos: range.start_pos,
							end_pos: range.end_pos,
							bold: range.bold ?? null,
							italic: range.italic ?? null,
							underline: range.underline ?? null,
						}),
					);

					await db.formattingPut({
						blockId: blockId,
						noteId: noteId,
						formatting: { ranges: formattedRanges },
						synced: true,
						updatedAt: Date.now(),
					});
				}
				await db.formattingMarkSynced(blockId);
				return result;
			} catch (error) {
				console.warn(
					`[noteService] Network failed (${error}), queueing formatting request`,
				);
				if (handleAuthError(error)) {
					throw error;
				}
				await queueService.enqueueRequest({
					method: 'PUT',
					endpoint,
					body: payload,
				});
				await this._saveFormattingToCache(noteId, blockId, payload, false);
				return { block_id: blockId, ranges: [payload] };
			}
		} else {
			await queueService.enqueueRequest({
				method: 'PUT',
				endpoint,
				body: payload,
			});
			await this._saveFormattingToCache(noteId, blockId, payload, false);
			return { block_id: blockId, ranges: [payload] };
		}
	},

	async _saveFormattingToCache(
		noteId: string | number,
		blockId: string | number,
		formatting: FormattingPayload,
		synced: boolean = false,
	): Promise<void> {
		try {
			const existing = await db.formattingGet(blockId);
			const ranges = existing?.formatting?.ranges || [];
			const rangeIndex = ranges.findIndex(
				(r: FormattingRange) =>
					r.start_pos === formatting.start_pos &&
					r.end_pos === formatting.end_pos,
			);
			if (rangeIndex !== -1) {
				const existingRange = ranges[rangeIndex];
				ranges[rangeIndex] = {
					...existingRange,
					start_pos: formatting.start_pos,
					end_pos: formatting.end_pos,
					bold:
						formatting.bold !== undefined
							? formatting.bold
							: existingRange.bold,
					italic:
						formatting.italic !== undefined
							? formatting.italic
							: existingRange.italic,
					underline:
						formatting.underline !== undefined
							? formatting.underline
							: existingRange.underline,
				};
				const hasAnyFormatting =
					ranges[rangeIndex].bold ||
					ranges[rangeIndex].italic ||
					ranges[rangeIndex].underline;

				if (!hasAnyFormatting) {
					ranges.splice(rangeIndex, 1);
				}
			} else {
				ranges.push(formatting as FormattingRange);
			}
			await db.formattingPut({
				blockId: blockId,
				noteId: noteId,
				formatting: { ranges },
				synced: synced,
				updatedAt: Date.now(),
			});
		} catch (error) {
			console.error('[noteService] Failed to save formatting to cache:', error);
		}
	},
};
