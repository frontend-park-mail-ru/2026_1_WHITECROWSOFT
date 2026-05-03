import { client } from '../client/client.js';
import { db } from '../db.js';
import { store } from '../store.js';
import type { Block, Note } from '../types.js';
import { handleAuthError } from '../utils/handleAuthError.js';
import { noteService } from './noteService.js';
import { queueService } from './requestQueueService.js';

interface SubnoteResponse {
	id: string | number;
	user_id: string | number;
	title: string;
	parent_id: string | number | null;
	is_public: boolean;
	created_at: string;
	updated_at: string;
}

interface CreateSubnoteData {
	title: string;
	content?: string;
	parent_id: string | number | null;
}

interface CreateSubnoteBlockData {
	note_id: string | number;
	block_type_id: number;
	position: number;
	content: string;
	subnote_id: string | number;
}

export const subnoteService = {
	async createSubnote(
		parentNoteId: string | number,
		data: CreateSubnoteData,
	): Promise<Note> {
		const isOnline = store.getOnline();
		const localSubnoteId = `local-subnote-${Date.now()}`;
		if (isOnline) {
			try {
				const result = await client.post<SubnoteResponse>(
					`/notes/${parentNoteId}/subnote`,
					data,
				);
				const subnote: Note = {
					ID: result.id,
					title: result.title,
					parent_id: parentNoteId,
					icon: null,
					updatedAt: result.updated_at || Date.now(),
					blocks: [],
				};
				const currentNotes = store.getNotes();
				store.setNotes([subnote, ...currentNotes]);
				db.notesPut(subnote);
				return subnote;
			} catch (error) {
				console.warn(
					`[subnoteService] Network failed, queueing create request`,
				);
				if (handleAuthError(error)) throw error;
				const localSubnote: Note = {
					...data,
					ID: localSubnoteId,
					parent_id: parentNoteId,
					isLocal: true,
					icon: null,
					updatedAt: Date.now(),
					blocks: [],
				};
				await db.notesPut(localSubnote);
				await queueService.enqueueRequest({
					method: 'POST',
					endpoint: `/notes/${parentNoteId}/subnote`,
					body: data,
					localId: localSubnoteId,
				});
				return localSubnote;
			}
		}
		const localSubnote: Note = {
			...data,
			ID: localSubnoteId,
			parent_id: parentNoteId,
			isLocal: true,
			icon: null,
			updatedAt: Date.now(),
			blocks: [],
		};
		await db.notesPut(localSubnote);
		const currentNotes = store.getNotes();
		store.setNotes([localSubnote, ...currentNotes]);
		await queueService.enqueueRequest({
			method: 'POST',
			endpoint: `/notes/${parentNoteId}/subnote`,
			body: data,
			localId: localSubnoteId,
		});
		return localSubnote;
	},

	async getSubnotes(parentNoteId: string | number): Promise<Note[]> {
		const isOnline = store.getOnline();
		if (isOnline) {
			try {
				const response = await client.get<Note[]>(
					`/notes/${parentNoteId}/subnote`,
				);
				const subnotes = response || [];
				for (const subnote of subnotes) {
					await db.notesPut(subnote);
				}
				return subnotes;
			} catch (error) {
				console.warn('[subnoteService] Network failed, using cache');
				handleAuthError(error);
			}
		}
		const allNotes = await db.notesGetAll();
		const cachedSubnotes = allNotes.filter(
			(note) => note.parent_id === parentNoteId,
		);
		return cachedSubnotes;
	},

	async deleteSubnote(
		parentNoteId: string | number,
		subnoteId: string | number,
	): Promise<void> {
		const isOnline = store.getOnline();
		const isLocal = String(subnoteId).startsWith('local-subnote');
		if (isOnline && !isLocal) {
			try {
				await client.delete(`/notes/${parentNoteId}/subnote/${subnoteId}`);
			} catch (error) {
				console.warn(
					`[subnoteService] Network failed, queueing delete request`,
				);
				if (handleAuthError(error)) throw error;
				await queueService.enqueueRequest({
					method: 'DELETE',
					endpoint: `/notes/${parentNoteId}/subnote/${subnoteId}`,
					body: null,
				});
			}
		} else if (!isOnline && !isLocal) {
			await queueService.enqueueRequest({
				method: 'DELETE',
				endpoint: `/notes/${parentNoteId}/subnote/${subnoteId}`,
				body: null,
			});
		}
		await db.notesDelete(subnoteId);
		const parentNote = await db.notesGet(parentNoteId);
		if (parentNote?.blocks) {
			const updatedBlocks = parentNote.blocks.filter(
				(block) =>
					!(block.block_type_id === 5 && block.subnote_id === subnoteId),
			);
			await db.notesPut({ ...parentNote, blocks: updatedBlocks });
		}
	},

	async getSubnote(subnoteId: string | number): Promise<Note | null> {
		const isOnline = store.getOnline();
		if (isOnline) {
			try {
				const subnote = await client.get<Note>(`/notes/${subnoteId}`);
				if (subnote) {
					await db.notesPut(subnote);
				}
				return subnote;
			} catch (error) {
				console.warn('[subnoteService] Network failed, using cache');
				handleAuthError(error);
			}
		}
		return (await db.notesGet(subnoteId)) || null;
	},

	async createSubnoteBlock(
		parentNoteId: string | number,
		subnoteId: string | number,
		subnoteTitle: string,
		afterBlockId: string | null = null,
	): Promise<Block | null> {
		const isOnline = store.getOnline();
		if (isOnline) {
			return await this._createSubnoteBlockOnline(
				parentNoteId,
				subnoteId,
				subnoteTitle,
				afterBlockId,
			);
		} else {
			return await this._createSubnoteBlockOffline(
				parentNoteId,
				subnoteId,
				subnoteTitle,
				afterBlockId,
			);
		}
	},

	async _createSubnoteBlockOnline(
		parentNoteId: string | number,
		subnoteId: string | number,
		subnoteTitle: string,
		afterBlockId: string | null = null,
	): Promise<Block | null> {
		const blocks = store.getActiveBlocks();
		const sortedBlocks = [...blocks].sort((a, b) => a.position - b.position);
		let insertIndex: number;
		if (afterBlockId) {
			const afterIndex = sortedBlocks.findIndex(
				(b) => String(b.id) === afterBlockId,
			);
			insertIndex = afterIndex + 1;
		} else {
			insertIndex = sortedBlocks.length;
		}
		const shiftedBlocks = sortedBlocks.map((block, idx) => {
			if (idx >= insertIndex) {
				return { ...block, position: idx + 1 };
			}
			return { ...block, position: idx };
		});
		store.setActiveBlocks(shiftedBlocks);
		const cachedNote = await db.notesGet(parentNoteId);
		if (cachedNote) {
			const updatedBlocks = shiftedBlocks;
			await db.notesPut({ ...cachedNote, blocks: updatedBlocks });
		}
		const blockData: CreateSubnoteBlockData = {
			note_id: parentNoteId,
			block_type_id: 5,
			position: insertIndex,
			content: subnoteId.toString(),
			subnote_id: subnoteId,
		};
		try {
			const createdBlock = await noteService.createBlock(
				parentNoteId,
				blockData,
			);
			await noteService.updateBlockContent(
				parentNoteId,
				createdBlock.id,
				subnoteId.toString(),
			);
			return createdBlock;
		} catch (error) {
			console.error('Failed to create subnote block online:', error);
			return null;
		}
	},

	async _createSubnoteBlockOffline(
		parentNoteId: string | number,
		subnoteId: string | number,
		subnoteTitle: string,
		afterBlockId: string | null = null,
	): Promise<Block> {
		let newPosition: number;
		const blocks = store.getActiveBlocks();
		const sortedBlocks = [...blocks].sort((a, b) => a.position - b.position);
		if (afterBlockId) {
			const afterIndex = sortedBlocks.findIndex(
				(b) => String(b.id) === afterBlockId,
			);
			if (afterIndex !== -1) {
				newPosition = afterIndex + 1;
			} else {
				newPosition = sortedBlocks.length;
			}
		} else {
			newPosition = sortedBlocks.length;
		}
		const localBlockId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const localBlock: Block = {
			id: localBlockId,
			note_id: parentNoteId,
			block_type_id: 5,
			position: newPosition,
			content: JSON.stringify({
				subnoteId: subnoteId,
				title: subnoteTitle,
			}),
			subnote_id: subnoteId,
			formatting: { ranges: [] },
			isLocal: true,
		};
		const cachedNote = await db.notesGet(parentNoteId);
		if (cachedNote) {
			const currentBlocks = cachedNote.blocks || [];
			const updatedBlocks = [...currentBlocks, localBlock];
			updatedBlocks.sort((a, b) => a.position - b.position);
			await db.notesPut({ ...cachedNote, blocks: updatedBlocks });
		}
		await queueService.enqueueRequest({
			method: 'POST',
			endpoint: `/notes/${parentNoteId}/blocks`,
			localId: localBlockId,
			body: {
				note_id: parentNoteId,
				block_type_id: 5,
				position: newPosition,
				content: JSON.stringify({
					subnoteId: subnoteId,
					title: subnoteTitle,
				}),
				subnote_id: subnoteId,
			},
		});
		return localBlock;
	},
};
