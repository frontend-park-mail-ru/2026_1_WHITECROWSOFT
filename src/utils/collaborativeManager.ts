import { db } from '../db.js';
import { wsService } from '../services/websocketService.js';
import { store } from '../store.js';
import type {
	ApplyFormattingMsg,
	Block,
	CollaborativeUser,
	CreateBlockMsg,
	CursorPosition,
	DeleteCharMsg,
	DeleteCoverMsg,
	FormattingPayload,
	InsertCharMsg,
	MoveBlockMsg,
	Note,
	WebSocketMessage,
} from '../types.js';

/**
 * Менеджер совместного редактирования заметок
 * Управляет подключением по WebSocket и синхронизацией операций между пользователями
 */
export class CollaborativeManager {
	private noteId: string | null = null;
	private unsubscribeWs: (() => void) | null = null;
	private isStarting = false;
	private isConnected = false;

	/**
	 * Запускает совместное редактирование для заметки
	 * Очищает предыдущих участников и подключается к новому WebSocket
	 */
	async startCollab(noteId: string): Promise<void> {
		const note = store.getNotes().find((n) => String(n.ID) === noteId);
		if (!note || !note.is_public) {
			return;
		}

		if (this.isStarting) {
			return;
		}

		if (this.isConnected && this.noteId === noteId) {
			return;
		}

		this.isStarting = true;

		if (this.isConnected || this.unsubscribeWs) {
			this.stopCollab();
		}

		this.noteId = noteId;
		store.clearCollaborativeUsers();

		try {
			await wsService.connect(noteId);
			this.isConnected = true;
			this.unsubscribeWs = wsService.onMessage((message) => {
				this.handleMessage(message);
			});
		} catch (error) {
			this.noteId = null;
			this.isConnected = false;
			throw error;
		} finally {
			this.isStarting = false;
		}
	}

	/**
	 * Останавливает совместное редактирование
	 * Закрывает соединение и очищает список подключенных пользователей
	 */
	stopCollab(): void {
		if (this.unsubscribeWs) {
			this.unsubscribeWs();
			this.unsubscribeWs = null;
		}

		wsService.disconnect(true);
		store.clearCollaborativeUsers();
		this.noteId = null;
		this.isConnected = false;
	}

	/**
	 * Отправляет позицию курсора текущего пользователя на сервер
	 * Это позволяет другим участникам видеть движение курсора
	 */
	sendCursorMove(blockId: string, startPos: number, endPos: number): void {
		if (!wsService.isConnected()) {
			console.warn(
				'[CollaborativeManager] Not connected, cannot send cursor move',
			);
			return;
		}

		wsService.send({
			type: 'cursor_move',
			msg: {
				blockId,
				endPosition: endPos,
				startPosition: startPos,
			},
		});
	}

	/**
	 * Отправляет запрос на вставку символа другим участникам заметки
	 * Сервер может применить эту операцию и разослать её остальным
	 */
	sendInsertChar(blockId: string, position: number, char: string): void {
		console.log(blockId, position, char);
		if (!wsService.isConnected()) {
			console.warn(
				'[CollaborativeManager] Not connected, cannot send insert char',
			);
			return;
		}

		wsService.send({
			type: 'insert_chars',
			msg: {
				blockId,
				position,
				char,
				uniqueId: `${Date.now()}-${Math.random()}`,
			},
		});
	}

	/**
	 * Отправляет запрос на удаление символа
	 * Другие участники увидят, как символ исчезает из блока
	 */
	sendDeleteChar(blockId: string, startPos: number, endPos: number): void {
		if (!wsService.isConnected()) {
			console.warn(
				'[CollaborativeManager] Not connected, cannot send delete char',
			);
			return;
		}

		wsService.send({
			type: 'delete_chars',
			msg: {
				blockId,
				endPosition: endPos,
				startPosition: startPos,
				uniqueId: `${Date.now()}-${Math.random()}`,
			},
		});
	}

	/**
	 * Отправляет команду на создание нового блока
	 * Сервер распределяет блок между всеми участниками заметки
	 */
	sendCreateBlock(blockTypeId: number, position: number): void {
		if (!wsService.isConnected()) {
			console.warn(
				'[CollaborativeManager] Not connected, cannot send create block',
			);
			return;
		}

		wsService.send({
			type: 'create_block',
			msg: {
				blockTypeId,
				position,
			},
		});
	}

