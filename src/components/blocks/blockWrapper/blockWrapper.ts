import type { Block } from '../../../types.js';
import Component from '../../component.js';
import ImageBlock from '../imageBlock/imageBlock.js';
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
}

export default class BlockWrapper extends Component {
	protected templateString = templateString;

	private block: Block;
	private blockComponent: TextBlock | ImageBlock | null = null;
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

	constructor(options: BlockWrapperOptions) {
		super();
		this.block = options.block;
		this.onContentChange = options.onContentChange;
		this.onDelete = options.onDelete;
		this.onSplit = options.onSplit;
		this.onJoin = options.onJoin;
		this.onAddBlock = options.onAddBlock;
		this.onDragStart = options.onDragStart;
	}

	protected getTemplateData() {
		return {
			blockId: this.block.id,
			isImageBlock: this.block.block_type_id === 2,
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

	getBlockComponent(): TextBlock | ImageBlock | null {
		return this.blockComponent;
	}

	getElement(): HTMLElement | null {
		return this.domElement;
	}
}
