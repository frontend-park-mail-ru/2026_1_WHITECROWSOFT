import { db } from '../../db.js';
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

const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 500;
const DEFAULT_SIDEBAR_WIDTH = 250;

export default class Sidebar extends Component {
	protected templateString = templateString;
	private personalSection: NoteSection | null = null;
	private sharedSection: NoteSection | null = null;
	private favoriteSection: NoteSection | null = null;
	private currentPopup: NotePopup | null = null;
	private unsubscribeNotes: (() => void) | null = null;
	private unsubscribeActiveNoteId: (() => void) | null = null;
	private unsubscribeUser: (() => void) | null = null;

	private sidebarToggle: (() => void) | null = null;
	private resizePointerMove: ((e: PointerEvent) => void) | null = null;
	private resizePointerUp: ((e: PointerEvent) => void) | null = null;

	protected getTemplateData() {
		const user = store.getUser();
		return {
			user: {
				username: user?.username || 'Пользователь',
			},
		};
	}

	async onRender(): Promise<void> {
		this.renderSections();
		this.bindNavigationEvents();
		this.bindResizeHandle();
		await this.restoreSidebarWidth();
		this.subscribeToStore();
		this.subscribeToSyncEvents();
		this.updatePersonalNotes();
		this.updateSharedNotes();
		this.updatefavoriteNotes();
	}

	private async restoreSidebarWidth(): Promise<void> {
		const layout = document.getElementById('appLayout');
		if (!layout) return;
		const saved = await db.settingsGet<number>('sidebarWidth');
		const width = this.clampWidth(saved ?? DEFAULT_SIDEBAR_WIDTH);
		layout.style.setProperty('--sidebar-width', `${width}px`);
	}