	/**
	 * Отправляет команду на удаление блока заметки
	 * Это позволяет синхронизировать удаление между всеми пользователями
	 */
	sendDeleteBlock(blockId: string): void {
		if (!wsService.isConnected()) {
			console.warn(
				'[CollaborativeManager] Not connected, cannot send delete block',
			);
			return;
		}

		wsService.send({
			type: 'delete_block',
			msg: {
				blockId,
			},
		});
	}

	/**
	 * Отправляет команду на перемещение блока
	 * Позволяет синхронизировать порядок блоков между участниками
	 */
	sendMoveBlock(blockId: string, newPosition: number): void {
		if (!wsService.isConnected()) {
			console.warn(
				'[CollaborativeManager] Not connected, cannot send move block',
			);
			return;
		}

		wsService.send({
			type: 'move_block',
			msg: {
				blockId,
				newPosition,
			},
		});
	}

	/**
	 * Отправляет команду форматирования текста
	 * Это синхронизирует стили между всеми участниками заметки
	 */
	sendApplyFormatting(
		blockId: string,
		formatting: {
			bold?: boolean | null;
			italic?: boolean | null;
			underline?: boolean | null;
			textAlign?: number | null;
		},
	): void {
		if (!wsService.isConnected()) {
			console.warn(
				'[CollaborativeManager] Not connected, cannot send formatting',
			);
			return;
		}

		wsService.send({
			type: 'apply_formatting',
			msg: {
				blockId,
				...formatting,
			},
		});
	}

	/**
	 * Отправляет обновление заголовка заметки другим участникам
	 * Используется при редактировании названия заметки
	 */
	sendUpdateNoteTitle(title: string): void {
		if (!wsService.isConnected()) {
			console.warn(
				'[CollaborativeManager] Not connected, cannot send update title',
			);
			return;
		}

		wsService.send({
			type: 'update_note_title',
			msg: title,
		});
	}

	sendUpdateNoteIcon(icon: string): void {
		if (!wsService.isConnected()) {
			console.warn(
				'[CollaborativeManager] Not connected, cannot send update title',
			);
			return;
		}

		wsService.send({
			type: 'change_icon',
			msg: icon,
		});
	}

	sendUploadAttachment(data: {
		fileName: string;
		fileData: string;
		hasPosition: boolean;
		position: number;
	}): void {
		if (!wsService.isConnected()) return;

		wsService.send({
			type: 'upload_attachment',
			msg: data,
		});
	}

	sendUploadCover(data: { fileName: string; fileData: string }): void {
		if (!wsService.isConnected()) return;

		wsService.send({
			type: 'upload_header',
			msg: data,
		});
	}

	sendDeleteCover(): void {
		if (!wsService.isConnected()) {
			console.warn(
				'[CollaborativeManager] Not connected, cannot send delete block',
			);
			return;
		}

		wsService.send({
			type: 'delete_header',
			msg: {},
		});
	}

	/**
	 * Обрабатывает входящее WebSocket-сообщение
	 * Выбирает нужный метод на основе типа сообщения
	 */
	private handleMessage(message: WebSocketMessage): void {
		try {
			switch (message.type) {
				case 'user_joined':
					this.handleUserJoined(message);
					break;
				case 'user_left':
					this.handleUserLeft(message);
					break;
				case 'cursor_move':
					this.handleCursorMove(message);
					break;
				case 'insert_chars':
					this.handleInsertChar(message);
					break;
				case 'delete_chars':
					this.handleDeleteChar(message);
					break;
				case 'apply_formatting':
					this.handleApplyFormatting(message);
					break;
				case 'create_block':
					this.handleCreateBlock(message);
					break;
				case 'delete_block':
					this.handleDeleteBlock(message);
					break;
				case 'move_block':
					this.handleMoveBlock(message);
					break;
				case 'update_note_title':
					this.handleUpdateNoteTitle(message);
					break;
				case 'upload_attachment':
					this.handleUploadAttachment(message);
					break;
				case 'upload_header':
					this.handleUploadCover(message);
					break;
				case 'delete_header':
					this.handleDeleteCover(message);
				case 'change_icon':
					this.handleChangeIcon(message);
				case 'sync_state':
					this.handleSyncState(message);
					break;
				case 'note_private':
					this.handleNotePrivate(message);
					break;
				case 'note_deleted':
					this.handleNoteDeleted(message);
					break;
				case 'error':
					console.error('[CollaborativeManager] Server error:', message.msg);
					break;
				case 'heartbeat':
					break;
				default:
					console.warn(
						'[CollaborativeManager] Unknown message type:',
						message.type,
					);
			}
		} catch (error) {
			console.error(
				'[CollaborativeManager] Error handling message:',
				error,
				message,
			);
		}
	}

