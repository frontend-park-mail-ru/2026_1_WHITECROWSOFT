import { store } from '../../../store.js';
import type { Block } from '../../../types.js';
import Component from '../../component.js';
import templateString from './subnoteBlock.hbs?raw';

interface SubnoteBlockOptions {
	block: Block;
	onOpen?: (subnoteId: string | number) => void;
	onDelete?: (blockId: string) => void;
	onFocus?: (blockId: string) => void;
}

export default class SubnoteBlock extends Component {
	protected templateString = templateString;

	private block: Block;
	private onOpen?: (subnoteId: string | number) => void;
	private onDelete?: (blockId: string) => void;
	private onFocus?: (blockId: string) => void;
	private subnoteId: string | number | null = null;
	private unsubscribeNotes: (() => void) | null = null;

	constructor(options: SubnoteBlockOptions) {
		super();
		this.block = options.block;
		this.onOpen = options.onOpen;
		this.onDelete = options.onDelete;
		this.onFocus = options.onFocus;
		this.parseSubnoteId();
	}

	private parseSubnoteId(): void {
		if (this.block.content && this.block.content !== '{}') {
			try {
				const parsed = JSON.parse(this.block.content);
				this.subnoteId = parsed.subnoteId || parsed.id;
			} catch {
				this.subnoteId = this.block.content;
			}
		}
	}

	private getTitle(): string {
		if (!this.subnoteId) return 'Подзаметка';
		const note = store
			.getNotes()
			.find((n) => String(n.ID) === String(this.subnoteId));
		return note?.title || 'Подзаметка';
	}

	protected getTemplateData() {
		return {
			blockId: this.block.id,
			subnoteId: this.subnoteId,
			title: this.getTitle(),
		};
	}

	onRender(): void {
		this.bindEvents();
		this.subscribeToNotes();
	}

	private subscribeToNotes(): void {
		this.unsubscribeNotes = store.subscribe('notes', () => {
			this.updateTitle();
		});
	}

	private updateTitle(): void {
		const newTitle = this.getTitle();
		const titleEl = this.domElement?.querySelector('.subnote-block__title');
		if (titleEl && titleEl.textContent !== newTitle) {
			titleEl.textContent = newTitle;
		}
	}

	private bindEvents(): void {
		const blockEl = this.domElement;
		if (!blockEl) return;

		blockEl.addEventListener('click', (e) => {
			e.stopPropagation();
			store.setPendingFocus(this.block.id, null);
			this.onFocus?.(String(this.block.id));
		});

		blockEl.addEventListener('dblclick', (e) => {
			e.stopPropagation();
			if (this.subnoteId) {
				this.onOpen?.(this.subnoteId);
			}
		});

		blockEl.addEventListener('keydown', (e) => {
			const isBackspace = e.key === 'Backspace';
			const isDelete = e.key === 'Delete';

			if (isBackspace || isDelete) {
				e.preventDefault();
				e.stopPropagation();
				this.onDelete?.(String(this.block.id));
			}
		});

		blockEl.addEventListener('focus', () => {
			blockEl.classList.add('subnote-block--focused');
		});

		blockEl.addEventListener('blur', () => {
			blockEl.classList.remove('subnote-block--focused');
		});
	}

	focus(): void {
		const blockEl = this.domElement;
		blockEl?.focus();
	}

	getContent(): string {
		return this.block.content || '';
	}

	updateBlock(newBlock: Block): void {
		this.block = newBlock;
		this.parseSubnoteId();
		this.updateTitle();
		if (this.subnoteId && this.domElement) {
			this.domElement.dataset.noteId = String(this.subnoteId);
		}
	}

	updateBlockId(newBlockId: string | number): void {
		this.block.id = newBlockId;
		this.domElement?.setAttribute('data-block-id', String(newBlockId));
	}

	setCursorAtStart(): void {}
	setCursorAtOffset(): void {}

	destroy(): void {
		this.unsubscribeNotes?.();
	}
}
