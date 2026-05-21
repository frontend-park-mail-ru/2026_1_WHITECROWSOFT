import Component from '../../component.js';
import templateString from './confirmDialog.hbs?raw';
import './confirmDialog.scss';

interface ConfirmDialogOptions {
	message: string;
	title?: string;
	confirmText?: string;
	cancelText?: string;
	danger?: boolean;
}

export default class ConfirmDialog extends Component {
	protected templateString = templateString;

	private message: string;
	private title?: string;
	private confirmText: string;
	private cancelText: string;
	private danger: boolean;

	private resolveFn: ((value: boolean) => void) | null = null;
	private boundHandlers: {
		onBackdropClick?: (e: MouseEvent) => void;
		onKeydown?: (e: KeyboardEvent) => void;
		onConfirm?: () => void;
		onCancel?: () => void;
	} = {};

	constructor(options: ConfirmDialogOptions) {
		super();
		this.message = options.message;
		this.title = options.title;
		this.confirmText = options.confirmText ?? 'Подтвердить';
		this.cancelText = options.cancelText ?? 'Отмена';
		this.danger = options.danger ?? false;
	}

	protected getTemplateData() {
		return {
			title: this.title,
			message: this.message,
			confirmText: this.confirmText,
			cancelText: this.cancelText,
			danger: this.danger,
		};
	}

	open(): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			this.resolveFn = resolve;
			this.renderTo(document.body);
		});
	}

	renderTo(container: HTMLElement | null): void {
		if (!container) return;
		const temp = document.createElement('div');
		temp.innerHTML = this.render();
		const dialogElement = temp.firstChild as HTMLElement;
		if (dialogElement) {
			this.domElement = dialogElement;
			container.appendChild(dialogElement);
			this.onRender();
		}
	}

	protected onRender(): void {
		this.bindEvents();
		const confirmBtn = this.domElement?.querySelector<HTMLButtonElement>(
			'[data-action="confirm"]',
		);
		confirmBtn?.focus();
	}

	private bindEvents(): void {
		if (!this.domElement) return;

		const confirmBtn = this.domElement.querySelector('[data-action="confirm"]');
		const cancelBtn = this.domElement.querySelector('[data-action="cancel"]');

		this.boundHandlers.onConfirm = () => this.resolve(true);
		this.boundHandlers.onCancel = () => this.resolve(false);
		confirmBtn?.addEventListener('click', this.boundHandlers.onConfirm);
		cancelBtn?.addEventListener('click', this.boundHandlers.onCancel);

		this.boundHandlers.onBackdropClick = (e: MouseEvent) => {
			if (e.target === this.domElement) {
				this.resolve(false);
			}
		};
		this.domElement.addEventListener(
			'click',
			this.boundHandlers.onBackdropClick,
		);

		this.boundHandlers.onKeydown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				this.resolve(false);
			} else if (e.key === 'Enter') {
				e.preventDefault();
				this.resolve(true);
			}
		};
		document.addEventListener('keydown', this.boundHandlers.onKeydown);
	}

	private unbindEvents(): void {
		if (this.domElement && this.boundHandlers.onBackdropClick) {
			this.domElement.removeEventListener(
				'click',
				this.boundHandlers.onBackdropClick,
			);
		}
		if (this.boundHandlers.onKeydown) {
			document.removeEventListener('keydown', this.boundHandlers.onKeydown);
		}
	}

	private resolve(value: boolean): void {
		const fn = this.resolveFn;
		this.resolveFn = null;
		this.close();
		fn?.(value);
	}

	close(): void {
		if (!this.domElement) return;
		this.unbindEvents();
		this.domElement.remove();
		this.domElement = null;
		if (this.resolveFn) {
			const fn = this.resolveFn;
			this.resolveFn = null;
			fn(false);
		}
	}

	destroy(): void {
		this.close();
	}
}

export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
	return new ConfirmDialog(options).open();
}