	/**
	 * Обрабатывает подключение нового пользователя к заметке
	 * Добавляет его в список активных участников
	 */
	private handleUserJoined(message: WebSocketMessage): void {
		if (!message.userId || !message.userName) return;

		const user: CollaborativeUser = {
			userId: message.userId,
			userName: message.userName,
			cursor: {
				blockId: '',
				endPosition: 0,
				startPosition: 0,
				timestamp: message.timestamp,
			},
		};

		store.updateCollaborativeUser(message.userId, user);
	}

	/**
	 * Обрабатывает выход пользователя из заметки
	 * Удаляет его курсор и данные из хранилища
	 */
	private handleUserLeft(message: WebSocketMessage): void {
		if (!message.userId) return;

		store.removeCollaborativeUser(message.userId);
	}

	/**
	 * Обновляет позицию курсора другого пользователя
	 * Данные обновляются в store и визуально рендерятся в UI
	 */
	private handleCursorMove(message: WebSocketMessage): void {
		const msg = message.msg as CollaborativeUser[];
		console.log(msg[0].cursor.blockId);
		const users: CollaborativeUser[] = msg.map((userData) => ({
			userId: userData.userId,
			userName: userData.userName,
			cursor: {
				blockId: userData.cursor.blockId,
				endPosition: userData.cursor.endPosition,
				startPosition: userData.cursor.startPosition,
				timestamp: userData.cursor.timestamp || Date.now(),
			},
		}));
		for (const user of users) {
			if (user.userId === store.getUser()?.id) {
				store.setPendingFocus(user.cursor.blockId, user.cursor.startPosition);
			}
			store.updateCollaborativeUser(user.userId, user);
		}
	}

	/**
	 * Обрабатывает вставку символа от другого участника
	 * Синхронизирует содержимое блока в store
	 */
	private handleInsertChar(message: WebSocketMessage): void {
		// if (message.isLocal) return;
		const msg = message.msg as InsertCharMsg;
		const blocks = store.getActiveBlocks();
		const blockIndex = blocks.findIndex((b) => b.id === msg.blockId);

		if (blockIndex === -1) {
			console.warn('[CollaborativeManager] handleInsertChar: block not found', {
				blockId: msg.blockId,
				availableIds: blocks.map((b) => b.id),
			});
			return;
		}

		const block = blocks[blockIndex];
		const position = msg.position ?? 0;
		const newContent =
			block.content.slice(0, msg.position) +
			msg.char +
			block.content.slice(msg.position);

		block.content = newContent;
		store.setActiveBlocks([...blocks]);

		window.dispatchEvent(
			new CustomEvent('collaborativeBlockUpdate', {
				detail: {
					blockId: msg.blockId,
					content: newContent,
					position: position,
					char: msg.char,
					userId: message.userId,
					isInsert: true,
				},
			}),
		);
	}

	/**
	 * Обрабатывает удаление символа от другого участника
	 * Обновляет содержимое блока и уведомляет UI
	 */
	private handleDeleteChar(message: WebSocketMessage): void {
		const msg = message.msg as DeleteCharMsg;
		const blocks = store.getActiveBlocks();
		const blockIndex = blocks.findIndex((b) => b.id === msg.blockId);

		if (blockIndex === -1) return;

		const block = blocks[blockIndex];
		const startPos = msg.startPosition;
		const endPos = msg.endPosition;
		const newContent =
			block.content.slice(0, startPos) + block.content.slice(endPos);

		block.content = newContent;
		store.setActiveBlocks([...blocks]);

		window.dispatchEvent(
			new CustomEvent('collaborativeBlockUpdate', {
				detail: {
					blockId: msg.blockId,
					content: newContent,
					startPosition: startPos,
					endPosition: startPos,
					userId: message.userId,
					isInsert: false,
				},
			}),
		);
	}

