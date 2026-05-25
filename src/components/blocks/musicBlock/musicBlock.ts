import { attachmentService } from '../../../services/attachmentService.js';
import { store } from '../../../store.js';
import type { Block } from '../../../types.js';
import Component from '../../component.js';
import templateString from './musicBlock.hbs?raw';
import './musicBlock.scss';

interface MusicBlockOptions {
	block: Block;
	onDelete?: (blockId: string) => void;
}

export default class MusicBlock extends Component {
	protected templateString = templateString;

	private block: Block;
	private onDelete?: (blockId: string) => void;
	private audioElement: HTMLAudioElement | null = null;

	constructor(options: MusicBlockOptions) {
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
		await this.loadAudio();
		this.bindEvents();
	}

	private async loadAudio(): Promise<void> {
		const audioEl = this.domElement?.querySelector(
			'.note__musicBlock-audio',
		) as HTMLAudioElement;
		if (!audioEl) return;

		try {
			if (
				this.block.content &&
				this.block.content.trim() !== '' &&
				this.block.content !== '{}'
			) {
				const attachmentId = this.block.content;
				const noteId = this.block.note_id || store.getActiveNoteId();

				if (noteId && attachmentId) {
					const audioUrl = await attachmentService.getAudioUrl(
						attachmentId,
						noteId,
						this.block.id,
					);
					if (audioUrl) {
						audioEl.src = audioUrl;
						audioEl.load();
						return;
					}
				}
			}
			throw new Error('No audio data');
		} catch (e) {
			console.warn('Failed to load audio', e);
			if (audioEl) {
				audioEl.style.display = 'none';
				const errorMsg = document.createElement('div');
				errorMsg.className = 'note__musicBlock-error';
				errorMsg.textContent = '❌ Ошибка загрузки аудио';
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

		if (this.audioElement) {
			this.audioElement.pause();
			this.audioElement.src = '';
		}

		void this.loadAudio();
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
		if (this.audioElement) {
			this.audioElement.pause();
			this.audioElement.src = '';
		}
		this.audioElement = null;
	}
}
