import Handlebars from 'handlebars';
import '../../../assets/style/genericPopup.scss';
import { insertBlockInDOM } from '../../../pages/main/mainPage.js';
import { attachmentService } from '../../../services/attachmentService.js';
import { noteService } from '../../../services/noteService.js';
import { store } from '../../../store.js';
import { createElement } from '../../../utils/utils.js';
import templateText from './attachPopup.hbs?raw';

export class AttachPopup {
	private anchorElement: HTMLElement;
	private element: HTMLElement | null;
	private _onDocumentClick: ((e: MouseEvent) => void) | null;
	private _onEscape: ((e: KeyboardEvent) => void) | null;
	private fileInput: HTMLInputElement | null;
	private afterBlockId: string | null;

	constructor(anchorElement: HTMLElement, afterBlockId: string | null = null) {
		this.anchorElement = anchorElement;
		this.element = null;
		this._onDocumentClick = null;
		this._onEscape = null;
		this.fileInput = null;
		this.afterBlockId = afterBlockId;
	}

	open(): void {
		this.close();

		const html = Handlebars.compile(templateText)({});
		this.element = createElement('div', 'popup__wrapper');
		this.element.innerHTML = html;

		this.fileInput = document.createElement('input');
		this.fileInput.type = 'file';
		this.fileInput.accept = 'image/*';
		this.fileInput.style.display = 'none';
		this.element.appendChild(this.fileInput);

		this._position();
		document.body.appendChild(this.element);

		this._bindGlobalCloseHandlers();
		this._bindPopupEvents();

		this.element.dispatchEvent(new CustomEvent('popup:opened'));
	}

	close(): void {
		if (this.element) {
			this._unbindGlobalCloseHandlers();
			this.element.dispatchEvent(new CustomEvent('popup:closing'));
			this.element.remove();
			this.element = null;
			this.fileInput = null;
		}
	}

	private _position(): void {
		if (!this.anchorElement || !this.element) return;
		const rect = this.anchorElement.getBoundingClientRect();
		const popupRect = this.element.getBoundingClientRect();
		let top = rect.bottom + window.scrollY + 5;
		let left = rect.left + window.scrollX;
		if (left + popupRect.width > window.innerWidth) {
			left = window.innerWidth - popupRect.width - 10;
		}
		this.element.style.top = `${top}px`;
		this.element.style.left = `${left}px`;
	}

	private _bindGlobalCloseHandlers(): void {
		this._onDocumentClick = (e: MouseEvent) => {
			if (!this.element?.contains(e.target as Node)) this.close();
		};
		this._onEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') this.close();
		};
		document.addEventListener('click', this._onDocumentClick);
		document.addEventListener('keydown', this._onEscape);
	}

	private _unbindGlobalCloseHandlers(): void {
		if (this._onDocumentClick)
			document.removeEventListener('click', this._onDocumentClick);
		if (this._onEscape) document.removeEventListener('keydown', this._onEscape);
		this._onDocumentClick = null;
		this._onEscape = null;
	}

	private async _createAndInsertBlock(
		blockPromise: Promise<any>,
	): Promise<void> {
		const block = await blockPromise;
		if (block) {
			await insertBlockInDOM(block, this.afterBlockId);

			const currentBlocks = store.getActiveBlocks();
			const exists = currentBlocks.some((b) => b.id === block.id);
			if (!exists) {
				const updatedBlocks = [...currentBlocks, block];
				updatedBlocks.sort((a, b) => a.position - b.position);
				store.setActiveBlocksSilently(updatedBlocks);
			}
		}
	}

	private _bindPopupEvents(): void {
		if (!this.element) return;

		const textBtn = this.element.querySelector('[data-action="text"]');
		if (textBtn) {
			textBtn.addEventListener('click', async () => {
				const activeNoteId = store.getActiveNoteId();
				if (activeNoteId) {
					const blockPromise = noteService.createBlockAfter(
						activeNoteId,
						{
							note_id: activeNoteId,
							block_type_id: 1,
							content: '',
						},
						this.afterBlockId,
					);
					await this._createAndInsertBlock(blockPromise);
				}
				this.close();
			});
		}

		const pictureBtn = this.element.querySelector('[data-action="picture"]');
		if (pictureBtn) {
			pictureBtn.addEventListener('click', () => {
				if (this.fileInput) this.fileInput.click();
			});
		}

		const tableBtn = this.element.querySelector('[data-action="table"]');
		if (tableBtn) {
			tableBtn.addEventListener('click', () => {
				console.log('Add table block');
				this.close();
			});
		}

		if (this.fileInput) {
			this.fileInput.addEventListener('change', async (e: Event) => {
				const target = e.target as HTMLInputElement;
				const file = target.files?.[0];
				if (!file) return;

				const activeNoteId = store.getActiveNoteId();
				if (!activeNoteId) {
					alert('Нет активной заметки');
					this.close();
					return;
				}

				if (file.size > 10 * 1024 * 1024) {
					alert('Файл слишком большой. Максимальный размер 10MB');
					this.close();
					return;
				}
				if (!file.type.startsWith('image/')) {
					alert('Пожалуйста, выберите изображение');
					this.close();
					return;
				}

				try {
					const blockPromise = attachmentService.createImageBlock(
						activeNoteId,
						file,
						this.afterBlockId,
					);
					await this._createAndInsertBlock(blockPromise);
				} catch (error) {
					console.error('[AttachPopup] Error:', error);
					alert('Ошибка при загрузке изображения');
				}

				if (this.fileInput) this.fileInput.value = '';
				this.close();
			});
		}
	}

	getElement(): HTMLElement | null {
		return this.element;
	}
}
