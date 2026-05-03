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
import { handleAuthError } from '../utils/handleAuthError';
import { queueService } from './requestQueueService.js';
import { collabManager } from '../utils/collaborativeManager.js';

interface GetNoteResponse {
	note: {
		id: string | number;
		title: string;
		updated_at: string;
		parent_id?: string | number | null;
		is_public?: boolean;
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
	content: string;
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
					icon: null,
					parent_id: note.parent_id || null,
					updatedAt: note.updated_at || Date.now(),
					is_public: note.is_public || false,
				}));
				await db.notesClear();
				for (const note of notes) {
					if (note.ID) {
						await db.notesPut(note);
					}
				}
				store.setNotes(notes);
				return notes;
			} catch (error) {
				console.warn('[noteService] Network failed, using cache');
				handleAuthError(error);
			}
		}
		const cachedNotes = await db.notesGetAll();
		store.setNotes(cachedNotes);
		return cachedNotes;
	},

	async getNote(noteID: string | number): Promise<GetNoteResponse | null> {
		const isOnline = store.getOnline();
		if (isOnline) {
			try {
				const data = await client.get<GetNoteResponse>(`/notes/${noteID}`);
				const serverNote = data.note;
				const serverBlocks = data.blocks || [];
				await db.notesPut({
					ID: serverNote.id,
					title: serverNote.title,
					icon: null,
					parent_id: serverNote.parent_id || null,
					blocks: serverBlocks,
					updatedAt: serverNote.updated_at,
					is_public: (serverNote as any).is_public || false,
				});
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
				const activeNote = {
					ID: serverNote.id,
					title: serverNote.title,
					breadcrumb: serverNote.title,
					text: serverBlocks.map((b: Block) => b.content).join('\n\n') ?? '',
				};
				store.setActiveNote(activeNote);
				store.setActiveNoteId(noteID);
				store.setActiveBlocks(serverBlocks);
				await db.settingsSet('activeNoteId', noteID);
				await store.addToRecentNotes(serverNote.id, serverNote.title);
				return {
					note: serverNote,
					blocks: serverBlocks,
				};
			} catch (error) {
				console.warn('[noteService] Network failed, using cache');
				handleAuthError(error);
			}
		}
		const cachedNote = await db.notesGet(noteID);
		if (cachedNote) {
			const blocks = Array.isArray(cachedNote.blocks) ? cachedNote.blocks : [];
			const formattingMap = await db.formattingGetByNoteId(noteID);
			const blocksWithFormatting: Block[] = blocks.map((block) => ({
				...block,
				formatting: formattingMap[block.id]
					? { ranges: formattingMap[block.id] }
					: block.formatting || { ranges: [] },
			}));
			const activeNote = {
				ID: cachedNote.ID,
				title: cachedNote.title,
				breadcrumb: cachedNote.title,
				text: blocks.map((b) => b.content).join('\n\n') ?? '',
			};
			await this._setActiveNoteState(activeNote);
			store.setActiveBlocks(blocksWithFormatting);
			await store.addToRecentNotes(cachedNote.ID, cachedNote.title);
			return {
				note: {
					id: cachedNote.ID,
					title: cachedNote.title,
					updated_at: typeof cachedNote.updatedAt === 'string'
						? cachedNote.updatedAt
						: new Date(cachedNote.updatedAt).toISOString(),
					is_public: cachedNote.is_public || false,
				},
				blocks: blocksWithFormatting,
			};
		}
		return null;
	},

	_isLocalNote(noteID: string | number): boolean {
		return String(noteID).startsWith('local-');
	},

	async _setActiveNoteState(activeNote: {
		ID: string | number;
		title: string;
		breadcrumb: string;
		text: string;
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
			icon: null,
			updatedAt: Date.now(),
			blocks: [],
		};
		if (isOnline) {
			try {
				const result = await client.post<NoteApiResponse>('/notes', data);
				const note: Note = {
					ID: result.id,
					title: result.title,
					icon: null,
					updatedAt: result.updated_at || Date.now(),
					blocks: [],
					parent_id: data.parent_id || null,
				};
				const createdBlock = await this.createBlock(note.ID, {
					note_id: note.ID,
					block_type_id: 1,
					position: 0,
					content: '',
				});
				const updatedNote = { ...note, blocks: [createdBlock] };
				await db.notesPut(updatedNote);
				const currentNotes = store.getNotes();
				store.setNotes([updatedNote, ...currentNotes]);
				const activeNote = {
					ID: note.ID,
					title: note.title,
					breadcrumb: note.title,
					text: '',
				};
				await this._setActiveNoteState(activeNote);
				store.setActiveBlocks([createdBlock]);
				store.setPendingFocus(createdBlock.id, 'start');
				return note;
			} catch (error) {
				console.warn(`[noteService] Network failed, queueing create request`);
				if (handleAuthError(error)) throw error;
				await db.notesPut(localNote);
				const currentNotes = store.getNotes();
				store.setNotes([localNote, ...currentNotes]);
				const activeNote = {
					ID: localNoteId,
					title: localNote.title,
					breadcrumb: localNote.title,
					text: '',
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
		const activeNote = {
			ID: localNoteId,
			title: localNote.title,
			breadcrumb: localNote.title,
			text: '',
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
	},

	async deleteNoteRecursive(noteID: string | number): Promise<void> {
		const allNotes = store.getNotes();
		const subnotes = allNotes.filter((note) => note.parent_id === noteID);
		for (const subnote of subnotes) {
			await this.deleteNoteRecursive(subnote.ID);
		}
		await this.deleteNote(noteID);
	},

	async deleteNote(noteID: string | number): Promise<void> {
		const isOnline = store.getOnline();
		const isLocal = this._isLocalNote(noteID);
		const note = store.getNotes().find((n) => n.ID === noteID);
		if (note?.parent_id) {
			await this.deleteSubnoteBlockFromParent(noteID, note.parent_id);
		}
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
		await db.notesDelete(noteID);
		await db.imagesDeleteByNoteId?.(noteID);
		await db.formattingDeleteByNoteId?.(noteID);
		await db.recentNotesDelete(noteID);
		const currentNotes = store.getNotes();
		const remainingNotes = currentNotes.filter((note) => note.ID !== noteID);
		store.setNotes(remainingNotes);
		store.loadRecentNotes();
		const activeNoteId = store.getActiveNoteId();
		if (activeNoteId === noteID) {
			if (remainingNotes.length > 0) {
				await this.getNote(remainingNotes[0].ID);
			} else {
				store.setActiveNote(null);
				store.setActiveBlocks([]);
				store.setActiveNoteId(null);
				await db.settingsSet('activeNoteId', null);
			}
		}
	},

	async deleteSubnoteBlockFromParent(
		subnoteId: string | number,
		parentNoteId: string | number,
	): Promise<void> {
		const parentNote = store.getNotes().find((n) => n.ID === parentNoteId);
		if (!parentNote || !parentNote.blocks) return;
		const referenceBlock = parentNote.blocks.find(
			(block) => block.block_type_id === 5 && block.content === subnoteId,
		);
		if (referenceBlock) {
			await this.deleteBlock(parentNoteId, referenceBlock.id);
		}
	},

	async updateNote(
		noteID: string | number,
		data: Partial<Note>,
	): Promise<Note | null> {
		const isOnline = store.getOnline();
		const isLocal = this._isLocalNote(noteID);
		const oldNote = store.getNotes().find((n) => n.ID === noteID);
		const oldTitle = oldNote?.title || '';
		
		if (isOnline && !isLocal) {
			try {
				const result = await client.put<NoteApiResponse>(
					`/notes/${noteID}`,
					data,
				);
				const currentNote = store.getNotes().find((n) => n.ID === noteID);
				const note: Note = {
					ID: result.id,
					title: result.title,
					icon: null,
					updatedAt: result.updated_at || Date.now(),
					parent_id: result.parent_id ?? currentNote?.parent_id ?? null,
					blocks: currentNote?.blocks || [],
					is_public: (result as any).is_public ?? currentNote?.is_public ?? false,
				};
				await db.notesPut(note);
				const currentNotes = store.getNotes();
				const updatedNotes = currentNotes.map((n) =>
					n.ID === noteID ? note : n,
				);
				store.setNotes(updatedNotes);
				if (data.title && data.title !== oldTitle) {
					await this.updateRecentNotesTitle(noteID, data.title);
				}
				if (store.getActiveNoteId() === noteID) {
					const activeNote = {
						ID: note.ID,
						title: note.title,
						breadcrumb: note.title,
						text: store.getActiveNote()?.text || '',
						parent_id: note.parent_id || null,
					};
					store.setActiveNote(activeNote);
				}
				return note;
			} catch (error) {
				console.warn(`[noteService] Network failed, queueing update request`);
				if (handleAuthError(error)) {
					throw error;
				}
				await queueService.enqueueRequest({
					method: 'PUT',
					endpoint: `/notes/${noteID}`,
					body: data,
				});
			}
		} else if (!isOnline && !isLocal) {
			await queueService.enqueueRequest({
				method: 'PUT',
				endpoint: `/notes/${noteID}`,
				body: data,
			});
		}
		const currentNotes = store.getNotes();
		const noteIndex = currentNotes.findIndex((n) => n.ID === noteID);
		if (noteIndex !== -1) {
			const updatedNote = {
				...currentNotes[noteIndex],
				...data,
				updatedAt: Date.now(),
				parent_id: currentNotes[noteIndex].parent_id ?? null,
				is_public: currentNotes[noteIndex].is_public ?? false,
			};
			await db.notesPut(updatedNote);
			const updatedNotes = [...currentNotes];
			updatedNotes[noteIndex] = updatedNote;
			store.setNotes(updatedNotes);
			if (data.title && data.title !== oldTitle) {
				await this.updateRecentNotesTitle(noteID, data.title);
			}
			if (store.getActiveNoteId() === noteID) {
				const activeNote = {
					ID: updatedNote.ID,
					title: updatedNote.title,
					breadcrumb: updatedNote.title,
					text: store.getActiveNote()?.text || '',
					parent_id: updatedNote.parent_id || null,
				};
				store.setActiveNote(activeNote);
			}
			return updatedNote;
		}
		return null;
	},

	async updateRecentNotesTitle(
		subnoteId: string | number,
		newTitle: string,
	): Promise<void> {
		const recentNotes = await db.recentNotesGetAll();
		const updatedRecent = recentNotes.map((item) =>
			item.noteId === subnoteId ? { ...item, title: newTitle } : item,
		);
		for (const item of updatedRecent) {
			await db.recentNotesPut(item);
		}
		await store.loadRecentNotes();
	},

	async getBlocks(noteID: string | number): Promise<Block[]> {
		const isOnline = store.getOnline();
		if (isOnline) {
			try {
				const data = await client.get<GetNoteResponse>(`/notes/${noteID}`);
				const blocks = data.blocks || [];
				await db.notesPut({
					ID: data.note.id,
					title: data.note.title,
					icon: null,
					blocks: blocks,
					updatedAt: data.note.updated_at,
				});
				for (const block of blocks) {
					if (block.formatting) {
						await db.formattingPut({
							blockId: block.id,
							noteId: noteID,
							formatting: block.formatting,
							updatedAt: Date.now(),
							synced: true,
						});
					}
				}
				store.setActiveBlocks(blocks);
				return blocks;
			} catch (error) {
				console.warn('[noteService] Network failed, using cache');
				handleAuthError(error);
			}
		}
		const cachedNote = await db.notesGet(noteID);
		const blocks = cachedNote?.blocks || [];
		const formattingMap = await db.formattingGetByNoteId(noteID);
		const blocksWithFormatting: Block[] = blocks.map((block) => ({
			...block,
			formatting: formattingMap[block.id]
				? { ranges: formattingMap[block.id] }
				: block.formatting || null,
		}));
		store.setActiveBlocks(blocksWithFormatting);
		return blocks;
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
		store.setActiveBlocks(shifted);
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
	): Promise<Block> {
		const note = store.getNotes().find(n => n.ID === noteID);
   		const isPublic = (note as any)?.is_public === true;
		const isOnline = store.getOnline();
		const localBlock: Block = {
			...blockData,
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
				await this._updateCachedBlocksWithPosition(noteID, block, 'add');
				return block;
			} catch (error) {
				console.log(error);
				console.warn(
					`[noteService] Network failed, queueing create block request`,
				);
				if (handleAuthError(error)) {
					throw error;
				}
				await queueService.enqueueRequest({
					method: 'POST',
					endpoint: `/notes/${noteID}/blocks`,
					body: blockData,
					localId: localBlock.id as string,
				});
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
			store.setActiveBlocks(updated);
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
		}
		await queueService.enqueueRequest({
			method: 'POST',
			endpoint: `/notes/${noteID}/blocks`,
			body: blockData,
			localId: localBlock.id as string,
		});
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
		store.setActiveBlocks(updatedActiveBlocks);
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
		return block;
	},

	async deleteBlock(
		noteID: string | number,
		blockID: string | number,
	): Promise<void> {
		const note = store.getNotes().find(n => n.ID === noteID);
    	const isPublic = (note as any)?.is_public === true;
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
			await this._updateCachedBlocksWithPosition(noteID, { id: blockID } as Block, 'delete');
			return;
		}if (isOnline && !isLocal) {
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

	async getBlockFormatting(
		noteId: string | number,
		blockId: string | number,
	): Promise<FormattingRange[]> {
		const isOnline = store.getOnline();
		const isLocal = String(blockId).startsWith('local-');
		const cachedFormatting = await db.formattingGet(blockId);
		if (cachedFormatting?.formatting?.ranges) {
			return cachedFormatting.formatting.ranges;
		}
		if (isOnline && !isLocal) {
			try {
				const { ranges = [] } = await client.get<{ ranges: FormattingRange[] }>(
					`/notes/${noteId}/blocks/${blockId}/formatting`,
				);
				if (ranges.length > 0) {
					await db.formattingPut({
						blockId: blockId,
						noteId: noteId,
						formatting: { ranges },
						synced: true,
						updatedAt: Date.now(),
					});
				}
				return ranges;
			} catch (error) {
				console.warn(
					'[noteService] Failed to fetch formatting from server:',
					error,
				);
				return [];
			}
		}
		return [];
	},

	async resetBlockFormatting(
		noteId: string | number,
		blockId: string | number,
	): Promise<{ block_id: string | number; ranges: [] }> {
		const isOnline = store.getOnline();
		const isLocal = String(blockId).startsWith('local-');
		const endpoint = `/notes/${noteId}/blocks/${blockId}/formatting`;
		await db.formattingDelete(blockId);
		if (isOnline && !isLocal) {
			try {
				const result = await client.delete<{
					block_id: string | number;
					ranges: [];
				}>(endpoint);
				return result;
			} catch (error) {
				console.warn(
					`[noteService] Request failed (${error}), queueing formatting reset request`,
				);
				await queueService.enqueueRequest({ method: 'DELETE', endpoint });
			}
		} else {
			await queueService.enqueueRequest({ method: 'DELETE', endpoint });
		}
		return { block_id: blockId, ranges: [] };
	},

	async getAllFormattingForNote(
		noteId: string | number,
	): Promise<Record<string, FormattingRange[]>> {
		const isOnline = store.getOnline();
		const cachedFormatting = await db.formattingGetByNoteId(noteId);
		if (isOnline) {
			try {
				const data = await client.get<GetNoteResponse>(`/notes/${noteId}`);
				const blocks = data.blocks || [];
				for (const block of blocks) {
					if (block.formatting) {
						await db.formattingPut({
							blockId: block.id,
							noteId: noteId,
							formatting: block.formatting,
							synced: true,
							updatedAt: Date.now(),
						});
					}
				}
				const formattingMap: Record<string, FormattingRange[]> = {};
				blocks.forEach((block) => {
					if (block.formatting?.ranges) {
						formattingMap[block.id] = block.formatting.ranges;
					}
				});
				return formattingMap;
			} catch (error) {
				console.warn(
					'[noteService] Failed to fetch formatting from server, using cache:',
					error,
				);
			}
		}
		return cachedFormatting;
	},
};