	/**
	 * Обрабатывает изменения форматирования от другого участника
	 * Добавляет или обновляет форматирование в блоке
	 */
	private handleApplyFormatting(message: WebSocketMessage): void {
		const msg = message.msg as ApplyFormattingMsg;
		const blocks = store.getActiveBlocks();
		const blockIndex = blocks.findIndex((b) => b.id === msg.blockId);

		if (blockIndex === -1) return;

		const block = blocks[blockIndex];
		if (!block.formatting) {
			block.formatting = { ranges: [] };
		}

		const existingRange = block.formatting.ranges.find(
			(r) => r.start_pos === msg.startPos && r.end_pos === msg.endPos,
		);

		if (existingRange) {
			if (msg.bold !== undefined) existingRange.bold = msg.bold;
			if (msg.italic !== undefined) existingRange.italic = msg.italic;
			if (msg.underline !== undefined) existingRange.underline = msg.underline;

			const hasAnyFormatting =
				existingRange.bold || existingRange.italic || existingRange.underline;
			if (!hasAnyFormatting) {
				block.formatting.ranges = block.formatting.ranges.filter(
					(r) => r !== existingRange,
				);
			}
		} else {
			block.formatting.ranges.push({
				start_pos: msg.startPos,
				end_pos: msg.endPos,
				bold: msg.bold ?? null,
				italic: msg.italic ?? null,
				underline: msg.underline ?? null,
			});
		}
		store.setActiveBlocks([...blocks]);
		console.log([...blocks]);
		const payload: FormattingPayload = {
			start_pos: msg.startPos,
			end_pos: msg.endPos,
			bold: msg.bold,
			italic: msg.italic,
			underline: msg.underline,
		};
		db.formattingPut({
			blockId: msg.blockId,
			noteId: store.getActiveNoteId()!,
			formatting: { ranges: block.formatting.ranges },
			synced: true,
			updatedAt: Date.now(),
		});
		window.dispatchEvent(
			new CustomEvent('collaborativeFormattingUpdate', {
				detail: {
					blockId: msg.blockId,
					formatting: block.formatting,
					userId: message.userId,
				},
			}),
		);
	}

	/**
	 * Обрабатывает создание нового блока от другого участника
	 * Вставляет блок в нужную позицию и синхронизирует позиции
	 */
	private async handleCreateBlock(message: WebSocketMessage): Promise<void> {
		//if (message.is_local) return;

		const msg = message.msg as CreateBlockMsg & {
			id: string;
			content?: string;
		};
		const blocks = store.getActiveBlocks();

		const newBlock: Block = {
			id: msg.id,
			block_type_id: msg.block_type_id,
			content: msg.content || '',
			position: msg.position,
			formatting: { ranges: [] },
		};

		blocks.splice(msg.position, 0, newBlock);
		blocks.forEach((b, i) => {
			b.position = i;
		});
		store.setActiveBlocks([...blocks]);
		const activeNoteId = store.getActiveNoteId();
		if (activeNoteId) {
			const currentNotes = store.getNotes();
			const noteIndex = currentNotes.findIndex((n) => n.ID === activeNoteId);
			if (noteIndex !== -1) {
				const updatedNote = {
					...currentNotes[noteIndex],
					blocks: blocks,
				};
				const updatedNotes = [...currentNotes];
				updatedNotes[noteIndex] = updatedNote;
				store.setNotesSilently(updatedNotes);
			}
			await db.notesUpdateBlocks(activeNoteId, blocks);
		}
	}

