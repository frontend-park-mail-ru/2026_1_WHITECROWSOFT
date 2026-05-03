import { attachmentService } from '../../../services/attachmentService.js';
import { store } from '../../../store.js';
import type { Block } from '../../../types.js';
import Component from '../../component.js';
import templateString from './imageBlock.hbs?raw';

interface ImageBlockOptions {
	block: Block;
	onDelete?: (blockId: string) => void;
}

export default class ImageBlock extends Component {
	protected templateString = templateString;

	private block: Block;
	private onDelete?: (blockId: string) => void;

	constructor(options: ImageBlockOptions) {
		super();
		this.block = options.block;
		this.onDelete = options.onDelete;
	}

	protected getTemplateData() {
		return {
			blockId: this.block.id,
			isLoading: true,
		};
	}

	async onRender(): Promise<void> {
		await this.loadImage();
		this.bindEvents();
	}

	private async loadImage(): Promise<void> {
		const imgEl = this.domElement?.querySelector(
			'.note__imageBlock-img',
		) as HTMLImageElement | null;
		if (!imgEl) return;
		try {
			if (
				this.block.content &&
				this.block.content.trim() !== '' &&
				this.block.content !== '{}'
			) {
				const imageData = JSON.parse(this.block.content) as {
					attachmentId: string | number;
				};
				const attachmentId = imageData.attachmentId;
				const noteId = this.block.note_id || store.getActiveNoteId();
				if (noteId && attachmentId) {
					const imageUrl = await attachmentService.getImageUrl(
						attachmentId,
						noteId,
						this.block.id,
					);
					if (imageUrl) {
						imgEl.src = imageUrl;
						imgEl.classList.remove('loading');
						return;
					}
				}
			}
			throw new Error('No image data');
		} catch (e) {
			console.warn('Failed to load image', e);
			imgEl.classList.add('hidden');
			const placeholder = document.createElement('div');
			placeholder.className = 'note__imageBlock-placeholder';
			placeholder.textContent = '❌ Ошибка загрузки изображения';
			this.domElement?.appendChild(placeholder);
		}
	}

	updateBlock(newBlock: Block): void {
		const contentChanged = this.block.content !== newBlock.content;
		this.block = newBlock;
		if (!this.domElement || !contentChanged) {
			return;
		}

		const imgEl = this.domElement.querySelector(
			'.note__imageBlock-img',
		) as HTMLImageElement | null;
		if (!imgEl) return;

		const placeholder = this.domElement.querySelector(
			'.note__imageBlock-placeholder',
		);
		if (placeholder) {
			placeholder.remove();
		}

		imgEl.src = '';
		imgEl.classList.remove('hidden');
		imgEl.classList.add('loading');
		void this.loadImage();
	}

	private bindEvents(): void {
		const blockEl = this.domElement;
		if (!blockEl) return;
		blockEl.addEventListener('focus', () => {
			this.domElement?.classList.add('note__block-wrapper--focused');
		});
		blockEl.addEventListener('blur', () => {
			this.domElement?.classList.remove('note__block-wrapper--focused');
		});
		blockEl.addEventListener('click', (e) => {
			e.stopPropagation();
			(blockEl as HTMLElement).focus();
		});
		blockEl.addEventListener('keydown', async (e) => {
			const isBackspace = e.key === 'Backspace';
			const isDelete = e.key === 'Delete';
			if (isBackspace || isDelete) {
				e.preventDefault();
				e.stopPropagation();
				this.onDelete?.(String(this.block.id));
			}
		});
	}

	focus(): void {
		const blockEl = this.domElement;
		if (blockEl) {
			blockEl.focus();
			if (!blockEl.hasAttribute('tabindex')) {
				blockEl.setAttribute('tabindex', '0');
			}
		}
	}

	getContent(): string {
		return this.block.content || '';
	}

	setCursorAtStart(): void {}

	setCursorAtOffset(): void {}

	destroy(): void {}
}
