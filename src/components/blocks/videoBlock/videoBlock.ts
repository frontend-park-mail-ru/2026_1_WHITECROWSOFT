import { attachmentService } from '../../../services/attachmentService.js';
import { store } from '../../../store.js';
import type { Block } from '../../../types.js';
import Component from '../../component.js';
import templateString from './videoBlock.hbs?raw';
import './videoBlock.scss';

interface VideoBlockOptions {
	block: Block;
	onDelete?: (blockId: string) => void;
}

export default class VideoBlock extends Component {
	protected templateString = templateString;

	private block: Block;
	private onDelete?: (blockId: string) => void;
	private videoElement: HTMLVideoElement | null = null;

	constructor(options: VideoBlockOptions) {
		super();
		this.block = options.block;
		this.onDelete = options.onDelete;
	}

	protected getTemplateData() {
		return {
			blockId: this.block.id,
		};
	}

	async onRender(): Promise<void> {
		await this.loadVideo();
		this.bindEvents();
	}

	private async loadVideo(): Promise<void> {
		const videoEl = this.domElement?.querySelector(
			'.note__videoBlock-video',
		) as HTMLVideoElement;
		if (!videoEl) return;

		try {
			if (
				this.block.content &&
				this.block.content.trim() !== '' &&
				this.block.content !== '{}'
			) {
				const attachmentId = this.block.content;
				const noteId = this.block.note_id || store.getActiveNoteId();

				if (noteId && attachmentId) {
					const videoUrl = await attachmentService.getVideoUrl(
						attachmentId,
						noteId,
						this.block.id,
					);
					if (videoUrl) {
						videoEl.src = videoUrl;
						videoEl.load();
						return;
					}
				}
			}
			throw new Error('No video data');
		} catch (e) {
			console.warn('Failed to load video', e);
			if (videoEl) {
				videoEl.style.display = 'none';
				const errorMsg = document.createElement('div');
				errorMsg.className = 'note__videoBlock-error';
				errorMsg.textContent = '❌ Ошибка загрузки видео';
				this.domElement?.appendChild(errorMsg);
			}
		}
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

	updateBlock(newBlock: Block): void {
		const contentChanged = this.block.content !== newBlock.content;
		this.block = newBlock;
		if (!this.domElement || !contentChanged) {
			return;
		}

		if (this.videoElement) {
			this.videoElement.pause();
			this.videoElement.src = '';
		}

		void this.loadVideo();
	}

	updateBlockId(newBlockId: string | number): void {
		this.block.id = newBlockId;
		this.domElement?.setAttribute('data-block-id', String(newBlockId));
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

	destroy(): void {
		if (this.videoElement) {
			this.videoElement.pause();
			this.videoElement.src = '';
		}
		this.videoElement = null;
	}
}
