import { noteService } from '../../../services/noteService.js';
import { store } from '../../../store.js';
import Component from '../../component.js';
import templateString from './iconPopup.hbs?raw';
import './iconPopup.scss';
export type IconType = 'personal' | 'shared' | 'favorite' | 'draft';

interface IconPopupOptions {
	anchorElement: HTMLElement;
	currentIcon?: IconType | null;
	noteId: string | number;
	onSelect?: (iconType: IconType) => void;
}

export default class IconPopup extends Component {
	protected templateString = templateString;

	private anchorElement: HTMLElement;
	private currentIcon: IconType | null;
	private noteId: string | number;
	private onSelect?: (iconType: IconType) => void;

	private boundHandlers: {
		onDocumentClick?: (e: MouseEvent) => void;
		onEscape?: (e: KeyboardEvent) => void;
	} = {};

	constructor(options: IconPopupOptions) {
		super();
		this.anchorElement = options.anchorElement;
		this.currentIcon = options.currentIcon || null;
		this.noteId = options.noteId;
		this.onSelect = options.onSelect;
	}

	protected getTemplateData() {
		return {
			iconType: this.currentIcon,
		};
	}

	open(): void {
		this.close();
		this.renderTo(document.body);
	}

	onRender(): void {
		if (this.anchorElement && this.domElement) {
			this.position();
		}
		this.bindGlobalCloseHandlers();
		this.bindPopupEvents();
	}

	private position(): void {
		if (!this.anchorElement || !this.domElement) return;
		const rect = this.anchorElement.getBoundingClientRect();
		this.domElement.style.position = 'fixed';
		this.domElement.style.top = `${rect.bottom + window.scrollY + 5}px`;
		this.domElement.style.left = `${rect.left + window.scrollX}px`;
		this.domElement.style.zIndex = '1000';
	}

	private bindGlobalCloseHandlers(): void {
		this.boundHandlers.onDocumentClick = (e: MouseEvent) => {
			if (!this.domElement?.contains(e.target as Node)) {
				this.close();
			}
		};
		this.boundHandlers.onEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') this.close();
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
		if (!this.domElement) return;

		const buttons = this.domElement.querySelectorAll('[data-action]');
		buttons.forEach((btn) => {
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const action = btn.getAttribute('data-action') as IconType;
				if (action) {
					const iconUrl = `/icons/icon_${action}.svg`;
					await noteService.updateNote(this.noteId, { iconUrl });
					const activeNote = store.getActiveNote();
					if (activeNote && activeNote.ID === this.noteId) {
						store.setActiveNote({
							...activeNote,
							iconUrl: iconUrl,
						});
					}
					this.onSelect?.(action);
					this.close();
				}
			});
		});
	}

	private unbindPopupEvents(): void {
		if (!this.domElement) return;
		const buttons = this.domElement.querySelectorAll('[data-action]');
		buttons.forEach((btn) => {
			btn.removeEventListener('click', () => {});
		});
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
