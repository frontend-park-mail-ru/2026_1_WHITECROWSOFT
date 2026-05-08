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

export const subnoteService = {
	async createSubnoteWithBlock(
		parentNoteId: string | number,
		title: string,
		afterBlockId: string | null = null,
	): Promise<{ subnote: Note; block: Block | null }> {
		const isOnline = store.getOnline();
		
		if (isOnline) {
			return await this._createOnline(parentNoteId, title, afterBlockId);
		} else {
			return await this._createOffline(parentNoteId, title, afterBlockId);
		}
	},

	async _createOnline(
		parentNoteId: string | number,
		title: string,
		afterBlockId: string | null = null,
	): Promise<{ subnote: Note; block: Block | null }> {
		const subnoteResult = await client.post<SubnoteResponse>(
			`/notes/${parentNoteId}/subnote`,
			{ title, parent_id: parentNoteId }
		);
		
		const subnote: Note = {
			ID: subnoteResult.id,
			title: subnoteResult.title,
			parent_id: parentNoteId,
			icon: null,
			updatedAt: subnoteResult.updated_at || Date.now(),
			blocks: [],
		};
		const createdBlock = await noteService.createBlock(subnote.ID, {
			note_id: subnote.ID,
			block_type_id: 1,
			position: 0,
			content: '',
		});
		const updatedNote = { ...subnote, blocks: [createdBlock] };
		await db.notesPut(updatedNote);
		const storeNotes = store.getNotes();
		store.setNotes([updatedNote, ...storeNotes]);
		const activeNote = {
			ID: subnote.ID,
			title: subnote.title,
			breadcrumb: subnote.title,
			text: '',
		};
		await noteService._setActiveNoteState(activeNote);
		store.setActiveBlocks([createdBlock]);
		store.setPendingFocus(createdBlock.id, 'start');
		this._createParentBlockInBackground(parentNoteId, subnote.ID, afterBlockId);
		return { subnote, block: null };
	},

	async _createParentBlockInBackground(
		parentNoteId: string | number,
		subnoteId: string | number,
		afterBlockId: string | null = null,
	): Promise<void> {
		try {
			const parentNote = store.getNotes().find(n => n.ID === parentNoteId);
			if (!parentNote) return;
			const currentBlocks = parentNote.blocks || [];
			const sortedBlocks = [...currentBlocks].sort((a, b) => a.position - b.position);
			let insertIndex: number;
			if (afterBlockId) {
				const afterIndex = sortedBlocks.findIndex((b) => String(b.id) === afterBlockId);
				insertIndex = afterIndex + 1;
			} else {
				insertIndex = sortedBlocks.length;
			}
			const blockData = {
				note_id: parentNoteId,
				block_type_id: 5,
				position: insertIndex,
				content: String(subnoteId),
				subnote_id: subnoteId,
			};
			
			const createdBlock = await client.post<{
				id: string | number;
				block_type_id: number;
				content: string;
				position: number;
			}>(`/notes/${parentNoteId}/blocks`, blockData);
			await client.put(`/notes/${parentNoteId}/blocks/${createdBlock.id}/content`, {
				content: String(subnoteId),
			});
			const newBlock: Block = {
				id: createdBlock.id,
				note_id: parentNoteId,
				block_type_id: 5,
				position: insertIndex,
				content: String(subnoteId),
				subnote_id: subnoteId,
				formatting: { ranges: [] },
			};
			const updatedBlocks = [...sortedBlocks, newBlock];
			updatedBlocks.sort((a, b) => a.position - b.position);
			const updatedParentNote: Note = {
				...parentNote,
				blocks: updatedBlocks,
			};
			const updatedNotes = store.getNotes().map(n =>
				n.ID === parentNoteId ? updatedParentNote : n
			);
			store.setNotesSilently(updatedNotes);
			const cachedNote = await db.notesGet(parentNoteId);
			if (cachedNote) {
				await db.notesPut({ ...cachedNote, blocks: updatedBlocks });
			}
		} catch (error) {
			console.error('[SubnoteService] Failed to create parent block:', error);
		}
	},

	async _createOffline(
		parentNoteId: string | number,
		title: string,
		afterBlockId: string | null = null,
	): Promise<{ subnote: Note; block: Block | null }> {
		const localSubnoteId = `local-subnote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const localSubnote: Note = {
			ID: localSubnoteId,
			title: title,
			parent_id: parentNoteId,
			icon: null,
			updatedAt: Date.now(),
			blocks: [],
			isLocal: true,
		};
		await db.notesPut(localSubnote);
		const currentNotes = store.getNotes();
		store.setNotes([localSubnote, ...currentNotes]);
		store.setActiveNoteId(localSubnote.ID);
		await queueService.enqueueRequest({
			method: 'POST',
			endpoint: `/notes/${parentNoteId}/subnote`,
			localId: localSubnoteId,
			type: 'SUBNOTE_WITH_BLOCK_CREATE',
			body: {
				title,
				parent_id: parentNoteId,
				afterBlockId,
			},
		});
		return { subnote: localSubnote, block: null };
	},

	async updateSubnoteTitle(subnoteId: string | number, newTitle: string): Promise<void> {
		const isOnline = store.getOnline();
		const isLocal = String(subnoteId).startsWith('local-');
		
		if (isOnline && !isLocal) {
			try {
				await client.put(`/notes/${subnoteId}`, { title: newTitle });
			} catch (error) {
				await queueService.enqueueRequest({
					method: 'PUT',
					endpoint: `/notes/${subnoteId}`,
					body: { title: newTitle },
				});
			}
		} else {
			await queueService.enqueueRequest({
				method: 'PUT',
				endpoint: `/notes/${subnoteId}`,
				body: { title: newTitle },
			});
		}
		
		const currentNotes = store.getNotes();
		const updatedNotes = currentNotes.map(n =>
			n.ID === subnoteId ? { ...n, title: newTitle } : n
		);
		store.setNotes(updatedNotes);
		
		const cachedSubnote = await db.notesGet(subnoteId);
		if (cachedSubnote) {
			await db.notesPut({ ...cachedSubnote, title: newTitle });
		}
		
		const allNotes = store.getNotes();
		for (const note of allNotes) {
			const subnoteBlocks = (note.blocks || []).filter(
				block => block.block_type_id === 5 && block.subnote_id === subnoteId
			);
			
			for (const block of subnoteBlocks) {
				if (isOnline && !String(block.id).startsWith('local-')) {
					try {
						await client.put(`/notes/${note.ID}/blocks/${block.id}/content`, {
							content: String(subnoteId),
						});
					} catch (error) {
						await queueService.enqueueRequest({
							method: 'PUT',
							endpoint: `/notes/${note.ID}/blocks/${block.id}/content`,
							body: { content: String(subnoteId) },
						});
					}
				} else {
					await queueService.enqueueRequest({
						method: 'PUT',
						endpoint: `/notes/${note.ID}/blocks/${block.id}/content`,
						body: { content: String(subnoteId) },
					});
				}
				
				if (store.getActiveNoteId() === note.ID) {
					const blocks = store.getActiveBlocks();
					const updatedActiveBlocks = blocks.map(b =>
						b.id === block.id ? { ...b, content: String(subnoteId) } : b
					);
					store.setActiveBlocksSilently(updatedActiveBlocks);
				}
			}
		}
	},

	getSubnoteIdFromBlock(block: Block): string | number | null {
		if (block.block_type_id !== 5 || !block.content) {
			return null;
		}
		return block.content;
	},
};
