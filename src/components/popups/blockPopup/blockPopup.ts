import '../../../assets/style/genericPopup.scss';
import { getElementPosition } from '../../../utils/utils.js';
import Component from '../../component.js';
import templateString from './blockPopup.hbs?raw';

interface BlockPopupOptions {
	blockId: string;
	anchorElement: HTMLElement;
	onDelete?: (blockId: string) => void;
	onClose?: () => void;
}

export default class BlockPopup extends Component {
	protected templateString = templateString;

	private blockId: string;
	private anchorElement: HTMLElement;
	private onDelete?: (blockId: string) => void;
	private onClose?: () => void;

	private boundHandlers: {
		onDocumentClick?: (e: MouseEvent) => void;
		onEscape?: (e: KeyboardEvent) => void;
		onDelete?: () => void;
	} = {};

	constructor(options: BlockPopupOptions) {
		super();
		this.blockId = options.blockId;
		this.anchorElement = options.anchorElement;
		this.onDelete = options.onDelete;
		this.onClose = options.onClose;
	}

	protected getTemplateData() {
		return { blockId: this.blockId };
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
		this.close();
		this.renderTo(document.body);
	}

	onRender(): void {
		this.position();
		this.bindGlobalCloseHandlers();
		this.bindPopupEvents();
	}

	private position(): void {
		if (!this.anchorElement || !this.domElement) return;
		const rect = getElementPosition(this.anchorElement);
		const popupRect = this.domElement.getBoundingClientRect();
		const top = rect.bottom + window.scrollY + 5;
		let left = rect.left + window.scrollX;
		if (left + popupRect.width > window.innerWidth) {
			left = window.innerWidth - popupRect.width - 10;
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
		if (deleteBtn) {
			this.boundHandlers.onDelete = () => {
				this.onDelete?.(this.blockId);
				this.close();
			};
			deleteBtn.addEventListener('click', this.boundHandlers.onDelete);
		}
	}

	private unbindPopupEvents(): void {
		const deleteBtn = this.domElement?.querySelector('[data-action="delete"]');
		if (deleteBtn && this.boundHandlers.onDelete) {
			deleteBtn.removeEventListener('click', this.boundHandlers.onDelete);
		}
	}

	close(): void {
		if (!this.domElement) return;
		this.unbindGlobalCloseHandlers();
		this.unbindPopupEvents();
		this.domElement.remove();
		this.domElement = null;
		this.onClose?.();
	}

	getElement(): HTMLElement | null {
		return this.domElement;
	}

	destroy(): void {
		this.close();
	}
}
