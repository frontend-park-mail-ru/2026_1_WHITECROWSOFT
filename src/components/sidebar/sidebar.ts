import { router } from '../../route/router.js';
import { noteService } from '../../services/noteService.js';
import { sidebarService } from '../../services/sidebarService.js';
import { subnoteService } from '../../services/subnoteService.js';
import { store } from '../../store.js';
import type { User } from '../../types.js';
import { collabManager } from '../../utils/collaborativeManager.js';
import Component from '../component.js';
import NotePopup from '../popups/notePopup/notePopup.js';
import NoteSection from './noteSection/noteSection.js';
import templateString from './sidebar.hbs?raw';
import './sidebar.scss';

export default class Sidebar extends Component {
	protected templateString = templateString;

	private recentSection: NoteSection | null = null;
	private personalSection: NoteSection | null = null;
	private sharedSection: NoteSection | null = null;
	private currentPopup: NotePopup | null = null;
	private unsubscribeNotes: (() => void) | null = null;
	private unsubscribeRecentNotes: (() => void) | null = null;
	private unsubscribeActiveNoteId: (() => void) | null = null;
	private unsubscribeUser: (() => void) | null = null;

	private sidebarToggle: (() => void) | null = null;

	protected getTemplateData() {
		const user = store.getUser();
		return {
			user: {
				username: user?.username || 'Пользователь',
			},
		};
	}

	async onRender(): Promise<void> {
		await store.loadRecentNotes();
		this.renderSections();
		this.bindNavigationEvents();
		this.subscribeToStore();
		this.updatePersonalNotes();
		await this.updateRecentNotes();
	}

	private renderSections(): void {
		const recentContainer = this.domElement?.querySelector(
			'[data-section="recent"]',
		);
		const personalContainer = this.domElement?.querySelector(
			'[data-section="personal"]',
		);
		const sharedContainer = this.domElement?.querySelector(
			'[data-section="shared"]',
		);

		if (recentContainer) {
			this.recentSection = new NoteSection({
				title: 'Недавние заметки',
				notes: [],
				emptyMessage: 'Нет недавних заметок',
				onNoteClick: this.handleNoteClick,
				onToggle: this.handleToggle,
				onAddSubnote: this.handleAddSubnote,
				onSettingsClick: this.handleSettingsClick,
				onTitleDoubleClick: this.handleTitleDoubleClick,
			});
			this.recentSection.renderTo(recentContainer as HTMLElement);
		}

		if (personalContainer) {
			this.personalSection = new NoteSection({
				title: 'Личные заметки',
				notes: [],
				emptyMessage: 'Нет личных заметок',
				onNoteClick: this.handleNoteClick,
				onToggle: this.handleToggle,
				onAddSubnote: this.handleAddSubnote,
				onSettingsClick: this.handleSettingsClick,
				onTitleDoubleClick: this.handleTitleDoubleClick,
			});
			this.personalSection.renderTo(personalContainer as HTMLElement);
		}

		if (sharedContainer) {
			this.sharedSection = new NoteSection({
				title: 'Общие заметки',
				notes: [],
				emptyMessage: 'Нет общих заметок',
				onNoteClick: this.handleNoteClick,
				onToggle: this.handleToggle,
				onAddSubnote: this.handleAddSubnote,
				onSettingsClick: this.handleSettingsClick,
				onTitleDoubleClick: this.handleTitleDoubleClick,
			});
			this.sharedSection.renderTo(sharedContainer as HTMLElement);
		}
	}

	private updatePersonalNotes(): void {
		const tree = sidebarService.getTreeFromStore();
		this.personalSection?.updateNotes(tree);
		this.sharedSection?.updateNotes([]);
	}

	private async updateRecentNotes(): Promise<void> {
		const recentNotes = await sidebarService.getRecentNotes();
		this.recentSection?.updateNotes(recentNotes);
	}

	private bindNavigationEvents(): void {
		if (!this.domElement) return;
		const profileBtn = this.domElement.querySelector('[data-action="profile"]');
		const homeBtn = this.domElement.querySelector('[data-action="home"]');
		const newNoteBtn = this.domElement.querySelector('[data-action="newNote"]');
		const toggleSidebarBtn = this.domElement.querySelector(
			'[data-action="toggleSidebar"]',
		);

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
				await noteService.createNote({
					title: 'Новая заметка',
					parent_id: null,
				});
				delete btn.dataset.pending;
			}
		});
		toggleSidebarBtn?.addEventListener('click', (e) => {
			e.preventDefault();
			this.sidebarToggle?.();
		});
	}

	private subscribeToStore(): void {
		this.unsubscribeNotes = store.subscribe('notes', () => {
			this.updatePersonalNotes();
		});
		this.unsubscribeRecentNotes = store.subscribe('recentNotes', () => {
			this.updateRecentNotes();
		});
		this.unsubscribeActiveNoteId = store.subscribe(
			'activeNoteId',
			async (noteId: string | number | null) => {
				this.recentSection?.updateActiveNote(noteId);
				this.personalSection?.updateActiveNote(noteId);
				this.sharedSection?.updateActiveNote(noteId);

				if (noteId) {
					const note = store.getNotes().find((n) => n.ID === noteId);
					if (note?.is_public) {
						await collabManager.startCollab(String(noteId));
					} else {
						collabManager.stopCollab();
					}
				}
			},
		);
		this.unsubscribeUser = store.subscribe('user', (user: User | null) => {
			const usernameSpan = this.domElement?.querySelector('#profile-username');
			if (usernameSpan && user) {
				usernameSpan.textContent = user.username || 'Пользователь';
			}
		});
	}

	private handleNoteClick = async (noteId: string | number): Promise<void> => {
		const note = store.getNotes().find((n) => n.ID === noteId);
		if (note) {
			await store.addToRecentNotes(noteId, note.title);
		}
		store.setActiveNoteId(noteId);
		router.push('/');
	};

	private handleToggle = (noteId: string | number): void => {
		sidebarService.toggleExpanded(noteId);
		this.updatePersonalNotes();
	};

	private handleAddSubnote = async (noteId: string | number): Promise<void> => {
		try {
			const subnote = await subnoteService.createSubnote(noteId, {
				title: 'Новая подзаметка',
				parent_id: noteId,
			});
			await subnoteService.createSubnoteBlock(
				noteId,
				subnote.ID,
				subnote.title,
			);
			sidebarService.setExpanded(noteId, true);
			this.updatePersonalNotes();
			await this.updateRecentNotes();
		} catch (error) {
			console.error('[Sidebar] Failed to create subnote:', error);
		}
	};

	private handleSettingsClick = (
		noteId: string | number,
		anchor: HTMLElement,
		titleElement: HTMLElement,
	): void => {
		this.currentPopup?.close();
		this.currentPopup = new NotePopup({
			noteId,
			anchorElement: anchor,
			titleElement: titleElement,
			onRenameComplete: async () => {
				this.updatePersonalNotes();
				this.updateRecentNotes();
			},
		});
		this.currentPopup.renderTo(document.body);
	};

	private handleTitleDoubleClick = (
		noteId: string | number,
		element: HTMLElement,
	): void => {
		console.log('Double click disabled for note:', noteId, element);
	};

	setSidebarToggle = (callback: () => void): void => {
		this.sidebarToggle = callback;
	};

	destroy(): void {
		this.unsubscribeNotes?.();
		this.unsubscribeRecentNotes?.();
		this.unsubscribeActiveNoteId?.();
		this.unsubscribeUser?.();
		this.currentPopup?.close();
		this.recentSection?.destroy();
		this.personalSection?.destroy();
		this.sharedSection?.destroy();
	}
}
