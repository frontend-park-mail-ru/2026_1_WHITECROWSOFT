import { noteService } from '../../../services/noteService.js';
import { sidebarService } from '../../../services/sidebarService.js';
import { store } from '../../../store.js';
import type { ActiveNote, Note } from '../../../types.js';
import { collabManager } from '../../../utils/collaborativeManager.js';
import Component from '../../component.js';
import templateString from './noteHeader.hbs?raw';

export default class NoteHeader extends Component {
	protected templateString = templateString;

	private activeNote: ActiveNote | null = null;
	private savedTitle: string = '';

	constructor() {
		super();
		this.activeNote = store.getActiveNote();
	}

	protected getTemplateData() {
		return {
			title: this.activeNote?.title || '',
			breadcrumb: sidebarService.getBreadcrumb(this.activeNote?.ID) || '',
		};
	}

	onRender(): void {
		this.bindEvents();
	}

	private bindEvents(): void {
		const titleEl = this.domElement?.querySelector(
			'.note__title',
		) as HTMLInputElement;
		if (!titleEl) return;
		titleEl.addEventListener('focus', () => {
			this.savedTitle = titleEl.value;
		});
		titleEl.addEventListener('blur', () => {
			this.saveTitle(titleEl);
		});
		titleEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				titleEl.blur();
			} else if (e.key === 'Escape') {
				titleEl.value = this.savedTitle;
				titleEl.blur();
			}
		});
	}

	private async saveTitle(input: HTMLInputElement): Promise<void> {
		const newTitle = input.value.trim();
		const activeNoteId = store.getActiveNoteId();
		if (!newTitle) {
			input.value = this.savedTitle;
			return;
		}
		if (activeNoteId && newTitle !== this.savedTitle) {
			try {
				await noteService.updateNote(activeNoteId, { title: newTitle }, false);
				const activeNote = store.getActiveNote();
				if (activeNote) {
					const breadcrumb = sidebarService.getBreadcrumb(activeNoteId);
					store.setActiveNote({
						...activeNote,
						title: newTitle,
						breadcrumb: breadcrumb,
					});
				}
				this.updateBreadcrumbDisplay();
				const note = store.getNotes().find((n: Note) => n.ID === activeNoteId);
				const isPublic = note?.is_public === true;
				if (isPublic) {
					collabManager.sendUpdateNoteTitle(newTitle);
				}
			} catch (error) {
				console.error('Error renaming note:', error);
				input.value = this.savedTitle;
			}
		}
	}

	private updateBreadcrumbDisplay(): void {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId) return;
		const breadcrumb = sidebarService.getBreadcrumb(activeNoteId);
		const breadcrumbEl = this.domElement?.querySelector(
			'.note__breadcrumbItem--current',
		);
		if (breadcrumbEl) {
			breadcrumbEl.textContent = breadcrumb;
		}
	}

	updateNote(activeNote: ActiveNote | null): void {
		this.activeNote = activeNote;
		const titleEl = this.domElement?.querySelector(
			'.note__title',
		) as HTMLInputElement;
		const breadcrumbEl = this.domElement?.querySelector(
			'.note__breadcrumbItem--current',
		);
		const breadcrumb = sidebarService.getBreadcrumb(activeNote?.ID);
		if (titleEl) titleEl.value = activeNote?.title || '';
		if (breadcrumbEl) breadcrumbEl.textContent = breadcrumb;
	}
}
