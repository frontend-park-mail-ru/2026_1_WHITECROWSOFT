export interface User {
	id: string | number;
	username: string;
	email: string | null;
	avatar: string | null;
}

export interface Note {
	ID: string | number;
	title: string;
	icon: string | null;
	updatedAt: string | number;
	blocks?: Block[];
	parent_id?: string | number | null;
	isLocal?: boolean;
	is_public?: boolean;
	is_favorite?: boolean;
	breadcrumb?: string;
	section?: 'personal' | 'shared' | 'favorite';
}

export interface ActiveNote {
	ID: string | number;
	title: string;
	breadcrumb: string;
	text: string;
	section?: 'personal' | 'shared' | 'favorite';
}

export interface RecentNote {
	noteId: string | number;
	lastOpenedAt: number;
	title: string;
}

export interface SidebarNote {
	id: string | number;
	title: string;
	parentId: string | number | null;
	children: SidebarNote[];
	isExpanded: boolean;
	isActive: boolean;
	level: number;
}

export interface Block {
	id: string | number;
	note_id?: string | number;
	block_type_id: number;
	content: string;
	position: number;
	formatting?: BlockFormatting | null;
	created_at?: string;
	updated_at?: string;
	isLocal?: boolean;
	subnote_id?: string | number;
}

export interface BlockFormatting {
	ranges: FormattingRange[];
}

export interface FormattingRange {
	start_pos: number;
	end_pos: number;
	bold: boolean | null;
	italic: boolean | null;
	underline: boolean | null;
}

export interface ImageAttachment {
	id: string | number;
	blockId: string | number;
	noteId: string | number;
	blob?: Blob;
	filename: string;
	mimeType: string;
	size: number;
	url?: string;
	status: 'pending' | 'synced' | 'failed';
	isLocal?: boolean;
	createdAt?: number;
	syncedAt?: number;
	timestamp?: number;
}

export interface AudioAttachment {
	id: string | number;
	blockId: string | number;
	noteId: string | number;
	blob?: Blob;
	filename: string;
	mimeType: string;
	size: number;
	url?: string;
	status: 'pending' | 'synced' | 'failed';
	isLocal?: boolean;
	createdAt?: number;
	syncedAt?: number;
	timestamp?: number;
}

export interface VideoAttachment {
	id: string | number;
	blockId: string | number;
	noteId: string | number;
	blob?: Blob;
	filename: string;
	mimeType: string;
	size: number;
	url?: string;
	status: 'pending' | 'synced' | 'failed';
	isLocal?: boolean;
	createdAt?: number;
	syncedAt?: number;
	timestamp?: number;
}

export interface QueueFile {
	id: string;
	blockId: string | number;
	noteId: string | number;
	blob: Blob;
	filename: string;
	mimeType: string;
	size: number;
	queuedAt: number;
}

export interface QueuedRequest {
	id?: number;
	method: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	endpoint: string;
	body?: unknown | null;
	formData?: FormData | null;
	localId?: string | null;
	type?: string | null;
	silent?: boolean;
	queuedAt: number;
	retryCount: number;
}

/**
 * Пользователь, участвующий в совместном редактировании заметки
 */
export interface CollaborativeUser {
	userId: string; // Уникальный ID пользователя
	userName: string; // Имя пользователя для отображения
	cursor: CursorPosition; // Текущая позиция курсора пользователя
}

/**
 * Позиция курсора пользователя в блоке
 */
export interface CursorPosition {
	blockId: string; // ID блока, в котором находится курсор
	position: number; // Позиция курсора в тексте блока
	timestamp: number; // Время последнего обновления позиции
}

/**
 * Типы сообщений WebSocket для совместного редактирования
 */
export type WebSocketMessageType =
	| 'user_joined' // Пользователь присоединился к редактированию
	| 'user_left' // Пользователь покинул редактирование
	| 'error' // Ошибка
	| 'sync_state' // Синхронизация состояния при подключении
	| 'heartbeat' // Проверка соединения
	| 'cursor_move' // Движение курсора
	| 'insert_char' // Вставка символа
	| 'delete_char' // Удаление символа
	| 'apply_formatting' // Применение форматирования
	| 'create_block' // Создание блока
	| 'delete_block' // Удаление блока
	| 'move_block' // Перемещение блока
	| 'update_note_title' // Обновление заголовка заметки
	| 'update_note_public' // Изменение публичности заметки
	| 'delete_note' // Удаление заметки
	| 'note_private' // Заметка стала приватной
	| 'note_deleted'; // Заметка удалена