	/**
	 * Обрабатывает удаление блока другим участником
	 * Удаляет блок из store и пересчитывает позиции
	 */
	private async handleDeleteBlock(message: WebSocketMessage): Promise<void> {
		// if (message.is_local) return;

		const blockId = message.msg;
		const blocks = store.getActiveBlocks();
		const blockIndex = blocks.findIndex((b) => b.id === blockId);

		if (blockIndex === -1) return;

		const prevBlockId = blockIndex > 0 ? blocks[blockIndex - 1].id : null;
		const nextBlockId =
			blockIndex < blocks.length - 1 ? blocks[blockIndex + 1].id : null;
		const blockToFocus = prevBlockId || nextBlockId;

		if (blockToFocus) {
			const newBlock = blocks.find((b) => b.id === blockToFocus);
			const position = newBlock?.content?.length || 0;
			collabManager.sendCursorMove(String(blockToFocus), position, position);
		}

		blocks.splice(blockIndex, 1);
		blocks.forEach((b, i) => {
			b.position = i;
		});
		store.setActiveBlocks([...blocks]);

		const activeNoteId = store.getActiveNoteId();
		if (activeNoteId) {
			const currentNotes = store.getNotes();
			const noteIndex = currentNotes.findIndex((n) => n.ID === activeNoteId);
			if (noteIndex !== -1) {
				const updatedNote = {
					...currentNotes[noteIndex],
					blocks: blocks,
				};
				const updatedNotes = [...currentNotes];
				updatedNotes[noteIndex] = updatedNote;
				store.setNotesSilently(updatedNotes);
			}
			await db.notesUpdateBlocks(activeNoteId, blocks);
		}
	}

	/**
	 * Обрабатывает перемещение блока другим участником
	 * Меняет порядок блоков и обновляет состояния
	 */
	private handleMoveBlock(message: WebSocketMessage): void {
		// if (message.is_local) return;

		const msg = message.msg as MoveBlockMsg;
		const blocks = store.getActiveBlocks();
		const blockIndex = blocks.findIndex((b) => b.id === msg.blockId);

		if (blockIndex === -1) return;

		const [moved] = blocks.splice(blockIndex, 1);
		blocks.splice(msg.newPosition, 0, moved);

		blocks.forEach((b, i) => {
			b.position = i;
		});

		store.setActiveBlocks([...blocks]);

		window.dispatchEvent(
			new CustomEvent('collaborativeBlockMove', {
				detail: {
					blockId: msg.blockId,
					newPosition: msg.newPosition,
					userId: message.userId,
				},
			}),
		);
	}

	/**
	 * Обрабатывает изменение названия заметки от другого участника
	 * Обновляет локальную активную заметку и нотифицирует UI
	 */
	private handleUpdateNoteTitle(message: WebSocketMessage): void {
		// if (message.is_local) return;
		const msg = message.msg as { title: string };
		const currentNotes = store.getNotes();
		const activeNoteId = store.getActiveNoteId();
		const activeNote = store
			.getNotes()
			.find((note) => note.ID === store.getActiveNoteId());
		const noteIndex = currentNotes.findIndex(
			(n) => String(n.ID) === activeNoteId,
		);
		if (noteIndex === -1) return;
		const oldNote = currentNotes[noteIndex];
		const updatedNote = {
			...oldNote,
			title: msg.title,
			updatedAt: Date.now(),
		};
		const updatedNotes = [...currentNotes];
		updatedNotes[noteIndex] = updatedNote;
		store.setNotes(updatedNotes);
		if (activeNote) {
			store.setActiveNote({
				ID: activeNote.ID,
				title: msg.title,
				text: '',
				section: activeNote.section,
				icon: activeNote.icon,
				is_public: activeNote.is_public,
				coverUrl: activeNote.coverUrl,
				breadcrumb: activeNote.title,
			});
		}
		db.notesPut(updatedNote);
	}

