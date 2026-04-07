import { client } from '../client/client.js';
import { db } from '../db.js';
import { store } from '../store.js';
import { queueService } from './requestQueueService.js';
import { applyFormattingToElement } from '../utils/formattingUtils.js';

/**
 * Сервис для работы с заметками
 * @namespace noteService
 */
export const noteService = {
	/**
	 * Получает список всех заметок пользователя
	 * @async
	 * @returns {Promise<Array|null>} список заметок или null при ошибке
	 */
	async getNotes() {
		const isOnline = store.getOnline();
		if (isOnline) {
			await queueService.flushQueue();
			try {
				const data = await client.get('/notes');
				const notes = (data.notes || data || []).map(note => ({
					ID: note.id,
					title: note.title,
					icon: null,
					updatedAt: note.updated_at,
				}));

				await db.notesClear();
				for (const note of notes) {
					await db.notesPut(note);
				}

				store.setNotes(notes);
				return notes;
			} catch(error) {
				console.warn('[noteService] Network failed, using cache');
				console.error('[noteService] Error fetching notes:', error);
			}
		}

		const cachedNotes = await db.notesGetAll();
		store.setNotes(cachedNotes);
		return cachedNotes;
		
	},

	/**
	 * Получает конкретную заметку по ID
	 * @async
	 * @param {string} noteID - идентификатор заметки
	 * @returns {Promise<Object|null>} данные заметки или null при ошибке
	 */
	async getNote(noteID) {
		const isOnline = store.getOnline();
		if (isOnline) {
			try {
				const data = await client.get(`/notes/${noteID}`);
				await db.notesPut({
					ID: data.note.id,
					title: data.note.title,
					blocks: data.blocks,
					updatedAt: data.note.updated_at,
				});

				const activeNote = {
					ID: data.note.id,
					title: data.note.title,
					breadcrumb: data.note.title,
					text: data.blocks.map(b => b.content).join('\n\n') ?? '',
				}

				store.setActiveNote(activeNote);
				store.setActiveNoteId(noteID);
				store.setActiveBlocks(data.blocks || []);
				await db.settingsSet('activeNoteId', noteID);
				return data;
			} catch(error) {
				console.warn('[noteService] Network failed, using cache');
				console.error('[noteService] Error fetching note:', error);
			}
		}

		const cachedNotes = await db.notesGetAll();
		const cachedNote = cachedNotes.find(note => note.ID === noteID);
	if (cachedNote) {
		const blocks = Array.isArray(cachedNote.blocks) ? cachedNote.blocks : [];
		const activeNote = {
			ID: cachedNote.ID,
			title: cachedNote.title,
			breadcrumb: cachedNote.title,
			text: blocks.map(b => b.content).join('\n\n') ?? ''
		};
		await this._setActiveNoteState(activeNote);
		store.setActiveBlocks(blocks);
	}

	return cachedNote || null;
},

_isLocalNote(noteID) {
	return String(noteID).startsWith('local-');
},

async _setActiveNoteState(activeNote) {
	store.setActiveNote(activeNote);
	store.setActiveNoteId(activeNote.ID);
	await db.settingsSet('activeNoteId', activeNote.ID);
},

async createNote(data) {
	const isOnline = store.getOnline();
	const localNote = {
		...data,
		ID: `local-${Date.now()}`,
		isLocal: true,
		icon: null,
		updatedAt: Date.now(),
	};

	if (isOnline) {
		try {
			const result = await client.post('/notes', data);
			const note = {
				ID: result.id,
				title: result.title,
				icon: null,
				updatedAt: result.updated_at || result.UpdatedAt,
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

			return result;
		} catch(error) {
			console.warn('[noteService] Network failed, queueing create request');
			await queueService.enqueueRequest({ method: 'POST', endpoint: '/notes', body: data, localId: localNote.ID });
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

	await queueService.enqueueRequest({ method: 'POST', endpoint: '/notes', body: data, localId: localNote.ID });
	return localNote;
	},

	async deleteNote(noteID) {
		const isOnline = store.getOnline();
		const isLocal = this._isLocalNote(noteID);

		if (isOnline && !isLocal) {
			try {
				await client.delete(`/notes/${noteID}`);
			} catch (error) {
				console.warn('[noteService] Network failed, queueing delete request');
				await queueService.enqueueRequest({ method: 'DELETE', endpoint: `/notes/${noteID}`, body: null });
			}
		} else if (!isOnline && !isLocal) {
			await queueService.enqueueRequest({ method: 'DELETE', endpoint: `/notes/${noteID}`, body: null });
		}

		await db.notesDelete(noteID);
		const currentNotes = store.getNotes();
		const remainingNotes = currentNotes.filter(note => note.ID !== noteID);
		store.setNotes(remainingNotes);

		if (remainingNotes.length > 0) {
			await this.getNote(remainingNotes[0].ID);
		} else {
			store.setActiveNoteId(null);
			store.setActiveNote(null);
			await db.settingsSet('activeNoteId', null);
		}
	},

	/**
	 * Обновляет заметку по ID
	 * @async
	 * @param {string} noteID - идентификатор заметки
	 * @param {Object} data - данные для обновления
	 * @returns {Promise<Object|null>} обновленные данные заметки или null при ошибке
	 */
	async updateNote(noteID, data) {
		const isOnline = store.getOnline();
		const isLocal = this._isLocalNote(noteID);

		if (isOnline && !isLocal) {
			try {
				const result = await client.put(`/notes/${noteID}`, data);
				const note = {
					ID: result.id,
					title: result.title,
					icon: null,
					updatedAt: result.updated_at,
				};
				await db.notesPut(note);
				const currentNotes = store.getNotes();
				const updatedNotes = currentNotes.map(n => n.ID === noteID ? note : n);
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

				return result;
			} catch (error) {
				console.warn('[noteService] Network failed, queueing update request');
				await queueService.enqueueRequest({ method: 'PUT', endpoint: `/notes/${noteID}`, body: data });
			}
		} else if (!isOnline && !isLocal) {
			await queueService.enqueueRequest({ method: 'PUT', endpoint: `/notes/${noteID}`, body: data });
		}

		// Локальное обновление
		const currentNotes = store.getNotes();
		const noteIndex = currentNotes.findIndex(n => n.ID === noteID);
		if (noteIndex !== -1) {
			const updatedNote = { ...currentNotes[noteIndex], ...data, updatedAt: Date.now() };
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

	/**
	 * Получает блоки для заметки
	 * @async
	 * @param {string} noteID - идентификатор заметки
	 * @returns {Promise<Array>} список блоков
	 */
	async getBlocks(noteID) {
		const isOnline = store.getOnline();
		if (isOnline) {
			try {
				const data = await client.get(`/notes/${noteID}`);
				const blocks = data.blocks || [];
				await db.notesPut({
					ID: data.note.id,
					title: data.note.title,
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
			} catch(error) {
				console.warn('[noteService] Network failed, using cache');
			}
		}

		const cachedNote = await db.notesGet(noteID);
		const blocks = cachedNote?.blocks || [];

		const fomattingMap = await db.formattingGetByNoteId(noteID);
		const blocksWithFormatting = blocks.map(block => ({
			...block,
			formatting: fomattingMap[block.id] || block.formatting || null
		}));
		store.setActiveBlocks(blocksWithFormatting);
		return blocks;
	},

	/**
	 * Создает новый блок в заметке
	 * @async
	 * @param {string} noteID - идентификатор заметки
	 * @param {Object} blockData - данные блока
	 * @returns {Promise<Object>} созданный блок
	 */
	async createBlock(noteID, blockData) {
		const isOnline = store.getOnline();
		const localBlock = {
			...blockData,
			id: `local-${Date.now()}`,
			isLocal: true,
		};

		if (isOnline) {
			try {
				const result = await client.post(`/notes/${noteID}/blocks`, blockData);
				const block = {
					id: result.id,
					block_type_id: result.block_type_id,
					content: result.content,
					position: result.position,
				};
				await this._updateCachedBlocks(noteID, block, 'add');
				store.setActiveBlocks(store.getActiveBlocks().concat(block));
				return block;
			} catch(error) {
				console.warn('[noteService] Network failed, queueing create block request');
				await queueService.enqueueRequest({ method: 'POST', endpoint: `/notes/${noteID}/blocks`, body: blockData, localId: localBlock.id });
			}
		}

		await this._updateCachedBlocks(noteID, localBlock, 'add');
		const currentBlocks = store.getActiveBlocks();
		store.setActiveBlocks(currentBlocks.concat(localBlock));
		await queueService.enqueueRequest({ method: 'POST', endpoint: `/notes/${noteID}/blocks`, body: blockData, localId: localBlock.id });
		return localBlock;
	},

	/**
	 * Обновляет контент блока
	 * @async
	 * @param {string} noteID - идентификатор заметки
	 * @param {string} blockID - идентификатор блока
	 * @param {string} content - новый контент
	 * @returns {Promise<Object>} обновленный блок
	 */
	async updateBlockContent(noteID, blockID, content) {
		const isOnline = store.getOnline();
		const isLocal = String(blockID).startsWith('local-');

		if (isOnline && !isLocal) {
			try {
				const result = await client.put(`/notes/${noteID}/blocks/${blockID}/content`, { content });
				const block = {
					id: result.id,
					type: result.type,
					content: result.content,
					position: result.position,
				};
				await this._updateCachedBlocks(noteID, block, 'update');
				const currentBlocks = store.getActiveBlocks();
				const updatedBlocks = currentBlocks.map(b => b.id === blockID ? block : b);
				store.setActiveBlocks(updatedBlocks);
				return block;
			} catch(error) {
				console.warn('[noteService] Network failed, queueing update block request');
				await queueService.enqueueRequest({ method: 'PUT', endpoint: `/notes/${noteID}/blocks/${blockID}/content`, body: { content } });
			}
		} else if (!isOnline && !isLocal) {
			await queueService.enqueueRequest({ method: 'PUT', endpoint: `/notes/${noteID}/blocks/${blockID}/content`, body: { content } });
		}
		const block = { id: blockID, content };
		await this._updateCachedBlocks(noteID, block, 'update');
		const currentBlocks = store.getActiveBlocks();
		const updatedBlocks = currentBlocks.map(b => b.id === blockID ? { ...b, content } : b);
		store.setActiveBlocks(updatedBlocks);
		return block;
	},

	/**
	 * Перемещает блок
	 * @async
	 * @param {string} noteID - идентификатор заметки
	 * @param {string} blockID - идентификатор блока
	 * @param {number} newPosition - новая позиция
	 * @returns {Promise<Object>} перемещенный блок
	 */
	async moveBlock(noteID, blockID, newPosition) {
		const isOnline = store.getOnline();
		const isLocal = String(blockID).startsWith('local-');
		store.reorderBlocks(blockID, newPosition);

		if (isOnline && !isLocal) {
			try {
				const result = await client.put(`/notes/${noteID}/blocks/${blockID}/move`, { new_position: newPosition });
				const block = {
					id: result.id,
					type: result.type,
					content: result.content,
					position: result.position,
				};
				await this._updateCachedBlocks(noteID, block, 'update');
				return block;
			} catch(error) {
				console.warn('[noteService] Network failed, queueing move block request');
				await queueService.enqueueRequest({ method: 'PUT', endpoint: `/notes/${noteID}/blocks/${blockID}/move`, body: { new_position: newPosition } });
			}
		} else if (!isOnline && !isLocal) {
			await queueService.enqueueRequest({ method: 'PUT', endpoint: `/notes/${noteID}/blocks/${blockID}/move`, body: { new_position: newPosition } });
		}
		const block = { id: blockID, position: newPosition };
		await this._updateCachedBlocks(noteID, block, 'update');
		return block;
	},

	/**
	 * Удаляет блок
	 * @async
	 * @param {string} noteID - идентификатор заметки
	 * @param {string} blockID - идентификатор блока
	 * @returns {Promise<void>}
	 */
	async deleteBlock(noteID, blockID) {
		const isOnline = store.getOnline();
		const isLocal = String(blockID).startsWith('local-');

		if (isOnline && !isLocal) {
			try {
				await client.delete(`/notes/${noteID}/blocks/${blockID}`);
			} catch(error) {
				console.warn('[noteService] Network failed, queueing delete block request');
				await queueService.enqueueRequest({ method: 'DELETE', endpoint: `/notes/${noteID}/blocks/${blockID}`, body: null });
			}
		} else if (!isOnline && !isLocal) {
			await queueService.enqueueRequest({ method: 'DELETE', endpoint: `/notes/${noteID}/blocks/${blockID}`, body: null });
		}

		await this._updateCachedBlocks(noteID, { id: blockID }, 'delete');
		const currentBlocks = store.getActiveBlocks();
		const updatedBlocks = currentBlocks.filter(b => b.id !== blockID);
		store.setActiveBlocks(updatedBlocks);
	},

	/**
	 * Вспомогательный метод для обновления кэшированных блоков в заметке
	 * @private
	 * @param {string} noteID - идентификатор заметки
	 * @param {Object} block - блок для обновления
	 * @param {string} action - действие: 'add', 'update', 'delete'
	 */
	async _updateCachedBlocks(noteID, block, action) {
		const cachedNote = await db.notesGet(noteID);
		if (!cachedNote) return;

		let blocks = cachedNote.blocks || [];
		if (action === 'add') {
			blocks.push(block);
		} else if (action === 'update') {
			blocks = blocks.map(b => b.id === block.id ? { ...b, ...block } : b);
		} else if (action === 'delete') {
			blocks = blocks.filter(b => b.id !== block.id);
		}

		await db.notesPut({ ...cachedNote, blocks });
	},

	 async saveBlockFormatting(noteId, blockId, formatting) {
        const isOnline = store.getOnline();
        const isLocal = String(blockId).startsWith('local-');

        await db.formattingPut({
            blockId,
            noteId,
            formatting,
            updatedAt: Date.now(),
            synced: false
        });

        const blockEl = document.querySelector(`.block[data-block-id="${blockId}"]`);
        if (blockEl) applyFormattingToElement(blockEl, formatting);

        if (isOnline && !isLocal) {
            try {
                const result = await client.put(
                    `/notes/${noteId}/blocks/${blockId}/formatting`, 
                    formatting
                );
                await db.formattingMarkSynced(blockId);
                if (result?.id) await this._updateCachedBlocks(noteId, result, 'update');
                return result;
            } catch (error) {
                console.warn('[noteService] Network failed, queuing formatting request');
                await queueService.enqueueRequest({
                    method: 'PUT',
                    endpoint: `/notes/${noteId}/blocks/${blockId}/formatting`,
                    body: formatting
                });
                throw error;
            }
        } else {
            await queueService.enqueueRequest({
                method: 'PUT',
                endpoint: `/notes/${noteId}/blocks/${blockId}/formatting`,
                body: formatting
            });
        }
        return { blockId, formatting };
    },

    async resetBlockFormatting(noteId, blockId) {
        const isOnline = store.getOnline();
        
        await db.formattingDelete(blockId);
        
        const blockEl = document.querySelector(`.block[data-block-id="${blockId}"]`);
        if (blockEl) applyFormattingToElement(blockEl, null);

        if (isOnline) {
            try {
                const result = await client.delete(`/notes/${noteId}/blocks/${blockId}/formatting`);
                if (result?.id) await this._updateCachedBlocks(noteId, result, 'update');
                return result;
            } catch (error) {
                await queueService.enqueueRequest({
                    method: 'DELETE',
                    endpoint: `/notes/${noteId}/blocks/${blockId}/formatting`
                });
                throw error;
            }
        }
        await queueService.enqueueRequest({
            method: 'DELETE',
            endpoint: `/notes/${noteId}/blocks/${blockId}/formatting`
        });
        return { blockId, formatting: null };
    },

    async loadAndApplyFormatting(noteId) {
        const formattingMap = await db.formattingGetByNoteId(noteId);
        Object.entries(formattingMap).forEach(([blockId, fmt]) => {
            const el = document.querySelector(`.block[data-block-id="${blockId}"]`);
            if (el) applyFormattingToElement(el, fmt);
        });
    }
};
