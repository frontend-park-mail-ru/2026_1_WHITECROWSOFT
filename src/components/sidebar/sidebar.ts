import Handlebars from 'handlebars';
import { noteService } from '../../services/noteService.js';
import { store } from '../../store.js';
import type { Note, User } from '../../types.js';
import { render } from '../../utils/utils.js';
import { NotePopup } from '../popups/notePopup/notePopup.js';
import { SupportPopup } from '../popups/supportPopup/supportPopup.js';
import notesTemplateString from './noteItems.hbs?raw';
import templateText from './sidebar.hbs?raw';
import './sidebar.scss';
import {
	bindNavigationEvents,
	startInlineEdit,
	updateActiveNote,
} from './sidebarEvents.js';

interface SidebarState {
	activeNoteId: string | number | null;
	notes: Note[];
	user: User | null;
}

export class Sidebar {
	private container: HTMLElement | null;
	private template: HandlebarsTemplateDelegate | null;
	private currentPopup: NotePopup | null;
	private state: SidebarState;
	private unsubscribeNotes: (() => void) | null;
	private unsubscribeActiveNoteId: (() => void) | null;
	private unsubscribeUser: (() => void) | null;

	constructor(containerSelector: string) {
		this.container = document.getElementById(containerSelector);
		this.template = null;
		this.currentPopup = null;
		this.state = {
			activeNoteId: store.getActiveNoteId(),
			notes: store.getNotes(),
			user: store.getUser(),
		};
		this.unsubscribeNotes = null;
		this.unsubscribeActiveNoteId = null;
		this.unsubscribeUser = null;
	}

	async init(): Promise<void> {
		if (!this.container) return;

		this.template = Handlebars.compile(templateText);
		render(this.container, this.template(this.state));
		this._bindEvents();
	}

	private _bindEvents(): void {
		if (!this.container) return;

		bindNavigationEvents(this.container);

		const addBlockBtn = this.container.querySelector(
			'#addSubnoteBtn',
		) as HTMLButtonElement | null;
		if (addBlockBtn) {
			addBlockBtn.addEventListener('click', async () => {
				const activeNoteId = store.getActiveNoteId();
				if (activeNoteId) {
					await noteService.createBlock(activeNoteId, {
						note_id: activeNoteId,
						block_type_id: 1,
						position: store.getActiveBlocks().length,
						content: '',
					});
				}
			});
		};

		const supportBtn = this.container.querySelector('[data-action="support"]') as HTMLButtonElement | null;
		if (supportBtn) {
			let supportPopup: SupportPopup | null = null;
		
			supportBtn.addEventListener('click', () => {
				if (!supportPopup) {
					supportPopup = new SupportPopup(supportBtn as HTMLElement);
				}
				supportPopup.toggle();
    		});
		}

		this.container.addEventListener('sidebar:openPopup', (e: Event) => {
			const customEvent = e as CustomEvent<{
				noteId: string | number;
				anchor: HTMLElement;
			}>;
			const { noteId, anchor } = customEvent.detail;
			this._openNotePopup(noteId, anchor);
		});

		this.container.addEventListener('sidebar:noteChanged', () => {
			this.currentPopup?.close();
		});

		this.unsubscribeNotes = store.subscribe('notes', (notes: Note[]) => {
			this.updateNotes(notes);
		});

		this.unsubscribeActiveNoteId = store.subscribe(
			'activeNoteId',
			(noteId: string | number | null) => {
				this.setActiveNote(noteId);
			},
		);

		this.unsubscribeUser = store.subscribe('user', (user: User | null) => {
			this.updateUser(user);
		});

		document.addEventListener('sidebar:startInlineEdit', (e: Event) => {
			const customEvent = e as CustomEvent<{ noteId: string | number }>;
			const { noteId } = customEvent.detail;
			this._startInlineEdit(noteId);
		});
	}

	private _openNotePopup(
		noteId: string | number,
		anchorElement: HTMLElement,
	): void {
		this.currentPopup?.close();
		this.currentPopup = new NotePopup(noteId, anchorElement);
		this.currentPopup.open();

		this.container?.dispatchEvent(
			new CustomEvent('sidebar:popupOpened', {
				detail: {
					noteId,
					popupElement: this.currentPopup.getElement(),
				},
			}),
		);
	}

	setActiveNote(noteId: string | number | null): void {
		this.state.activeNoteId = noteId;
		if (this.container) {
			updateActiveNote(this.container, noteId);
			const addBlockBtn = this.container.querySelector(
				'#addSubnoteBtn',
			) as HTMLButtonElement | null;
			if (addBlockBtn) {
				addBlockBtn.disabled = !noteId;
			}
		}
		this.container?.dispatchEvent(new CustomEvent('sidebar:noteChanged'));
	}

	updateNotes(notes: Note[]): void {
		this.state.notes = notes;
		const notesList = this.container?.querySelector('.sidebar__notesList');
		if (notesList) {
			const notesTemplate = Handlebars.compile(notesTemplateString);
			notesList.innerHTML = notesTemplate(this.state);
		}
	}

	updateUser(user: User | null): void {
		this.state.user = user;
		const usernameSpan = document.getElementById('profile-username');
		if (usernameSpan && user) {
			usernameSpan.textContent = user.username || 'Пользователь';
		}
	}

	private _startInlineEdit(noteId: string | number): void {
		if (!this.container) return;

		const noteItem = this.container.querySelector(
			`.sidebar__noteItem[data-note-id="${noteId}"]`,
		) as HTMLElement | null;
		if (noteItem) {
			const noteItemTitle = noteItem.querySelector(
				'.sidebar__noteItemTitle',
			) as HTMLElement | null;
			if (noteItemTitle) {
				startInlineEdit(noteItemTitle, noteId);
			}
		}
	}

	closePopup(): void {
		this.currentPopup?.close();
	}

	destroy(): void {
		this.currentPopup?.close();
		this.unsubscribeNotes?.();
		this.unsubscribeActiveNoteId?.();
		this.unsubscribeUser?.();
	}
}