	private handleChangeIcon(message: WebSocketMessage): void {
		// if (message.is_local) return;
		const msg = message.msg as { icon: string };
		const currentNotes = store.getNotes();
		const activeNoteId = store.getActiveNoteId();
		const activeNote = store
			.getNotes()
			.find((note) => note.ID === store.getActiveNoteId());
		const noteIndex = currentNotes.findIndex(
			(n) => String(n.ID) === activeNoteId,
		);
		if (noteIndex === -1) return;
		const oldNote = currentNotes[noteIndex];
		const updatedNote = {
			...oldNote,
			icon: msg.icon === 'null' ? null : msg.icon,
			updatedAt: Date.now(),
		};
		const updatedNotes = [...currentNotes];
		updatedNotes[noteIndex] = updatedNote;
		store.setNotes(updatedNotes);
		if (activeNote) {
			store.setActiveNote({
				ID: activeNote.ID,
				title: activeNote.title,
				text: '',
				section: activeNote.section,
				icon: msg.icon === 'null' ? null : msg.icon,
				is_public: activeNote.is_public,
				coverUrl: activeNote.coverUrl,
				breadcrumb: activeNote.title,
			});
		}
		db.notesPut(updatedNote);
	}

	/**
	 * Обрабатывает загрузку вложения другим участником
	 * Блок уже создан на сервере, нужно только добавить его в UI и кэш
	 */
	private async handleUploadAttachment(
		message: WebSocketMessage,
	): Promise<void> {
		const msg = message.msg as {
			id: string;
			block_id: string;
			note_id: string;
			attach_url: string;
			created_at: string;
			position: number;
			mime_type: string;
		};
		let blockTypeId = 2;
		if (msg.mime_type.startsWith('video/')) blockTypeId = 7;
		else if (msg.mime_type.startsWith('audio/')) blockTypeId = 6;
		const blocks = store.getActiveBlocks();
		if (blocks.some((b) => String(b.id) === msg.block_id)) return;
		const newBlock: Block = {
			id: msg.block_id,
			note_id: msg.note_id,
			block_type_id: blockTypeId,
			content: msg.id,
			position: msg.position,
			created_at: msg.created_at,
			updated_at: msg.created_at,
		};
		const updatedBlocks = [...blocks];
		updatedBlocks.splice(msg.position, 0, newBlock);
		updatedBlocks.forEach((block, idx) => {
			block.position = idx;
		});
		store.setActiveBlocks(updatedBlocks);
		store.setPendingFocus(newBlock.id, 'start');
		await db.notesUpdateBlocks(msg.note_id, updatedBlocks);
		const normalizedUrl = msg.attach_url?.replace(
			'http://minio:9000',
			'/minio',
		);
		this.cacheAttachment(msg.block_id, msg.id, normalizedUrl, blockTypeId);
	}