	private clampWidth(value: number): number {
		if (!Number.isFinite(value)) return DEFAULT_SIDEBAR_WIDTH;
		return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, value));
	}

	private bindResizeHandle(): void {
		if (!this.domElement) return;
		const handle = this.domElement.querySelector(
			'[data-action="resize"]',
		) as HTMLElement | null;
		const layout = document.getElementById('appLayout');
		if (!handle || !layout) return;

		handle.addEventListener('pointerdown', (e: PointerEvent) => {
			if (e.button !== 0) return;
			e.preventDefault();

			const startX = e.clientX;
			const computed =
				getComputedStyle(layout).getPropertyValue('--sidebar-width');
			const startWidth = parseFloat(computed) || DEFAULT_SIDEBAR_WIDTH;

			handle.classList.add('sidebar__resizeHandle--active');
			layout.dataset.resizing = 'true';
			handle.setPointerCapture(e.pointerId);

			this.resizePointerMove = (moveEvent: PointerEvent) => {
				const next = this.clampWidth(startWidth + (moveEvent.clientX - startX));
				layout.style.setProperty('--sidebar-width', `${next}px`);
			};

			this.resizePointerUp = async (upEvent: PointerEvent) => {
				handle.releasePointerCapture(upEvent.pointerId);
				handle.classList.remove('sidebar__resizeHandle--active');
				delete layout.dataset.resizing;
				if (this.resizePointerMove) {
					handle.removeEventListener('pointermove', this.resizePointerMove);
					this.resizePointerMove = null;
				}
				if (this.resizePointerUp) {
					handle.removeEventListener('pointerup', this.resizePointerUp);
					handle.removeEventListener('pointercancel', this.resizePointerUp);
					this.resizePointerUp = null;
				}
				const finalWidth = parseFloat(
					getComputedStyle(layout).getPropertyValue('--sidebar-width'),
				);
				if (Number.isFinite(finalWidth)) {
					await db.settingsSet('sidebarWidth', finalWidth);
				}
			};

			handle.addEventListener('pointermove', this.resizePointerMove);
			handle.addEventListener('pointerup', this.resizePointerUp);
			handle.addEventListener('pointercancel', this.resizePointerUp);
		});

		handle.addEventListener('dblclick', async () => {
			layout.style.setProperty('--sidebar-width', `${DEFAULT_SIDEBAR_WIDTH}px`);
			await db.settingsSet('sidebarWidth', DEFAULT_SIDEBAR_WIDTH);
		});
	}

	private renderSections(): void {
		const personalContainer = this.domElement?.querySelector(
			'[data-section="personal"]',
		);
		const sharedContainer = this.domElement?.querySelector(
			'[data-section="shared"]',
		);
		const favoriteContainer = this.domElement?.querySelector(
			'[data-section="favorites"]',
		);

		if (personalContainer) {
			this.personalSection = new NoteSection({
				title: 'Личные заметки',
				section: 'personal',
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
				section: 'shared',
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

		if (favoriteContainer) {
			this.favoriteSection = new NoteSection({
				title: 'Избранное',
				section: 'favorite',
				notes: [],
				emptyMessage: 'Нет избранных заметок',
				onNoteClick: this.handleNoteClick,
				onToggle: this.handleToggle,
				onAddSubnote: this.handleAddSubnote,
				onSettingsClick: this.handleSettingsClick,
				onTitleDoubleClick: this.handleTitleDoubleClick,
			});
			this.favoriteSection.renderTo(favoriteContainer as HTMLElement);
		}
	}

	private updatePersonalNotes(): void {
		const tree = sidebarService.getPersonalTreeFromStore();
		this.personalSection?.updateNotes(tree);
	}

	private updateSharedNotes(): void {
		const tree = sidebarService.getPublicTreeFromStore();
		this.sharedSection?.updateNotes(tree);
	}

	private updatefavoriteNotes(): void {
		const tree = sidebarService.getfavoriteTreeFromStore();
		this.favoriteSection?.updateNotes(tree);
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
			this.updateSharedNotes();
			this.updatefavoriteNotes();
		});

		this.unsubscribeActiveNoteId = store.subscribe(
			'activeNoteId',
			async (noteId: string | number | null) => {
				const activeNote = store.getActiveNote();
				const section = activeNote?.section;
				if (section !== 'shared') {
					this.sharedSection?.updateActiveNote(null);
				}
				if (section !== 'favorite') {
					this.favoriteSection?.updateActiveNote(null);
				}
				if (section !== 'personal') {
					this.personalSection?.updateActiveNote(null);
				}

				if (section === 'shared') {
					this.sharedSection?.updateActiveNote(noteId);
				} else if (section === 'favorite') {
					this.favoriteSection?.updateActiveNote(noteId);
				} else {
					this.personalSection?.updateActiveNote(noteId);
				}

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

	private subscribeToSyncEvents(): void {
		window.addEventListener('syncNoteId', ((e: CustomEvent) => {
			const { serverId, localId } = e.detail;
			this.personalSection?.updateNoteId(localId, serverId);
			this.sharedSection?.updateNoteId(localId, serverId);
			this.favoriteSection?.updateNoteId(localId, serverId);
		}) as EventListener);
	}

	private handleNoteClick = async (
		noteId: string | number,
		section: 'personal' | 'shared' | 'favorite',
	): Promise<void> => {
		const note = store.getNotes().find((n) => n.ID === noteId);
		if (!note) return;
		const activeNote = {
			ID: noteId,
			title: note.title,
			breadcrumb: note.title,
			text: '',
			section: section,
		};
		store.setActiveNote(activeNote);
		store.setActiveNoteId(noteId);
		db.settingsSet('activeNoteId', noteId);
	};

	private handleToggle = (noteId: string | number): void => {
		sidebarService.toggleExpanded(noteId);
		this.updatePersonalNotes();
	};

	private handleAddSubnote = async (noteId: string | number): Promise<void> => {
		try {
			await subnoteService.createSubnoteWithBlock(
				noteId,
				'Новая подзаметка',
				null,
			);
			sidebarService.setExpanded(noteId, true);
			this.updatePersonalNotes();
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
				const note = store.getNotes().filter((note) => note.ID === noteId)[0];
				if (note.is_public === true) {
					this.updateSharedNotes();
				} else if (note.is_favorite === true) {
					this.updatefavoriteNotes();
				}
				this.updatePersonalNotes();
			},
			onShareComplete: async () => {
				this.updatePersonalNotes();
				this.updateSharedNotes();
			},
			onPinComplete: async () => {
				this.updatefavoriteNotes();
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
		this.unsubscribeActiveNoteId?.();
		this.unsubscribeUser?.();
		this.currentPopup?.close();
		this.personalSection?.destroy();
		this.sharedSection?.destroy();
		this.favoriteSection?.destroy();
	}
}
