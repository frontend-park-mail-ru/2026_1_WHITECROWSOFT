import { client } from '../client/client.js';
import { db } from '../db.js';
import { store } from '../store.js';
import { queueService } from './requestQueueService.js';

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

				for (const block of data.blocks || []) {
					if (block.formatting) {
						await db.formattingPut({
							blockId: block.id,
							noteId: data.note.id,
							formatting: block.formatting,
							synced: true,
							updatedAt: Date.now(),
						})
					}
				}

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

		const cachedNote = await db.notesGet(noteID);
		if (cachedNote) {
			const blocks = Array.isArray(cachedNote.blocks) ? cachedNote.blocks : [];
			const fomattingMap = await db.formattingGetByNoteId(noteID);
			const blocksWithFormatting = blocks.map(block => ({
				...block,
				formatting: fomattingMap[block.id] || block.formatting || null
			}));
			
			const activeNote = {
				ID: cachedNote.ID,
				title: cachedNote.title,
				breadcrumb: cachedNote.title,
				text: blocks.map(b => b.content).join('\n\n') ?? ''
			};
			await this._setActiveNoteState(activeNote);
			store.setActiveBlocks(blocksWithFormatting);
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
				store.setActiveBlocks([]);
				return result;
			} catch(error) {
				console.warn(`[noteService] Network failed (${error}), queueing create request`);
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
		store.setActiveBlocks([]);
		
		if (!isOnline) {
			await queueService.enqueueRequest({ method: 'POST', endpoint: '/notes', body: data, localId: localNote.ID });
		}
		return localNote;
	},

	async deleteNote(noteID) {
		const isOnline = store.getOnline();
		const isLocal = this._isLocalNote(noteID);

		if (isOnline && !isLocal) {
			try {
				await client.delete(`/notes/${noteID}`);
      } catch (error) {
        console.warn(`[noteService] Network failed (${error}), queueing delete request`);
				await queueService.enqueueRequest({ method: 'DELETE', endpoint: `/notes/${noteID}`, body: null });
			}
		} else if (!isOnline && !isLocal) {
			await queueService.enqueueRequest({ method: 'DELETE', endpoint: `/notes/${noteID}`, body: null });
		}

		await db.notesDelete(noteID);
		await db.imagesDeleteByNoteId?.(noteID);
		await db.formattingDeleteByNoteId?.(noteID);
		const currentNotes = store.getNotes();
		const remainingNotes = currentNotes.filter(note => note.ID !== noteID);
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
        console.warn(`[noteService] Network failed (${error}), queueing update request`);
				await queueService.enqueueRequest({ method: 'PUT', endpoint: `/notes/${noteID}`, body: data });
			}
		} else if (!isOnline && !isLocal) {
			await queueService.enqueueRequest({ method: 'PUT', endpoint: `/notes/${noteID}`, body: data });
		}

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
        console.error('[noteService] Error fetching blocks:', error);
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
      } catch (error) {
        console.warn(`[noteService] Network failed (${error}), queueing create block request`);
				await queueService.enqueueRequest({ method: 'POST', endpoint: `/notes/${noteID}/blocks`, body: blockData, localId: localBlock.id });
			}
		}

		await this._updateCachedBlocks(noteID, localBlock, 'add');
		const currentBlocks = store.getActiveBlocks();
		store.setActiveBlocks(currentBlocks.concat(localBlock));
		await queueService.enqueueRequest({ method: 'POST', endpoint: `/notes/${noteID}/blocks`, body: blockData, localId: localBlock.id });
		return localBlock;
	},

	async createImageBlock(noteId, attachmentData) {
		const blockData = {
			note_id: noteId,
			block_type_id: 2,
			position: store.getActiveBlocks().length,
			content: JSON.stringify(attachmentData)
		};
		
		return await this.createBlock(noteId, blockData);
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
				await client.put(`/notes/${noteID}/blocks/${blockID}/content`, { content });
      } catch (error) {
        console.warn(`[noteService] Network failed (${error}), queueing block update request`);
				await queueService.enqueueRequest({
					method: 'PUT',
					endpoint: `/notes/${noteID}/blocks/${blockID}/content`,
					body: { content }
				});
			}
		} else {
			await queueService.enqueueRequest({
				method: 'PUT',
				endpoint: `/notes/${noteID}/blocks/${blockID}/content`,
				body: { content }
			});
		}
		const block = { id: blockID, content, updatedAt: Date.now() };
		await this._updateCachedBlocks(noteID, block, 'update');
		const blocks = store.getActiveBlocks();
		store.setActiveBlocks(blocks.map(b => 
			b.id === blockID ? { ...b, content, updatedAt: Date.now() } : b
		));
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
      } catch (error) {
        console.warn(`[noteService] Network failed (${error}), queueing block move request`);
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
      } catch (error) {
        console.warn(`[noteService] Network failed (${error}), queueing block deletion request`);
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
			blocks = blocks.map(b => 
				b.id === block.id ? { ...b, content: block.content, updatedAt: Date.now() } : b
			);
		} else if (action === 'delete') {
			blocks = blocks.filter(b => b.id !== block.id);
		}
		await db.notesPut({ ...cachedNote, blocks, updatedAt: Date.now() });
	},

	async saveBlockFormatting(noteId, blockId, startPos, endPos, formatting) {
        const isOnline = store.getOnline();
        const isLocal = String(blockId).startsWith('local-');

        const payload = {
            start_pos: startPos,
            end_pos: endPos,
			bold: formatting.bold ?? null,
			italic: formatting.italic ?? null,
			underline: formatting.underline ?? null,
        };

		const endpoint = `/notes/${noteId}/blocks/${blockId}/formatting`;

        if (isOnline && !isLocal) {
            try {
                const result = await client.put(endpoint, payload);
				await db.formattingMarkSynced(blockId);
                return result;
            } catch (error) {
              console.warn(`[noteService] Network failed (${error}), queueing formatting request`);
                await queueService.enqueueRequest({
                    method: 'PUT',
                    endpoint,
                    body: payload
                });
				await this._saveFormattingToCache(noteId, blockId, payload, false);
            }
        } else {
            await queueService.enqueueRequest({
                method: 'PUT',
                endpoint,
                body: payload
            });
        }
        return { block_id: blockId, ranges: [payload] };
    },

    async _saveFormattingToCache(noteId, blockId, formatting, synced = false) {
		try {
			const existing = await db.formattingGet(blockId);
			let ranges = existing?.ranges || [];
			const rangeIndex = ranges.findIndex(r => 
				r.start_pos === formatting.start_pos && r.end_pos === formatting.end_pos
			);
			if (rangeIndex !== -1) {
				ranges[rangeIndex] = formatting;
			} else {
				ranges.push(formatting);
			}
			await db.formattingPut({
				blockId: blockId,
				noteId: noteId,
				formatting: { ranges },
				synced: synced,
				updatedAt: Date.now()
			});
		} catch (error) {
			console.error('[noteService] Failed to save formatting to cache:', error);
		}
	},

	/**
	 * Получает форматирование блока (сначала из кэша, потом с сервера)
	 * @async
	 * @param {string} noteId - ID заметки
	 * @param {string} blockId - ID блока
	 * @returns {Promise<Array>} массив диапазонов форматирования
	 */
	async getBlockFormatting(noteId, blockId) {
		const isOnline = store.getOnline();
		const isLocal = String(blockId).startsWith('local-');
		const cachedFormatting = await db.formattingGet(blockId);
		if (cachedFormatting?.ranges) {
			return cachedFormatting.ranges;
		}
		if (isOnline && !isLocal) {
			try {
				const { ranges = [] } = await client.get(`/notes/${noteId}/blocks/${blockId}/formatting`);
				if (ranges.length > 0) {
					await db.formattingPut({
						blockId: blockId,
						noteId: noteId,
						formatting: { ranges },
						synced: true,
						updatedAt: Date.now()
					});
				}
				return ranges;
      } catch (error) {
				console.warn('[noteService] Failed to fetch formatting from server:', error);
				return [];
			}
		}
		return [];
	},

	/**
	 * Сбрасывает форматирование блока
	 * @async
	 * @param {string} noteId - ID заметки
	 * @param {string} blockId - ID блока
	 * @returns {Promise<Object>} результат операции
	 */
	async resetBlockFormatting(noteId, blockId) {
		const isOnline = store.getOnline();
		const isLocal = String(blockId).startsWith('local-');
		const endpoint = `/notes/${noteId}/blocks/${blockId}/formatting`;
		await db.formattingDelete(blockId);
		if (isOnline && !isLocal) {
			try {
				const result = await client.delete(endpoint);
				return result;
      } catch (error) {
        console.warn(`[noteService] Request failed (${error}), queueing formatting reset request`);
				await queueService.enqueueRequest({ method: 'DELETE', endpoint });
			}
		} else {
			await queueService.enqueueRequest({ method: 'DELETE', endpoint });
		}
		
		return { block_id: blockId, ranges: [] };
	},

	/**
	 * Получает все форматирования для заметки (для массовой загрузки)
	 * @async
	 * @param {string} noteId - ID заметки
	 * @returns {Promise<Object>} объект с форматированиями по блокам
	 */
	async getAllFormattingForNote(noteId) {
		const isOnline = store.getOnline();
		const cachedFormatting = await db.formattingGetByNoteId(noteId);
		if (isOnline) {
			try {
				const data = await client.get(`/notes/${noteId}`);
				const blocks = data.blocks || [];
				for (const block of blocks) {
					if (block.formatting) {
						await db.formattingPut({
							blockId: block.id,
							noteId: noteId,
							formatting: block.formatting,
							synced: true,
							updatedAt: Date.now()
						});
					}
				}
				const formattingMap = {};
				blocks.forEach(block => {
					if (block.formatting?.ranges) {
						formattingMap[block.id] = block.formatting.ranges;
					}
				});
				return formattingMap;
      } catch (error) {
				console.warn('[noteService] Failed to fetch formatting from server, using cache:', error);
			}
		}
		return cachedFormatting;
	},
};
