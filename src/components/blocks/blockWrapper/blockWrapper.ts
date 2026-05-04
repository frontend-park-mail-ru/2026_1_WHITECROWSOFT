import { router } from '../../../route/router.js';
import { store } from '../../../store.js';
import type { Block } from '../../../types.js';
import Component from '../../component.js';
import ImageBlock from '../imageBlock/imageBlock.js';
import MusicBlock from '../musicBlock/musicBlock.js';
import SubnoteBlock from '../subnoteBlock/subnoteBlock.js';
import TextBlock from '../textBlock/textBlock.js';
import templateString from './blockWrapper.hbs?raw';

interface BlockWrapperOptions {
	block: Block;
	onContentChange?: (blockId: string, content: string) => void;
	onDelete?: (blockId: string) => void;
	onSplit?: (
		blockId: string,
		beforeContent: string,
		afterContent: string,
	) => void;
	onJoin?: (blockId: string, prevBlockId: string, joinOffset: number) => void;
	onAddBlock?: (afterBlockId: string) => void;
	onDragStart?: (blockId: string, event: DragEvent) => void;
	onFocusBlock?: (blockId: string) => void;
}

export default class BlockWrapper extends Component {
	protected templateString = templateString;

	private block: Block;
	private blockComponent:
		| TextBlock
		| ImageBlock
		| MusicBlock
		| SubnoteBlock
		| null = null;
	private onContentChange?: (blockId: string, content: string) => void;
	private onDelete?: (blockId: string) => void;
	private onSplit?: (
		blockId: string,
		beforeContent: string,
		afterContent: string,
	) => void;
	private onJoin?: (
		blockId: string,
		prevBlockId: string,
		joinOffset: number,
	) => void;
	private onAddBlock?: (afterBlockId: string) => void;
	private onDragStart?: (blockId: string, event: DragEvent) => void;
	private onFocusBlock?: (blockId: string) => void;

	constructor(options: BlockWrapperOptions) {
		super();
		this.block = options.block;
		this.onContentChange = options.onContentChange;
		this.onDelete = options.onDelete;
		this.onSplit = options.onSplit;
		this.onJoin = options.onJoin;
		this.onAddBlock = options.onAddBlock;
		this.onDragStart = options.onDragStart;
		this.onFocusBlock = options.onFocusBlock;
	}

	protected getTemplateData() {
		return {
			blockId: this.block.id,
			isImageBlock: this.block.block_type_id === 2,
			isAudioBlock: this.block.block_type_id === 6,
		};
	}

	async onRender(): Promise<void> {
		await this.renderBlockContent();
		this.bindEvents();
	}

	private async renderBlockContent(): Promise<void> {
		const container = this.domElement?.querySelector('.note__block-container');
		if (!container) return;
		if (this.block.block_type_id === 2) {
			this.blockComponent = new ImageBlock({
				block: this.block,
				onDelete: this.onDelete,
			});
		} else if (this.block.block_type_id === 6) {
			this.blockComponent = new MusicBlock({
				block: this.block,
				onDelete: this.onDelete,
			});
		} else if (this.block.block_type_id === 5) {
			this.blockComponent = new SubnoteBlock({
				block: this.block,
				onDelete: this.onDelete,
				onOpen: (subnoteId: string | number) => {
					const note = store.getNotes().find((n) => n.ID === subnoteId);
					if (note) {
						store.addToRecentNotes(subnoteId, note.title);
					}
					store.setActiveNoteId(subnoteId);
					router.push('/');
				},
				onFocus: () => this.onFocusBlock?.(String(this.block.id)),
			});
		} else {
			this.blockComponent = new TextBlock({
				block: this.block,
				onContentChange: this.onContentChange,
				onDelete: this.onDelete,
				onSplit: this.onSplit,
				onJoin: this.onJoin,
			});
		}
		this.blockComponent.renderTo(container as HTMLElement);
	}

	updateBlock(newBlock: Block): void {
		const blockTypeChanged =
			this.block.block_type_id !== newBlock.block_type_id;
		const contentChanged = this.block.content !== newBlock.content;
		const formattingChanged =
			JSON.stringify(this.block.formatting) !==
			JSON.stringify(newBlock.formatting);
		this.block = newBlock;

		if (blockTypeChanged || !this.blockComponent) {
			const container = this.domElement?.querySelector(
				'.note__block-container',
			);
			if (!container) return;
			container.innerHTML = '';
			if (this.blockComponent && 'destroy' in this.blockComponent) {
				(this.blockComponent as { destroy: () => void }).destroy();
			}
			this.blockComponent = null;
			this.renderBlockContent();
			return;
		}

		if (!contentChanged && !formattingChanged) {
			return;
		}

		if (
			this.blockComponent &&
			typeof (
				this.blockComponent as { updateBlock?: (newBlock: Block) => void }
			).updateBlock === 'function'
		) {
			(
				this.blockComponent as { updateBlock: (newBlock: Block) => void }
			).updateBlock(newBlock);
			return;
		}

		const container = this.domElement?.querySelector('.note__block-container');
		if (!container) return;
		container.innerHTML = '';
		this.renderBlockContent();
	}

	private bindEvents(): void {
		const addBtn = this.domElement?.querySelector('[data-action="add"]');
		const dragBtn = this.domElement?.querySelector('[data-action="drag"]');
		addBtn?.addEventListener('click', (e) => {
			e.stopPropagation();
			this.onAddBlock?.(String(this.block.id));
		});
		if (dragBtn) {
			dragBtn.addEventListener('dragstart', this.handleDragStart.bind(this));
		}
	}

	private handleDragStart(e: Event): void {
		const dragEvent = e as DragEvent;
		this.onDragStart?.(String(this.block.id), dragEvent);
	}

	focus(): void {
		this.blockComponent?.focus();
	}

	getBlockComponent():
		| TextBlock
		| ImageBlock
		| MusicBlock
		| SubnoteBlock
		| null {
		return this.blockComponent;
	}

	getElement(): HTMLElement | null {
		return this.domElement;
	}

	destroy(): void {
		if (this.blockComponent && 'destroy' in this.blockComponent) {
			(this.blockComponent as { destroy: () => void }).destroy();
		}
		this.blockComponent = null;
		if (this.domElement) {
			this.domElement.remove();
			this.domElement = null;
		}
	}
}
