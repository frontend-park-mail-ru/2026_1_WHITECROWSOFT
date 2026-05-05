import { wsService } from '../services/websocketService.js';
import { store } from '../store.js';
import type {
	ApplyFormattingMsg,
	Block,
	CollaborativeUser,
	CreateBlockMsg,
	CursorPosition,
	DeleteCharMsg,
	InsertCharMsg,
	MoveBlockMsg,
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
		// Проверяем, является ли заметка публичной
		const note = store.getNotes().find((n) => String(n.ID) === noteId);
		if (!note || !note.is_public) {
			console.log(
				'[CollaborativeManager] Note not public, skipping collab:',
				noteId,
			);
			return;
		}

		if (this.isStarting) {
			console.log('[CollaborativeManager] Already starting, skipping');
			return;
		}

		if (this.isConnected && this.noteId === noteId) {
			console.log(
				'[CollaborativeManager] Already connected to this note, skipping',
			);
			return;
		}

		console.log(
			'[CollaborativeManager] Starting collab for public note:',
			noteId,
		);
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
			console.log('[CollaborativeManager] Started for note:', noteId);
		} catch (error) {
			console.error('[CollaborativeManager] Failed to start:', error);
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
		console.log('[CollaborativeManager] stopCollab called');

		if (this.unsubscribeWs) {
			this.unsubscribeWs();
			this.unsubscribeWs = null;
		}

		wsService.disconnect(true);
		store.clearCollaborativeUsers();
		this.noteId = null;
		this.isConnected = false;

		console.log('[CollaborativeManager] Stopped');
	}

	/**
	 * Отправляет позицию курсора текущего пользователя на сервер
	 * Это позволяет другим участникам видеть движение курсора
	 */
	sendCursorMove(blockId: string, position: number): void {
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
				position,
			},
		});
	}

	/**
	 * Отправляет запрос на вставку символа другим участникам заметки
	 * Сервер может применить эту операцию и разослать её остальным
	 */
	sendInsertChar(blockId: string, position: number, char: string): void {
		if (!wsService.isConnected()) {
			console.warn(
				'[CollaborativeManager] Not connected, cannot send insert char',
			);
			return;
		}

		wsService.send({
			type: 'insert_char',
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
	sendDeleteChar(blockId: string, position: number): void {
		if (!wsService.isConnected()) {
			console.warn(
				'[CollaborativeManager] Not connected, cannot send delete char',
			);
			return;
		}

		wsService.send({
			type: 'delete_char',
			msg: {
				blockId,
				position,
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
		startPos: number,
		endPos: number,
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
				startPos,
				endPos,
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
			msg: {
				title,
			},
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
				case 'insert_char':
					this.handleInsertChar(message);
					break;
				case 'delete_char':
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
				position: 0,
				timestamp: message.timestamp,
			},
		};

		store.updateCollaborativeUser(message.userId, user);
		console.log('[CollaborativeManager] User joined:', message.userName);
	}

	/**
	 * Обрабатывает выход пользователя из заметки
	 * Удаляет его курсор и данные из хранилища
	 */
	private handleUserLeft(message: WebSocketMessage): void {
		if (!message.userId) return;

		store.removeCollaborativeUser(message.userId);
		console.log('[CollaborativeManager] User left:', message.userId);
	}

	/**
	 * Обновляет позицию курсора другого пользователя
	 * Данные обновляются в store и визуально рендерятся в UI
	 */
	private handleCursorMove(message: WebSocketMessage): void {
		if (!message.userId || !message.userName || message.is_local) return;

		const msg = message.msg as CursorPosition;
		const user: CollaborativeUser = {
			userId: message.userId,
			userName: message.userName,
			cursor: {
				blockId: msg.blockId,
				position: msg.position,
				timestamp: message.timestamp,
			},
		};

		store.updateCollaborativeUser(message.userId, user);

		window.dispatchEvent(
			new CustomEvent('collaborativeCursorMove', {
				detail: user,
			}),
		);
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

		console.log(
			'[CollaborativeManager] Dispatching collaborativeBlockUpdate:',
			{
				blockId: msg.blockId,
				userId: message.userId,
				isLocal: message.is_local,
				position,
				newContent,
			},
		);

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
		// if (message.isLocal) return;

		const msg = message.msg as DeleteCharMsg;
		const blocks = store.getActiveBlocks();
		const blockIndex = blocks.findIndex((b) => b.id === msg.blockId);

		if (blockIndex === -1) {
			console.warn('[CollaborativeManager] handleDeleteChar: block not found', {
				blockId: msg.blockId,
			});
			return;
		}

		const block = blocks[blockIndex];
		const position = msg.position ?? 0;
		if (position < 0 || position >= block.content.length) {
			console.warn(
				'[CollaborativeManager] handleDeleteChar: position out of bounds',
				{ position, contentLength: block.content.length },
			);
			return;
		}

		const newContent =
			block.content.slice(0, msg.position) +
			block.content.slice(msg.position + 1);

		block.content = newContent;
		store.setActiveBlocks([...blocks]);

		console.log(
			'[CollaborativeManager] Dispatching collaborativeBlockUpdate (delete):',
			{
				blockId: msg.blockId,
				userId: message.userId,
				position,
				newContent,
			},
		);

		window.dispatchEvent(
			new CustomEvent('collaborativeBlockUpdate', {
				detail: {
					blockId: msg.blockId,
					content: newContent,
					position: position,
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
		// if (message.is_local) return;

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
	private handleCreateBlock(message: WebSocketMessage): void {
		// if (message.is_local) return;

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
				store.setNotes(updatedNotes);
			}
		}

		window.dispatchEvent(
			new CustomEvent('collaborativeBlockCreate', {
				detail: {
					block: newBlock,
					userId: message.userId,
					focusBlockId: newBlock.id,
				},
			}),
		);
	}

	/**
	 * Обрабатывает удаление блока другим участником
	 * Удаляет блок из store и пересчитывает позиции
	 */
	private handleDeleteBlock(message: WebSocketMessage): void {
		if (message.is_local) return;

		const blockId = message.msg;
		const blocks = store.getActiveBlocks();
		const blockIndex = blocks.findIndex((b) => b.id === blockId);

		if (blockIndex === -1) return;

		const prevBlockId = blockIndex > 0 ? blocks[blockIndex - 1].id : null;
		const nextBlockId =
			blockIndex < blocks.length - 1 ? blocks[blockIndex + 1].id : null;
		const blockToFocus = prevBlockId || nextBlockId;

		const focusBlockId = blockToFocus;

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
				store.setNotes(updatedNotes);
			}
		}

		window.dispatchEvent(
			new CustomEvent('collaborativeBlockDelete', {
				detail: {
					blockId: blockId,
					userId: message.userId,
					focusBlockId: focusBlockId,
				},
			}),
		);

		if (focusBlockId) {
			const blockElement = document.querySelector(
				`.note__block[data-block-id="${focusBlockId}"]`,
			);
			if (blockElement) {
				const textLength = blockElement.textContent?.length || 0;
				collabManager.sendCursorMove(String(focusBlockId), textLength);
				window.dispatchEvent(
					new CustomEvent('collaborativeFocusBlock', {
						detail: {
							blockId: focusBlockId,
							position: 'end',
							userId: message.userId,
						},
					}),
				);
			}
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
		const activeNote = store.getActiveNote();

		if (!activeNote) return;

		activeNote.title = msg.title;
		store.setActiveNote(activeNote);

		window.dispatchEvent(
			new CustomEvent('collaborativeTitleUpdate', {
				detail: {
					title: msg.title,
					userId: message.userId,
				},
			}),
		);
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

		console.log('[CollaborativeManager] Synced state');
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
