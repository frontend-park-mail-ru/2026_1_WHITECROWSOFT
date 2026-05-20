import IconPopup, {
	IconType,
} from '../../../components/popups/iconPopup/iconPopup.js';
import { attachmentService } from '../../../services/attachmentService.js';
import { noteService } from '../../../services/noteService.js';
import { sidebarService } from '../../../services/sidebarService.js';
import { store } from '../../../store.js';
import type { ActiveNote, Note } from '../../../types.js';
import { collabManager } from '../../../utils/collaborativeManager.js';
import Component from '../../component.js';
import CoverBlock from './coverBlock/coverBlock.js';
import IconBlock from './iconBlock/iconBlock.js';
import templateString from './noteHeader.hbs?raw';

export default class NoteHeader extends Component {
	protected templateString = templateString;

	private activeNote: ActiveNote | null = null;
	private savedTitle: string = '';
	private coverBlock: CoverBlock | null = null;
	private iconBlock: IconBlock | null = null;
	private currentPopup: IconPopup | null = null;

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
		this.renderCover();
		this.renderIcon();
		this.updateButtonsVisibility();
		this.bindEvents();
	}

	private renderCover(): void {
		const container = this.domElement?.querySelector('[data-cover-container]');
		if (!container) return;
		container.innerHTML = '';
		const coverUrl = this.activeNote?.coverUrl || null;
		if (coverUrl) {
			this.coverBlock = new CoverBlock({
				coverUrl,
				onRemove: () => this.removeCover(),
				onChange: () => this.changeCover(),
			});
			this.coverBlock.renderTo(container as HTMLElement);
		} else {
			this.coverBlock = null;
		}
		this.updateButtonsVisibility();
	}

	private renderIcon(): void {
		const container = this.domElement?.querySelector('[data-icon-container]');
		if (!container) return;
		const iconUrl = this.activeNote?.iconUrl || null;
		container.innerHTML = '';
		if (iconUrl) {
			this.iconBlock = new IconBlock({
				iconUrl,
				onIcon: () => this.addIcon(),
			});
			this.iconBlock.renderTo(container as HTMLElement);
		} else {
			this.iconBlock = null;
		}
		this.updateButtonsVisibility();
	}

	private updateButtonsVisibility(): void {
		const coverBtn = this.domElement?.querySelector(
			'[data-action="cover"]',
		) as HTMLElement;
		const iconBtn = this.domElement?.querySelector(
			'[data-action="icon"]',
		) as HTMLElement;
		const hasCover = !!this.activeNote?.coverUrl;
		const hasIcon = !!this.activeNote?.iconUrl;
		if (coverBtn) {
			coverBtn.style.display = hasCover ? 'none' : 'flex';
		}
		if (iconBtn) {
			iconBtn.style.display = hasIcon ? 'none' : 'flex';
		}
	}

	private createFileInput(
		accept: string,
		onFileSelect: (file: File) => Promise<void>,
	): void {
		const fileInput = document.createElement('input');
		fileInput.type = 'file';
		fileInput.accept = accept;
		fileInput.style.display = 'none';

		fileInput.onchange = async (e: Event) => {
			const target = e.target as HTMLInputElement;
			const file = target.files?.[0];
			if (!file) {
				fileInput.remove();
				return;
			}
			await onFileSelect(file);
			fileInput.remove();
		};

		document.body.appendChild(fileInput);
		fileInput.click();
	}

	private async addCover(): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId || !this.activeNote) return;
		this.createFileInput('image/*', async (file) => {
			const updatedNote = await attachmentService.createCover(
				activeNoteId,
				file,
			);
			if (updatedNote) {
				this.activeNote!.coverUrl = updatedNote.coverUrl;
				this.renderCover();
			}
		});
	}

	private async removeCover(): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (activeNoteId && this.activeNote) {
			await attachmentService.deleteCover(activeNoteId);
			this.activeNote.coverUrl = null;
			this.renderCover();
			this.updateButtonsVisibility();
		}
	}

	private async changeCover(): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId || !this.activeNote) return;

		this.createFileInput('image/*', async (file) => {
			const updatedNote = await attachmentService.createCover(
				activeNoteId,
				file,
			);
			if (updatedNote) {
				this.activeNote!.coverUrl = updatedNote.coverUrl;
				this.renderCover();
			}
		});
	}

	private async addIcon(): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId || !this.activeNote) return;

		const iconBtn = this.domElement?.querySelector(
			'[data-action="icon"]',
		) as HTMLElement;
		if (!iconBtn) return;
		let currentIcon: IconType | null = null;
		if (this.activeNote.iconUrl) {
			if (this.activeNote.iconUrl.includes('personal'))
				currentIcon = 'personal';
			else if (this.activeNote.iconUrl.includes('shared'))
				currentIcon = 'shared';
			else if (this.activeNote.iconUrl.includes('favorite'))
				currentIcon = 'favorite';
			else if (this.activeNote.iconUrl.includes('draft')) currentIcon = 'draft';
		}
		this.currentPopup?.close();
		this.currentPopup = new IconPopup({
			anchorElement: iconBtn,
			currentIcon: currentIcon,
			noteId: activeNoteId,
			onSelect: (iconType) => {
				const iconUrl = `/icons/icon_${iconType}.svg`;
				this.activeNote!.iconUrl = iconUrl;
				this.renderIcon();
				this.updateButtonsVisibility();
			},
			onRemove: () => this.removeIcon(),
		});
		this.currentPopup.open();
	}

	private async removeIcon(): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (activeNoteId && this.activeNote) {
			await noteService.updateNote(activeNoteId, {
				title: store.getActiveNote()?.title,
				iconUrl: null,
			});
			this.activeNote.iconUrl = null;
			this.renderIcon();
			this.updateButtonsVisibility();
		}
	}

	private bindEvents(): void {
		const titleEl = this.domElement?.querySelector(
			'.note__title',
		) as HTMLInputElement;
		const coverBtn = this.domElement?.querySelector('[data-action="cover"]');
		const iconBtn = this.domElement?.querySelector('[data-action="icon"]');
		if (titleEl) {
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
		coverBtn?.addEventListener('click', (e) => {
			e.stopPropagation();
			this.addCover();
		});
		iconBtn?.addEventListener('click', (e) => {
			e.stopPropagation();
			this.addIcon();
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
		this.renderCover();
		this.renderIcon();
		this.updateButtonsVisibility();
	}

	destroy(): void {
		this.coverBlock?.destroy();
		this.iconBlock?.destroy();
	}
}
