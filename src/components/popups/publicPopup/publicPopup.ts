import '../../../assets/style/genericPopup.scss';
import { collabManager } from '../../../utils/collaborativeManager.js';
import { getElementPosition } from '../../../utils/utils.js';
import Component from '../../component.js';
import templateString from './publicPopup.hbs?raw';

interface PublicNotePopupOptions {
	anchorElement: HTMLElement;
	onOpenNote: (noteId: string) => void;
}

export default class PublicNotePopup extends Component {
	protected templateString = templateString;
	private anchorElement: HTMLElement;
	private onOpenNote: (noteId: string) => void;

	private boundHandlers: {
		onDocumentClick?: (e: MouseEvent) => void;
		onEscape?: (e: KeyboardEvent) => void;
		onSubmit?: () => void;
	} = {};

	constructor(options: PublicNotePopupOptions) {
		super();
		this.anchorElement = options.anchorElement;
		this.onOpenNote = options.onOpenNote;
	}

	protected getTemplateData() {
		return {};
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

	open(): void {
		this.renderTo(document.body);
	}

	onRender(): void {
		this.position();
		this.bindGlobalCloseHandlers();
		this.bindPopupEvents();
		this.focusInput();
	}

	private focusInput(): void {
		const input = this.domElement?.querySelector('input');
		input?.focus();
	}

	private position(): void {
		if (!this.anchorElement || !this.domElement) return;
		const rect = getElementPosition(this.anchorElement);
		const popupRect = this.domElement.getBoundingClientRect();
		let top = rect.bottom + window.scrollY + 5;
		let left = rect.left + window.scrollX;

		if (left + popupRect.width > window.innerWidth) {
			left = window.innerWidth - popupRect.width - 10;
		}
		if (top + popupRect.height > window.innerHeight + window.scrollY) {
			top = rect.top + window.scrollY - popupRect.height - 5;
		}

		this.domElement.style.top = `${top}px`;
		this.domElement.style.left = `${left}px`;
		this.domElement.style.zIndex = '30';
		this.domElement.style.position = 'fixed';
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
		setTimeout(() => {
			document.addEventListener('click', this.boundHandlers.onDocumentClick!);
			document.addEventListener('keydown', this.boundHandlers.onEscape!);
		}, 0);
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
		const submitBtn = this.domElement?.querySelector('[data-action="submit"]');
		const cancelBtn = this.domElement?.querySelector('[data-action="cancel"]');
		const input = this.domElement?.querySelector('input');

		if (submitBtn) {
			this.boundHandlers.onSubmit = () => {
				const noteId = input?.value.trim();
				if (noteId) {
					this.onOpenNote(noteId);
					this.close();
				}
			};
			submitBtn.addEventListener('click', this.boundHandlers.onSubmit);
		}

		if (cancelBtn) {
			cancelBtn.addEventListener('click', () => this.close());
		}

		input?.addEventListener('keydown', async (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				const noteId = input.value.trim();
				if (noteId) {
					this.onOpenNote(noteId);
					await collabManager.startCollab(String(noteId));
					this.close();
				}
			} else if (e.key === 'Escape') {
				this.close();
			}
		});
	}

	private unbindPopupEvents(): void {
		const submitBtn = this.domElement?.querySelector('[data-action="submit"]');
		if (submitBtn && this.boundHandlers.onSubmit) {
			submitBtn.removeEventListener('click', this.boundHandlers.onSubmit);
		}
	}

	close(): void {
		if (!this.domElement) return;
		this.unbindGlobalCloseHandlers();
		this.unbindPopupEvents();
		this.domElement.remove();
		this.domElement = null;
	}

	destroy(): void {
		this.close();
	}
}
