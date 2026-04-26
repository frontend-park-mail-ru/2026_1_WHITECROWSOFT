import '../../../assets/style/genericPopup.scss';
import { noteService } from '../../../services/noteService.js';
import { store } from '../../../store.js';
import { getElementPosition } from '../../../utils/utils.js';
import Component from '../../component.js';
import templateString from './notePopup.hbs?raw';

interface NotePopupOptions {
	noteId: string | number;
	anchorElement: HTMLElement;
	onRename: () => void;
}

export default class NotePopup extends Component {
	protected templateString = templateString;
	private noteId: string | number;
	private anchorElement: HTMLElement;
	private onRename: () => void;

	private boundHandlers: {
		onDocumentClick?: (e: MouseEvent) => void;
		onEscape?: (e: KeyboardEvent) => void;
		onDelete?: () => void;
		onRename?: () => void;
		onPin?: () => void;
	} = {};

	constructor(options: NotePopupOptions) {
		super();
		this.noteId = options.noteId;
		this.anchorElement = options.anchorElement;
		this.onRename = options.onRename;
	}

	protected getTemplateData() {
		return {
			noteId: this.noteId,
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
	}

	private unbindPopupEvents(): void {
		const deleteBtn = this.domElement?.querySelector('[data-action="delete"]');
		const renameBtn = this.domElement?.querySelector('[data-action="rename"]');
		const pinBtn = this.domElement?.querySelector('[data-action="pin"]');
		if (deleteBtn && this.boundHandlers.onDelete) {
			deleteBtn.removeEventListener('click', this.boundHandlers.onDelete);
		}
		if (renameBtn && this.boundHandlers.onRename) {
			renameBtn.removeEventListener('click', this.boundHandlers.onRename);
		}
		if (pinBtn && this.boundHandlers.onPin) {
			pinBtn.removeEventListener('click', this.boundHandlers.onPin);
		}
	}

	private async handleDelete(): Promise<void> {
		try {
			await noteService.deleteNote(this.noteId);
			const currentNotes = store.getNotes();
			const updatedNotes = currentNotes.filter((n) => n.ID !== this.noteId);
			store.setNotes(updatedNotes);
			if (store.getActiveNoteId() === this.noteId) {
				store.setActiveNoteId(null);
			}
			this.close();
		} catch (error) {
			console.error('Error deleting note:', error);
		}
	}

	private handleRename(): void {
		this.onRename();
		this.close();
	}

	private async handlePin(): Promise<void> {
		console.log('PIN');
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
