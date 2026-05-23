import { client } from '../client/client.js';
import { db } from '../db.js';
import { store } from '../store.js';
import type {
	Block,
	BlockApiResponse,
	GetNoteResponse,
	Note,
} from '../types.js';
import { noteService } from './noteService.js';
import { queueService } from './requestQueueService.js';

export interface SubnoteResponse {
	note: {
		id: string | number;
		user_id: string | number;
		title: string;
		parent_id: string | number | null;
		is_public: boolean;
		created_at: string;
		updated_at: string;
	};
	block_id: string | number;
}

interface CreateBlockData {
	note_id: string | number;
	block_type_id: number;
	position: number;
}

export const subnoteService = {
	async createSubnoteWithBlock(
		parentNoteId: string | number,
		title: string,
		afterBlockId: string | null = null,
		silence?: boolean,
	): Promise<{ subnote: Note; block: Block | null }> {
		const isOnline = store.getOnline();

		if (isOnline) {
			return await this._createOnline(
				parentNoteId,
				title,
				afterBlockId,
				silence,
			);
		} else {
			return await this._createOffline(
				parentNoteId,
				title,
				afterBlockId,
				silence,
			);
		}
	},

	async _createOnline(
		parentNoteId: string | number,
		title: string,
		afterBlockId: string | null = null,
		silence?: boolean,
	): Promise<{ subnote: Note; block: Block | null }> {
		const subnoteResult = await client.post<SubnoteResponse>(
			`/notes/${parentNoteId}/subnote`,
			{ title, parent_id: parentNoteId },
		);
		const subnoteData = subnoteResult.note;
		const subnoteBlockId = subnoteResult.block_id;
		const subnote: Note = {
			ID: subnoteData.id,
			title: subnoteData.title,
			parent_id: parentNoteId,
			updatedAt: subnoteData.updated_at || Date.now(),
			blocks: [],
			section: 'personal',
			is_public: subnoteData.is_public || false,
			is_favorite: false,
		};
		const blockData: CreateBlockData = {
			note_id: subnote.ID,
			block_type_id: 1,
			position: 0,
		};
		const data = await client.get<GetNoteResponse>(`/notes/${subnote.ID}`);
		console.log(data);
		const createdBlock = await client.post<BlockApiResponse>(
			`/notes/${subnote.ID}/blocks`,
			blockData,
		);
		const updatedNote = { ...subnote, blocks: [createdBlock] };
		await db.notesPut(updatedNote);
		const storeNotes = store.getNotes();
		if (silence === false) {
			store.setNotes([updatedNote, ...storeNotes]);
		} else {
			store.setNotesSilently([updatedNote, ...storeNotes]);
		}
		const activeNote = {
			ID: subnote.ID,
			title: subnote.title,
			breadcrumb: subnote.title,
			text: '',
			section: subnote.section,
		};
		await noteService._setActiveNoteState(activeNote);
		store.setPendingFocus(createdBlock.id, 'start');
		this._createParentBlockInBackground(
			parentNoteId,
			subnote.ID,
			afterBlockId,
			subnoteBlockId,
		);
		return { subnote, block: null };
	},

	async _createParentBlockInBackground(
		parentNoteId: string | number,
		subnoteId: string | number,
		afterBlockId: string | null = null,
		subnoteBlockId: string | number,
	): Promise<void> {
		try {
			const parentNote = store.getNotes().find((n) => n.ID === parentNoteId);
			if (!parentNote) return;
			const currentBlocks = parentNote.blocks || [];
			const sortedBlocks = [...currentBlocks].sort(
				(a, b) => a.position - b.position,
			);
			let insertIndex: number;
			if (afterBlockId) {
				const afterIndex = sortedBlocks.findIndex(
					(b) => String(b.id) === afterBlockId,
				);
				insertIndex = afterIndex + 1;
			} else {
				insertIndex = sortedBlocks.length;
			}
			await client.put(
				`/notes/${parentNoteId}/blocks/${subnoteBlockId}/content`,
				{
					content: String(subnoteId),
				},
			);
			const newBlock: Block = {
				id: subnoteBlockId,
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
			const updatedNotes = store
				.getNotes()
				.map((n) => (n.ID === parentNoteId ? updatedParentNote : n));
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
		silence?: boolean,
	): Promise<{ subnote: Note; block: Block | null }> {
		const localSubnoteId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const localSubnote: Note = {
			ID: localSubnoteId,
			title: title,
			parent_id: parentNoteId,
			updatedAt: Date.now(),
			blocks: [],
			isLocal: true,
			section: 'personal',
		};
		await db.notesPut(localSubnote);
		const currentnotes = store.getNotes();
		store.setNotesSilently([localSubnote, ...currentnotes]);

		const parentNote = store.getNotes().find((n) => n.ID === parentNoteId);
		let subnoteBlock = null;
		if (parentNote) {
			const currentBlocks = parentNote.blocks || [];
			const sortedBlocks = [...currentBlocks].sort(
				(a, b) => a.position - b.position,
			);

			let insertIndex: number;
			if (afterBlockId) {
				const afterIndex = sortedBlocks.findIndex(
					(b) => String(b.id) === afterBlockId,
				);
				insertIndex = afterIndex + 1;
			} else {
				insertIndex = sortedBlocks.length;
			}

			const localBlockId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
			const newBlock: Block = {
				id: localBlockId,
				note_id: parentNoteId,
				block_type_id: 5,
				position: insertIndex,
				content: String(localSubnoteId),
				subnote_id: localSubnoteId,
				formatting: { ranges: [] },
				isLocal: true,
			};
			subnoteBlock = newBlock;

			const updatedParentBlocks = [...sortedBlocks, newBlock];
			updatedParentBlocks.sort((a, b) => a.position - b.position);
			const updatedParentNote = { ...parentNote, blocks: updatedParentBlocks };
			const updatedNotes = store
				.getNotes()
				.map((n) => (n.ID === parentNoteId ? updatedParentNote : n));
			if (silence === false) {
				store.setNotes(updatedNotes);
			} else {
				store.setNotesSilently(updatedNotes);
			}
			await db.notesPut(updatedParentNote);
		}

		const activeNote = {
			ID: localSubnoteId,
			title: localSubnote.title,
			breadcrumb: localSubnote.title,
			text: '',
			section: localSubnote.section,
		};
		await noteService._setActiveNoteState(activeNote);
		store.setActiveBlocksSilently([]);

		await queueService.enqueueRequest({
			method: 'POST',
			endpoint: `/notes/${parentNoteId}/subnote`,
			localId: localSubnoteId,
			type: 'SUBNOTE_CREATE',
			body: {
				title,
				parent_id: parentNoteId,
				afterBlockId,
				localBlockId: subnoteBlock?.id,
			},
		});

		if (subnoteBlock) {
			await queueService.enqueueRequest({
				method: 'PUT',
				endpoint: `/notes/${parentNoteId}/blocks/${subnoteBlock.id}/content`,
				body: {
					content: String(localSubnoteId),
				},
			});
		}

		const blockSubnote = await noteService.createBlock(localSubnoteId, {
			note_id: localSubnoteId,
			block_type_id: 1,
			position: 0,
		});
		store.setActiveBlocksSilently([blockSubnote]);

		return { subnote: localSubnote, block: blockSubnote };
	},

	async updateSubnoteTitle(
		subnoteId: string | number,
		newTitle: string,
	): Promise<void> {
		const isOnline = store.getOnline();
		const isLocal = String(subnoteId).startsWith('local-');

		if (isOnline && !isLocal) {
			try {
				await client.put(`/notes/${subnoteId}`, { title: newTitle });
			} catch {
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
		const updatedNotes = currentNotes.map((n) =>
			n.ID === subnoteId ? { ...n, title: newTitle } : n,
		);
		store.setNotes(updatedNotes);

		const cachedSubnote = await db.notesGet(subnoteId);
		if (cachedSubnote) {
			await db.notesPut({ ...cachedSubnote, title: newTitle });
		}

		const allNotes = store.getNotes();
		for (const note of allNotes) {
			const subnoteBlocks = (note.blocks || []).filter(
				(block) => block.block_type_id === 5 && block.subnote_id === subnoteId,
			);

			for (const block of subnoteBlocks) {
				if (isOnline && !String(block.id).startsWith('local-')) {
					try {
						await client.put(`/notes/${note.ID}/blocks/${block.id}/content`, {
							content: String(subnoteId),
						});
					} catch {
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
					const updatedActiveBlocks = blocks.map((b) =>
						b.id === block.id ? { ...b, content: String(subnoteId) } : b,
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
