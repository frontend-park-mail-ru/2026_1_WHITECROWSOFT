import '../../../assets/style/genericPopup.scss';
import { noteService } from '../../../services/noteService.js';
import { store } from '../../../store.js';
import { getElementPosition } from '../../../utils/utils.js';
import Component from '../../component.js';
import { alertDialog, confirmDialog } from '../confirmDialog/confirmDialog.js';
import { db } from './../../../db.js';
import { collabManager } from './../../../utils/collaborativeManager.js';
import templateString from './notePopup.hbs?raw';

interface NotePopupOptions {
	noteId: string | number;
	anchorElement: HTMLElement;
	titleElement?: HTMLElement;
	onRenameComplete?: () => void;
	onShareComplete?: () => void;
	onPinComplete?: () => void;
}

export default class NotePopup extends Component {
	protected templateString = templateString;
	private noteId: string | number;
	private anchorElement: HTMLElement;
	private titleElement?: HTMLElement;

	private boundHandlers: {
		onDocumentClick?: (e: MouseEvent) => void;
		onEscape?: (e: KeyboardEvent) => void;
		onDelete?: () => void;
		onRename?: () => void;
		onRenameComplete?: () => void;
		onShare?: () => void;
		onShareComplete?: () => void;
		onPin?: () => void;
		onPinComplete?: () => void;
		onPdf?: () => void;
	} = {};

	constructor(options: NotePopupOptions) {
		super();
		this.noteId = options.noteId;
		this.anchorElement = options.anchorElement;
		this.titleElement = options.titleElement;
		this.boundHandlers.onRenameComplete = options.onRenameComplete;
		this.boundHandlers.onShareComplete = options.onShareComplete;
		this.boundHandlers.onPinComplete = options.onPinComplete;
	}

	protected getTemplateData() {
		const note = store.getNotes().find((n) => n.ID === this.noteId);
		return {
			noteId: this.noteId,
			isFavorite: note?.is_favorite === true,
      canShare: store.getOnline() && !note?.is_public,
			isOnline: store.getOnline(),
		};
	}

	renderTo(container: HTMLElement | null): void {
		if (!container) return;
		const temp = document.createElement('div');
		temp.innerHTML = this.render();
		const popupElement = temp.firstChild as HTMLElement;
		if (popupElement) {
			this.domElement = popupElement;
			container.appendChild(popupElement);
			this.onRender();
		}
	}

	onRender(): void {
		this.position();
		this.bindGlobalCloseHandlers();
		this.bindPopupEvents();
		this.domElement?.dispatchEvent(
			new CustomEvent('popup:opened', {
				detail: { noteId: this.noteId },
			}),
		);
	}

	private position(): void {
		if (!this.anchorElement || !this.domElement) return;
		const rect = getElementPosition(this.anchorElement);
		this.domElement.style.top = `${rect.bottom + window.scrollY + 5}px`;
		this.domElement.style.left = `${rect.left + window.scrollX}px`;
		this.domElement.style.zIndex = `20`;
	}