	/**
	 * Кэширует вложение из синхронизации (аналогично _saveToCache в attachmentService)
	 */
	private async cacheAttachment(
		blockId: string,
		attachmentId: string,
		url: string,
		blockTypeId: number,
	): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId) return;
		const attachmentData = {
			id: attachmentId,
			blockId: blockId,
			noteId: activeNoteId,
			url: url,
			status: 'synced' as const,
			syncedAt: Date.now(),
			filename: '',
			mimeType: '',
			size: 0,
		};

		try {
			if (blockTypeId === 2) {
				await db.imagesPut(attachmentData);
			} else if (blockTypeId === 6) {
				await db.audiosPut(attachmentData);
			} else if (blockTypeId === 7) {
				await db.videosPut(attachmentData);
			}
		} catch (error) {
			console.warn('[CollaborativeManager] Failed to cache attachment:', error);
		}
	}

	private async handleUploadCover(message: WebSocketMessage): Promise<void> {
		const msg = message.msg as {
			id: string;
			note_id: string;
			header_url: string;
			created_at: string;
			mime_type: string;
		};
		const oldCover = await db.coverGetByNoteId(msg.note_id);
		if (oldCover) {
			await db.coverDelete(oldCover.id);
		}
		await this.cacheCover(msg.note_id, msg.id, msg.header_url);
		const currentNote = await db.notesGet(msg.note_id);
		if (!currentNote) return;
		const updatedNote: Note = {
			ID: currentNote.ID,
			title: currentNote.title,
			updatedAt: Date.now(),
			coverUrl: msg.header_url,
			icon: currentNote.icon || null,
			blocks: currentNote.blocks || [],
			parent_id: currentNote.parent_id || null,
			isLocal: currentNote.isLocal || false,
			is_public: currentNote.is_public || false,
			is_favorite: currentNote.is_favorite || false,
			section: currentNote.section || 'personal',
		};
		await db.notesPut(updatedNote);
		const currentNotes = store.getNotes();
		const noteIndex = currentNotes.findIndex((n) => n.ID === msg.note_id);
		if (noteIndex !== -1) {
			const updatedNotes = [...currentNotes];
			updatedNotes[noteIndex] = updatedNote;
			store.setNotesSilently(updatedNotes);
		}
		const activeNote = store.getActiveNote();
		if (activeNote) {
			store.setActiveNote({
				...activeNote,
				coverUrl: msg.header_url,
			});
		}
	}

	private async cacheCover(
		noteId: string | number,
		coverId: string | number,
		url: string | undefined,
	): Promise<void> {
		const coverData = {
			id: coverId,
			noteId: noteId,
			filename: '',
			mimeType: '',
			size: 0,
			url: url,
			status: 'synced' as const,
			syncedAt: Date.now(),
		};
		await db.coverPut(coverData);
	}

	private async handleDeleteCover(message: WebSocketMessage): Promise<void> {
		const msg = message.msg as DeleteCoverMsg;
		const coverRecord = await db.coverGetByNoteId(msg.note_id);
		if (coverRecord) {
			await db.coverDelete(coverRecord.id);
		}
		const currentNote = await db.notesGet(msg.note_id);
		if (!currentNote) return;
		const updatedNote: Note = {
			ID: currentNote.ID,
			title: currentNote.title,
			updatedAt: Date.now(),
			coverUrl: null,
			icon: currentNote.icon || null,
			blocks: currentNote.blocks || [],
			parent_id: currentNote.parent_id || null,
			isLocal: currentNote.isLocal || false,
			is_public: currentNote.is_public || false,
			is_favorite: currentNote.is_favorite || false,
			section: currentNote.section || 'personal',
		};
		await db.notesPut(updatedNote);
		const currentNotes = store.getNotes();
		const noteIndex = currentNotes.findIndex((n) => n.ID === msg.note_id);
		if (noteIndex !== -1) {
			const updatedNotes = [...currentNotes];
			updatedNotes[noteIndex] = updatedNote;
			store.setNotesSilently(updatedNotes);
		}
		const activeNote = store.getActiveNote();
		if (activeNote && activeNote.ID === msg.note_id) {
			store.setActiveNote({
				...activeNote,
				coverUrl: null,
			});
		}
	}

	/**
	 * Обрабатывает первичную синхронизацию состояния при подключении
	 * Получает блоки и список подключенных пользователей
	 */
	private handleSyncState(message: WebSocketMessage): void {
		const msg = message.msg as {
			blocks?: Block[];
			connectedUsers?: Array<{
				userId: string;
				userName: string;
				cursor: CursorPosition;
			}>;
		};

		if (msg.blocks && Array.isArray(msg.blocks)) {
			store.setActiveBlocks(msg.blocks);
		}

		if (msg.connectedUsers && Array.isArray(msg.connectedUsers)) {
			const users = new Map<string, CollaborativeUser>();
			msg.connectedUsers.forEach((u) => {
				users.set(u.userId, {
					userId: u.userId,
					userName: u.userName,
					cursor: u.cursor,
				});
			});
			store.setCollaborativeUsers(users);
		}
	}

	/**
	 * Обрабатывает ситуацию, когда заметка перестает быть публичной
	 * Разрывает соединение и уведомляет приложение
	 */
	private handleNotePrivate(message: WebSocketMessage): void {
		console.warn('[CollaborativeManager] Note became private, disconnecting');
		this.stopCollab();

		window.dispatchEvent(
			new CustomEvent('collaborativeNotePrivate', {
				detail: {
					noteId: message.noteId,
				},
			}),
		);
	}

	/**
	 * Обрабатывает удаление заметки на сервере
	 * Завершает совместное редактирование и уведомляет UI
	 */
	private handleNoteDeleted(message: WebSocketMessage): void {
		console.warn('[CollaborativeManager] Note was deleted, disconnecting');
		this.stopCollab();

		window.dispatchEvent(
			new CustomEvent('collaborativeNoteDeleted', {
				detail: {
					noteId: message.noteId,
				},
			}),
		);
	}
}

export const collabManager = new CollaborativeManager();
