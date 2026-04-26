import { router } from '../../route/router.js';
import { noteService } from '../../services/noteService.js';
import { store } from '../../store.js';
import type { Note, User } from '../../types.js';
import { startInlineEdit } from '../../utils/inlineEdit.js';
import Component from '../component.js';
import NotePopup from '../popups/notePopup/notePopup.js';
import NoteItems from './noteItems/noteItems.js';
import templateString from './sidebar.hbs?raw';
import './sidebar.scss';

export default class Sidebar extends Component {
	protected templateString = templateString;
	private recentNotesComponent: NoteItems | null = null;
	private personalNotesComponent: NoteItems | null = null;
	private sharedNotesComponent: NoteItems | null = null;
	private currentPopup: NotePopup | null = null;
	private unsubscribeNotes: (() => void) | null = null;
	private unsubscribeActiveNoteId: (() => void) | null = null;
	private unsubscribeUser: (() => void) | null = null;

	protected getTemplateData() {
		const user = store.getUser();
		return {
			user: {
				username: user?.username || 'Пользователь',
			},
			searchQuery: '',
		};
	}

	onRender(): void {
		this.renderSections();
		this.bindNavigationEvents();
		this.subscribeToStore();
		this.updateNoteComponents();
	}

	private renderSections(): void {
		const allNotes = store.getNotes();
		this.recentNotesComponent = this.renderSection(
			'recent-notes',
			allNotes.slice(0, 5),
			'Недавние заметки',
			'Нет недавних заметок',
		);
		this.personalNotesComponent = this.renderSection(
			'personal-notes',
			allNotes,
			'Личные заметки',
			'Нет личных заметок',
		);
		this.sharedNotesComponent = this.renderSection(
			'shared-notes',
			[],
			'Общие заметки',
			'Нет общих заметок',
		);
	}

	private renderSection(
		sectionName: string,
		notes: Note[],
		title: string,
		emptyMessage: string,
	): NoteItems {
		const container = this.domElement?.querySelector(
			`[data-section="${sectionName}"]`,
		);
		if (!container) {
			throw new Error(`Container ${sectionName} not found`);
		}
		const notesCopy = notes.map((note) => ({ ...note }));
		const component = new NoteItems({
			notes: notesCopy,
			activeNoteId: store.getActiveNoteId(),
			title,
			emptyMessage,
			onNoteClick: this.handleNoteClick,
			onAddSubnote: this.handleAddSubnote,
			onSettingsClick: this.handleSettingsClick,
			onTitleDoubleClick: this.handleTitleDoubleClick,
		});
		component.renderTo(container as HTMLElement);
		return component;
	}

	public updateNoteComponents(): void {
		const allNotes = store.getNotes();
		const activeNote = store.getActiveNoteId();
		this.recentNotesComponent?.syncNotes(
			allNotes.slice(0, 5).map((n) => ({ ...n })),
			activeNote,
		);
		this.personalNotesComponent?.syncNotes(
			allNotes.map((n) => ({ ...n })),
			activeNote,
		);
		this.sharedNotesComponent?.syncNotes([], activeNote);
	}

	public updateUser(user: User | null): void {
		const usernameSpan = this.domElement?.querySelector('#profile-username');
		if (usernameSpan && user) {
			usernameSpan.textContent = user.username || 'Пользователь';
		}
	}

	private bindNavigationEvents(): void {
		if (!this.domElement) return;
		const profileBtn = this.domElement.querySelector('[data-action="profile"]');
		const homeBtn = this.domElement.querySelector('[data-action="home"]');
		const newNoteBtn = this.domElement.querySelector('[data-action="newNote"]');
		profileBtn?.addEventListener('click', (e) => {
			e.preventDefault();
			router.push('/profile');
		});
		homeBtn?.addEventListener('click', (e) => {
			e.preventDefault();
			router.push('/');
		});
		newNoteBtn?.addEventListener('click', async (e) => {
			e.preventDefault();
			const btn = e.currentTarget as HTMLElement;
			if (!btn.dataset.pending) {
				btn.dataset.pending = 'true';
				await noteService.createNote({ title: 'Новая заметка' });
				delete btn.dataset.pending;
			}
		});
	}

	private subscribeToStore(): void {
		this.unsubscribeNotes = store.subscribe('notes', () => {
			this.updateNoteComponents();
		});
		this.unsubscribeActiveNoteId = store.subscribe(
			'activeNoteId',
			(noteId: string | number | null) => {
				this.recentNotesComponent?.updateActiveNote(noteId);
				this.personalNotesComponent?.updateActiveNote(noteId);
				this.sharedNotesComponent?.updateActiveNote(noteId);
			},
		);
		this.unsubscribeUser = store.subscribe('user', (user: User | null) => {
			const usernameSpan = this.domElement?.querySelector('#profile-username');
			if (usernameSpan && user) {
				usernameSpan.textContent = user.username || 'Пользователь';
			}
		});
	}

	private handleNoteClick = (noteId: string | number): void => {
		store.setActiveNoteId(noteId);
		router.push('/');
	};

	private handleAddSubnote = async (noteId: string | number): Promise<void> => {
		const activeNoteId = store.getActiveNoteId();
		if (activeNoteId) {
			await noteService.createBlock(activeNoteId, {
				note_id: noteId,
				block_type_id: 1,
				position: store.getActiveBlocks().length,
				content: '',
			});
		}
	};

	private handleSettingsClick = (
		noteId: string | number,
		anchor: HTMLElement,
	): void => {
		let currentSection: 'recent-notes' | 'personal-notes' | 'shared-notes' =
			'personal-notes';
		const sectionContainer = anchor.closest('.sidebar__section');
		if (sectionContainer) {
			const sectionName = sectionContainer.getAttribute('data-section');
			if (
				sectionName === 'recent-notes' ||
				sectionName === 'personal-notes' ||
				sectionName === 'shared-notes'
			) {
				currentSection = sectionName;
			}
		}

		this.currentPopup?.close();
		this.currentPopup = new NotePopup({
			noteId,
			anchorElement: anchor,
			onRename: () => {
				let titleElement: HTMLElement | null = null;
				switch (currentSection) {
					case 'recent-notes':
						titleElement =
							this.recentNotesComponent?.getNoteTitleElementById?.(noteId) ||
							null;
						break;
					case 'personal-notes':
						titleElement =
							this.personalNotesComponent?.getNoteTitleElementById?.(noteId) ||
							null;
						break;
					case 'shared-notes':
						titleElement =
							this.sharedNotesComponent?.getNoteTitleElementById?.(noteId) ||
							null;
						break;
				}
				if (titleElement) {
					startInlineEdit(titleElement, noteId);
				}
			},
		});
		this.currentPopup.renderTo(document.body);
	};

	private handleTitleDoubleClick = (
		noteId: string | number,
		element: HTMLElement,
	): void => {
		startInlineEdit(element, noteId);
	};

	destroy(): void {
		this.unsubscribeNotes?.();
		this.unsubscribeActiveNoteId?.();
		this.unsubscribeUser?.();
		this.currentPopup?.close();
		this.recentNotesComponent?.destroy();
		this.personalNotesComponent?.destroy();
		this.sharedNotesComponent?.destroy();
	}
}
