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
    isLocal?: boolean;
    breadcrumb?: string;
}

export interface ActiveNote {
    ID: string | number;
    title: string;
    breadcrumb: string;
    text: string;
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
}

export interface BlockFormatting {
    ranges: FormattingRange[];
}

export interface FormattingRange {
    start_pos: number;
    end_pos: number;
    bold?: boolean | null;
    italic?: boolean | null;
    underline?: boolean | null;
}

export interface ActiveNote {
	ID: string | number;
	title: string;
	breadcrumb: string;
	text: string;
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
    queuedAt: number;
    retryCount: number;
}


export interface StoreState {
	user: User | null;
	notes: Note[];
	activeNoteId: string | number | null;
	activeNote: ActiveNote | null;
	activeBlocks: Block[];
	online: boolean;
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
	UpdatedAt?: string;
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
	id: string | number;
	attach_url: string;
	minio_key?: string;
	size?: number;
	mime_type?: string;
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
