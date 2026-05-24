import IconPopup, {
	IconType,
} from '../../../components/popups/iconPopup/iconPopup.js';
import { attachmentService } from '../../../services/attachmentService.js';
import { noteService } from '../../../services/noteService.js';
import { sidebarService } from '../../../services/sidebarService.js';
import { store } from '../../../store.js';
import type { ActiveNote } from '../../../types.js';
import Component from '../../component.js';
import CoverBlock from './coverBlock/coverBlock.js';
import IconBlock from './iconBlock/iconBlock.js';
import templateString from './noteHeader.hbs?raw';
import './noteHeader.scss';

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

	private async renderCover(): Promise<void> {
		const container = this.domElement?.querySelector('[data-cover-container]');
		if (!container) return;
		if (!this.activeNote) return;
		const newCoverUrl = await attachmentService.getCoverUrl(
			this.activeNote!.ID,
		);
		const currentCoverUrl = this.coverBlock
			? this.coverBlock.getCoverUrl()
			: null;
		if (newCoverUrl === currentCoverUrl) return;
		if (this.coverBlock) {
			this.coverBlock.destroy();
			this.coverBlock = null;
		}
		container.innerHTML = '';
		if (newCoverUrl) {
			this.coverBlock = new CoverBlock({
				coverUrl: newCoverUrl,
				onRemove: () => this.removeCover(),
				onChange: () => this.changeCover(),
			});
			this.coverBlock.renderTo(container as HTMLElement);
		}
		this.updateButtonsVisibility();
	}

	private renderIcon(): void {
		const container = this.domElement?.querySelector('[data-icon-container]');
		if (!container) return;
		const newIcon = this.activeNote?.icon || null;
		const currentIcon = this.iconBlock?.getIcon() || null;
		if (newIcon === currentIcon) return;
		if (this.iconBlock) {
			this.iconBlock.destroy();
			this.iconBlock = null;
		}
		container.innerHTML = '';
		if (newIcon) {
			this.iconBlock = new IconBlock({
				icon: newIcon,
				onIcon: () => this.addIcon(),
			});
			this.iconBlock.renderTo(container as HTMLElement);
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
		const hasIcon = !!this.activeNote?.icon;

		if (coverBtn) coverBtn.style.display = hasCover ? 'none' : 'flex';
		if (iconBtn) iconBtn.style.display = hasIcon ? 'none' : 'flex';
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
				this.activeNote!.coverUrl =
					await attachmentService.getCoverUrl(activeNoteId);
			}
		});
	}

	private async removeCover(): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (activeNoteId && this.activeNote) {
			await attachmentService.deleteCover(activeNoteId);
			this.activeNote.coverUrl = null;
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
			}
		});
	}

	private async addIcon(): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId || !this.activeNote) return;
		const iconEl = this.domElement?.querySelector(
			'.note__icon',
		) as HTMLElement | null;
		const iconBtn = this.domElement?.querySelector(
			'[data-action="icon"]',
		) as HTMLElement | null;
		const anchor = iconEl ?? iconBtn;
		if (!anchor) return;
		let currentIcon: IconType | null = null;
		if (this.activeNote.icon) {
			if (this.activeNote.icon.includes('personal')) currentIcon = 'personal';
			else if (this.activeNote.icon.includes('shared')) currentIcon = 'shared';
			else if (this.activeNote.icon.includes('favorite'))
				currentIcon = 'favorite';
			else if (this.activeNote.icon.includes('draft')) currentIcon = 'draft';
		}
		this.currentPopup?.close();
		this.currentPopup = new IconPopup({
			anchorElement: anchor,
			currentIcon,
			noteId: activeNoteId,
			onSelect: (iconType) => {
				const icon = `/icons/icon_${iconType}.svg`;
				this.activeNote!.icon = icon;
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
				icon: null,
				title: this.activeNote.title,
			});
			this.activeNote.icon = null;
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
					store.setActiveNote({ ...activeNote, title: newTitle, breadcrumb });
				}
				this.updateBreadcrumbDisplay();
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
		if (breadcrumbEl) breadcrumbEl.textContent = breadcrumb;
	}

	updateNote(activeNote: ActiveNote | null): void {
		if (
			this.activeNote?.ID === activeNote?.ID &&
			this.activeNote?.coverUrl === activeNote?.coverUrl &&
			this.activeNote?.icon === activeNote?.icon &&
			this.activeNote?.title === activeNote?.title
		) {
			return;
		}
		this.activeNote = activeNote;
		const titleEl = this.domElement?.querySelector(
			'.note__title',
		) as HTMLInputElement;
		const breadcrumbEl = this.domElement?.querySelector(
			'.note__breadcrumbItem--current',
		);
		const breadcrumb = sidebarService.getBreadcrumb(activeNote?.ID);

		if (titleEl && titleEl.value !== (activeNote?.title || '')) {
			titleEl.value = activeNote?.title || '';
		}
		if (breadcrumbEl) breadcrumbEl.textContent = breadcrumb;
		this.renderCover();
		this.renderIcon();
		this.updateButtonsVisibility();
	}

	destroy(): void {
		this.coverBlock?.destroy();
		this.iconBlock?.destroy();
		this.currentPopup?.close();
		this.coverBlock = null;
		this.iconBlock = null;
		this.currentPopup = null;
	}
}