	private bindGlobalCloseHandlers(): void {
		this.boundHandlers.onDocumentClick = (e: MouseEvent) => {
			if (!this.domElement?.contains(e.target as Node)) {
				this.close();
			}
		};
		this.boundHandlers.onEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				this.close();
			}
		};
		document.addEventListener('click', this.boundHandlers.onDocumentClick);
		document.addEventListener('keydown', this.boundHandlers.onEscape);
	}

	private unbindGlobalCloseHandlers(): void {
		if (this.boundHandlers.onDocumentClick) {
			document.removeEventListener('click', this.boundHandlers.onDocumentClick);
		}
		if (this.boundHandlers.onEscape) {
			document.removeEventListener('keydown', this.boundHandlers.onEscape);
		}
	}

	private bindPopupEvents(): void {
		const deleteBtn = this.domElement?.querySelector('[data-action="delete"]');
		const renameBtn = this.domElement?.querySelector('[data-action="rename"]');
		const pinBtn = this.domElement?.querySelector('[data-action="pin"]');
		const shareBtn = this.domElement?.querySelector('[data-action="share"]');
		const pdfBtn = this.domElement?.querySelector('[data-action="pdf"]');

		if (deleteBtn) {
			this.boundHandlers.onDelete = async () => {
				await this.handleDelete();
			};
			deleteBtn.addEventListener('click', this.boundHandlers.onDelete);
		}

		if (renameBtn) {
			this.boundHandlers.onRename = () => {
				this.handleRename();
			};
			renameBtn.addEventListener('click', this.boundHandlers.onRename);
		}

		if (pinBtn) {
			this.boundHandlers.onPin = () => {
				this.handlePin();
			};
			pinBtn.addEventListener('click', this.boundHandlers.onPin);
		}

		if (shareBtn) {
			this.boundHandlers.onShare = async () => {
				await this.handleShare();
			};
			shareBtn.addEventListener('click', this.boundHandlers.onShare);
		}

		if (pdfBtn) {
			this.boundHandlers.onPdf = () => {
				this.handlePdf();
			};
			pdfBtn.addEventListener('click', this.boundHandlers.onPdf);
		}
	}

	private unbindPopupEvents(): void {
		const deleteBtn = this.domElement?.querySelector('[data-action="delete"]');
		const renameBtn = this.domElement?.querySelector('[data-action="rename"]');
		const pinBtn = this.domElement?.querySelector('[data-action="pin"]');
		const shareBtn = this.domElement?.querySelector('[data-action="share"]');
		const pdfBtn = this.domElement?.querySelector('[data-action="pdf"]');

		if (deleteBtn && this.boundHandlers.onDelete) {
			deleteBtn.removeEventListener('click', this.boundHandlers.onDelete);
		}
		if (renameBtn && this.boundHandlers.onRename) {
			renameBtn.removeEventListener('click', this.boundHandlers.onRename);
		}
		if (pinBtn && this.boundHandlers.onPin) {
			pinBtn.removeEventListener('click', this.boundHandlers.onPin);
		}
		if (shareBtn && this.boundHandlers.onShare) {
			shareBtn.removeEventListener('click', this.boundHandlers.onShare);
		}
		if (pdfBtn && this.boundHandlers.onPdf) {
			pdfBtn.removeEventListener('click', this.boundHandlers.onPdf);
		}
	}

	private async handleDelete(): Promise<void> {
		const confirmed = await confirmDialog({
			title: 'Удаление заметки',
			message: 'Вы действительно хотите удалить эту заметку?',
			confirmText: 'Удалить',
			danger: true,
		});
		if (!confirmed) return;

		try {
			await noteService.deleteNote(this.noteId);
			this.close();
		} catch (error) {
			console.error('Error deleting note:', error);
		}
	}

	private async handleShare(): Promise<void> {
		try {
			const result = await noteService.updateNote(this.noteId, {
				is_public: true,
				title: this.titleElement?.textContent,
			});
			if (result) {
				db.settingsSet('activeNoteSection', 'shared');
				const noteIdStr = String(this.noteId);
				const shareUrl = `${window.location.origin}/?note=${noteIdStr}`;
				await navigator.clipboard.writeText(shareUrl);
				collabManager.startCollab(noteIdStr);
				await alertDialog({
					title: 'Заметка опубликована',
					message:
						'Заметка стала публичной. Ссылка на заметку скопирована в буфер обмена',
				});
				this.boundHandlers.onShareComplete?.();
			}
			this.close();
		} catch (error) {
			console.error('Failed to share note:', error);
			await alertDialog({
				title: 'Ошибка',
				message: 'Не удалось сделать заметку публичной',
			});
		}
	}

	private async handlePdf(): Promise<void> {
		try {
			const blob = await noteService.exportToPdf(this.noteId);
			if (blob) {
				const note = store.getNotes().find((n) => n.ID === this.noteId);
				const filename = `${note?.title || 'note'}.pdf`;
				const blobUrl = window.URL.createObjectURL(blob);
				const link = document.createElement('a');
				link.href = blobUrl;
				link.download = filename;
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				window.URL.revokeObjectURL(blobUrl);
			}
			this.close();
		} catch (error) {
			const err = error as Error;
			if (err.message !== 'Unauthorized') {
				console.error('Failed to download PDF:', error);
				await alertDialog({
					title: 'Ошибка',
					message: 'Не удалось экспортировать заметку в PDF',
				});
			}
			this.close();
		}
	}

	private handleRename(): void {
		const titleElement = this.titleElement;
		if (!titleElement) {
			console.error('Title element not found');
			this.close();
			return;
		}
		const currentTitle = titleElement.textContent || '';
		const input = document.createElement('input');
		input.type = 'text';
		input.value = currentTitle;
		input.className = 'inline-edit-input';
		let isSaved = false;
		const cleanup = (): void => {
			titleElement.style.display = '';
			input.remove();
		};
		const save = async (): Promise<void> => {
			if (isSaved) return;
			isSaved = true;
			const newTitle = input.value.trim();
			if (newTitle && newTitle !== currentTitle) {
				try {
					const result = await noteService.updateNote(this.noteId, {
						title: newTitle,
					});
					if (!result) {
						throw new Error('Failed to rename note');
					}
					titleElement.textContent = newTitle;
					this.boundHandlers.onRenameComplete?.();
				} catch (error) {
					console.error('Failed to rename note:', error);
					titleElement.textContent = currentTitle;
				}
			}
			cleanup();
			this.close();
		};

		const cancel = (): void => {
			if (isSaved) return;
			isSaved = true;
			titleElement.textContent = currentTitle;
			cleanup();
			this.close();
		};

		titleElement.style.display = 'none';
		titleElement.parentNode?.insertBefore(input, titleElement);
		input.focus();
		input.addEventListener('blur', () => {
			if (isSaved) return;
			save();
		});
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				e.stopPropagation();
				input.removeEventListener('blur', save);
				save();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				cancel();
			}
		});
	}

	private async handlePin(): Promise<void> {
		try {
			const note = store
				.getNotes()
				.filter((note) => note.ID === this.noteId)[0];
			await noteService.updateNote(this.noteId, {
				is_favorite: !note.is_favorite,
				title: this.titleElement?.textContent,
			});
			this.boundHandlers.onPinComplete?.();
			this.close();
		} catch (error) {
			console.error('Failed to pinn note:', error);
		}
	}

	close(): void {
		if (!this.domElement) return;
		this.unbindGlobalCloseHandlers();
		this.unbindPopupEvents();
		this.domElement.dispatchEvent(new CustomEvent('popup:closing'));
		this.domElement.remove();
		this.domElement = null;
	}

	getElement(): HTMLElement | null {
		return this.domElement;
	}

	destroy(): void {
		this.close();
	}
}