/**
 * Структура сообщения WebSocket
 */
export interface WebSocketMessage {
	type: WebSocketMessageType; // Тип сообщения
	is_local?: boolean; // Флаг локального сообщения (не отправлять на сервер)
	userId?: string; // ID пользователя-отправителя
	userName?: string; // Имя пользователя-отправителя
	noteId?: string; // ID заметки
	blockId?: string; // ID блока (для операций с блоками)
	msg: unknown; // Полезная нагрузка сообщения
	timestamp: number; // Время отправки
}

/**
 * Сообщение о вставке символа
 */
export interface InsertCharMsg {
	blockId: string; // ID блока
	position: number; // Позиция вставки
	char: string; // Вставляемый символ
	uniqueId: string; // Уникальный ID операции для предотвращения дублирования
}

/**
 * Сообщение об удалении символа
 */
export interface DeleteCharMsg {
	blockId: string; // ID блока
	position: number; // Позиция удаления
	uniqueId: string; // Уникальный ID операции
}

/**
 * Сообщение о применении форматирования к тексту
 */
export interface ApplyFormattingMsg {
	blockId: string; // ID блока
	startPos: number; // Начальная позиция форматирования
	endPos: number; // Конечная позиция форматирования
	bold?: boolean | null; // Жирный текст
	italic?: boolean | null; // Курсив
	underline?: boolean | null; // Подчеркивание
	textAlign?: number | null; // Выравнивание текста
}

export interface CreateBlockMsg {
	block_type_id: number;
	position: number;
}

export interface MoveBlockMsg {
	blockId: string;
	newPosition: number;
}

export interface CursorMoveMsg {
	blockId: string;
	position: number;
}

/**
 * Состояние глобального store приложения
 */
export interface StoreState {
	user: User | null;
	notes: Note[];
	activeNoteId: string | number | null;
	activeNote: ActiveNote | null;
	activeBlocks: Block[];
	online: boolean;
	recentNotes: RecentNote[];
	pendingFocus: {
		blockId: string | number | null;
		offset: number | 'start' | 'end' | null;
	};
	collaborativeUsers: Map<string, CollaborativeUser>;
}

export interface ApiResponse<T = unknown> {
	data?: T;
	message?: string;
	status?: number;
}

export interface NoteApiResponse {
	id: string | number;
	title: string;
	updated_at?: string;
	parent_id?: string | number | null;
	is_public?: boolean;
	is_favorite?: boolean;
}

export interface BlockApiResponse {
	id: string | number;
	block_type_id: number;
	content: string;
	position: number;
	created_at?: string;
	updated_at?: string;
}

export interface AttachmentApiResponse {
	id: string;
	block_id: string;
	attach_url: string;
	minio_key?: string;
	created_at: string;
}

export interface UserSession {
	isAuthenticated: boolean;
	user: User | null;
	isOffline?: boolean;
	isStale?: boolean;
	requiresRedirect?: boolean;
	error?: {
		redirectTo?: string;
		message?: string;
	};
}

export interface FormState {
	formData: Record<string, unknown>;
	isSubmitting: boolean;
	serverError: string;
	errors: Record<string, string>;
	showPassword?: boolean;
	showPasswordConfirm?: boolean;
}

export type FormAction =
	| { type: 'INPUT_CHANGE'; payload: { fieldName: string; value: unknown } }
	| { type: 'SUBMIT_START' }
	| { type: 'SUBMIT_END' }
	| { type: 'SUBMIT_ERROR'; payload: string }
	| { type: 'VALIDATION_ERROR'; payload: Record<string, string> }
	| { type: 'CLEAR_ERROR'; payload: string }
	| { type: 'TOGGLE_PASSWORD'; payload: 'password' | 'passwordConfirm' };

export enum RequestEvents {
	NOTE_CREATE = 'NOTE_CREATE',
	BLOCK_CREATE = 'BLOCK_CREATE',
}
