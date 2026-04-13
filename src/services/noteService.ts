import { client } from '../client/client.js';
import { db } from '../db.js';
import { store } from '../store.js';
import type {
	Block,
	BlockApiResponse,
	FormattingRange,
	Note,
} from '../types.js';
import { queueService } from './requestQueueService.js';

interface GetNoteResponse {
	note: {
		id: string | number;
		title: string;
		updated_at: string;
	};
	blocks: Block[];
}

interface CreateNoteData {
	title: string;
	content?: string;
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
				const response = await client.get<{ notes: any[]; total?: number }>(
					'/notes',
				);
				// Сервер возвращает { notes: [...], total: ... }
				const notesArray = response.notes || [];

				const notes: Note[] = notesArray.map((note: any) => ({
					ID: note.id, // id с маленькой буквы от сервера -> ID с большой для базы
					title: note.title,
					icon: null,
					updatedAt: note.updated_at || Date.now(),
				}));

				await db.notesClear();
				for (const note of notes) {
					if (note.ID) {
						// Проверяем, что ID существует
						await db.notesPut(note);
					}
				}

				store.setNotes(notes);
				return notes;
			} catch (error) {
				console.warn('[noteService] Network failed, using cache');
				console.error('[noteService] Error fetching notes:', error);
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
				const data = await client.get<any>(`/notes/${noteID}`);
				// Сервер возвращает { note: {...}, blocks: [...] }
				const serverNote = data.note;
				const serverBlocks = data.blocks || [];

				// Сохраняем в базу
				await db.notesPut({
					ID: serverNote.id,
					title: serverNote.title,
					icon: null,
					blocks: serverBlocks,
					updatedAt: serverNote.updated_at,
				});

				// Сохраняем форматирование блоков
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

				return {
					note: serverNote,
					blocks: serverBlocks,
				};
			} catch (error) {
				console.warn('[noteService] Network failed, using cache');
				console.error('[noteService] Error fetching note:', error);
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
			return {
				note: {
					id: cachedNote.ID,
					title: cachedNote.title,
					updated_at:
						typeof cachedNote.updatedAt === 'string'
							? cachedNote.updatedAt
							: new Date(cachedNote.updatedAt).toISOString(),
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
		const localNote: Note = {
			...data,
			ID: `local-${Date.now()}`,
			isLocal: true,
			icon: null,
			updatedAt: Date.now(),
		};

		if (isOnline) {
			try {
				const result = await client.post<any>('/notes', data);
				// Сервер возвращает { id, title, ... }
				const note: Note = {
					ID: result.id,
					title: result.title,
					icon: null,
					updatedAt: result.updated_at || result.UpdatedAt || Date.now(),
				};
				await db.notesPut(note);
				const currentNotes = store.getNotes();
				store.setNotes([note, ...currentNotes]);

				const activeNote = {
					ID: note.ID,
					title: note.title,
					breadcrumb: note.title,
					text: '',
				};
				await this._setActiveNoteState(activeNote);
				store.setActiveBlocks([]);
				return note;
			} catch (error) {
				console.warn(
					`[noteService] Network failed (${error}), queueing create request`,
				);
				await queueService.enqueueRequest({
					method: 'POST',
					endpoint: '/notes',
					body: data,
					localId: localNote.ID as string,
				});
			}
		}

		await db.notesPut(localNote);
		const currentNotes = store.getNotes();
		store.setNotes([localNote, ...currentNotes]);

		const activeNote = {
			ID: localNote.ID,
			title: localNote.title,
			breadcrumb: localNote.title,
			text: '',
		};
		await this._setActiveNoteState(activeNote);
		store.setActiveBlocks([]);

		if (!isOnline) {
			await queueService.enqueueRequest({
				method: 'POST',
				endpoint: '/notes',
				body: data,
				localId: localNote.ID as string,
			});
		}
		return localNote;
	},

	// Остальные методы остаются без изменений...
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
		const currentNotes = store.getNotes();
		const remainingNotes = currentNotes.filter((note) => note.ID !== noteID);
		store.setNotes(remainingNotes);

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

	async updateNote(
		noteID: string | number,
		data: Partial<Note>,
	): Promise<Note | null> {
		const isOnline = store.getOnline();
		const isLocal = this._isLocalNote(noteID);

		if (isOnline && !isLocal) {
			try {
				const result = await client.put<any>(`/notes/${noteID}`, data);
				const note: Note = {
					ID: result.id,
					title: result.title,
					icon: null,
					updatedAt: result.updated_at || Date.now(),
				};
				await db.notesPut(note);
				const currentNotes = store.getNotes();
				const updatedNotes = currentNotes.map((n) =>
					n.ID === noteID ? note : n,
				);
				store.setNotes(updatedNotes);

				if (store.getActiveNoteId() === noteID) {
					const activeNote = {
						ID: note.ID,
						title: note.title,
						breadcrumb: note.title,
						text: store.getActiveNote()?.text || '',
					};
					store.setActiveNote(activeNote);
				}

				return note;
			} catch (error) {
				console.warn(
					`[noteService] Network failed (${error}), queueing update request`,
				);
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
			};
			await db.notesPut(updatedNote);
			const updatedNotes = [...currentNotes];
			updatedNotes[noteIndex] = updatedNote;
			store.setNotes(updatedNotes);

			if (store.getActiveNoteId() === noteID) {
				const activeNote = {
					ID: updatedNote.ID,
					title: updatedNote.title,
					breadcrumb: updatedNote.title,
					text: store.getActiveNote()?.text || '',
				};
				store.setActiveNote(activeNote);
			}

			return updatedNote;
		}

		return null;
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
				console.error('[noteService] Error fetching blocks:', error);
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

	async createBlock(
		noteID: string | number,
		blockData: CreateBlockData,
	): Promise<Block> {
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
				await this._updateCachedBlocks(noteID, block, 'add');
				store.setActiveBlocks([...store.getActiveBlocks(), block]);
				return block;
			} catch (error) {
				console.warn(
					`[noteService] Network failed (${error}), queueing create block request`,
				);
				await queueService.enqueueRequest({
					method: 'POST',
					endpoint: `/notes/${noteID}/blocks`,
					body: blockData,
					localId: localBlock.id as string,
				});
			}
		}

		await this._updateCachedBlocks(noteID, localBlock, 'add');
		const currentBlocks = store.getActiveBlocks();
		store.setActiveBlocks([...currentBlocks, localBlock]);
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
		await this._updateCachedBlocks(noteID, block, 'update');
		const blocks = store.getActiveBlocks();
		store.setActiveBlocks(
			blocks.map((b) =>
				b.id === blockID ? { ...b, content, updatedAt: Date.now() } : b,
			),
		);
		return block;
	},

	async moveBlock(
		noteID: string | number,
		blockID: string | number,
		newPosition: number,
	): Promise<Block> {
		const isOnline = store.getOnline();
		const isLocal = String(blockID).startsWith('local-');
		store.reorderBlocks(blockID, newPosition);

		if (isOnline && !isLocal) {
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
				await this._updateCachedBlocks(noteID, block, 'update');
				return block;
			} catch (error) {
				console.warn(
					`[noteService] Network failed (${error}), queueing block move request`,
				);
				await queueService.enqueueRequest({
					method: 'PUT',
					endpoint: `/notes/${noteID}/blocks/${blockID}/move`,
					body: { new_position: newPosition },
				});
			}
		} else if (!isOnline && !isLocal) {
			await queueService.enqueueRequest({
				method: 'PUT',
				endpoint: `/notes/${noteID}/blocks/${blockID}/move`,
				body: { new_position: newPosition },
			});
		}

		const existingBlocks = store.getActiveBlocks();
		const existingBlock = existingBlocks.find((b) => b.id === blockID);
		const block: Block = {
			id: blockID,
			block_type_id: existingBlock?.block_type_id || 0,
			content: existingBlock?.content || '',
			position: newPosition,
			formatting: existingBlock?.formatting || null,
		};
		await this._updateCachedBlocks(noteID, block, 'update');
		return block;
	},

	async deleteBlock(
		noteID: string | number,
		blockID: string | number,
	): Promise<void> {
		const isOnline = store.getOnline();
		const isLocal = String(blockID).startsWith('local-');

		if (isOnline && !isLocal) {
			try {
				await client.delete(`/notes/${noteID}/blocks/${blockID}`);
			} catch (error) {
				console.warn(
					`[noteService] Network failed (${error}), queueing block deletion request`,
				);
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

		await this._updateCachedBlocks(noteID, { id: blockID } as Block, 'delete');
		const currentBlocks = store.getActiveBlocks();
		const updatedBlocks = currentBlocks.filter((b) => b.id !== blockID);
		store.setActiveBlocks(updatedBlocks);
	},

	async _updateCachedBlocks(
		noteID: string | number,
		block: Block,
		action: 'add' | 'update' | 'delete',
	): Promise<void> {
		const cachedNote = await db.notesGet(noteID);
		if (!cachedNote) return;
		let blocks = cachedNote.blocks || [];
		if (action === 'add') {
			blocks.push(block);
		} else if (action === 'update') {
			blocks = blocks.map((b) =>
				b.id === block.id ? { ...b, ...block, updatedAt: Date.now() } : b,
			);
		} else if (action === 'delete') {
			blocks = blocks.filter((b) => b.id !== block.id);
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
				await queueService.enqueueRequest({
					method: 'PUT',
					endpoint,
					body: payload,
				});
				await this._saveFormattingToCache(noteId, blockId, payload, false);
			}
		} else {
			await queueService.enqueueRequest({
				method: 'PUT',
				endpoint,
				body: payload,
			});
			await this._saveFormattingToCache(noteId, blockId, payload, false);
		}
		return { block_id: blockId, ranges: [payload] };
	},

	async _saveFormattingToCache(
		noteId: string | number,
		blockId: string | number,
		formatting: FormattingPayload,
		synced: boolean = false,
	): Promise<void> {
		try {
			const existing = await db.formattingGet(blockId);
			let ranges = existing?.formatting?.ranges || [];
			const rangeIndex = ranges.findIndex(
				(r: FormattingRange) =>
					r.start_pos === formatting.start_pos &&
					r.end_pos === formatting.end_pos,
			);
			if (rangeIndex !== -1) {
				ranges[rangeIndex] = formatting as FormattingRange;
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
