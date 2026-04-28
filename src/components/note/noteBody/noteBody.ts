import { attachmentService } from '../../../services/attachmentService.js';
import { noteService } from '../../../services/noteService.js';
import { store } from '../../../store.js';
import type { Block } from '../../../types.js';
import BlockWrapper from '../../blocks/blockWrapper/blockWrapper.js';
import Component from '../../component.js';
import FormatPopup from '../../popups/formatPopup/formatPopup.js';
import templateString from './noteBody.hbs?raw';

export default class NoteBody extends Component {
	protected templateString = templateString;

	private blocks: Block[] = [];
	private blockWrappers: Map<string, BlockWrapper> = new Map();
	private formattingPopup: FormatPopup | null = null;
	private isDraggingSelection = false;
	private selectionTimeout: number | null = null;
	private draggedBlockWrapper: HTMLElement | null = null;
	private draggedBlockId: string | null = null;
	private onBlocksChange?: (blocks: Block[]) => void;

	constructor(onBlocksChange?: (blocks: Block[]) => void) {
		super();
		this.onBlocksChange = onBlocksChange;
		this.blocks = store.getActiveBlocks();
	}

	protected getTemplateData() {
		return {
			hasBlocks: this.blocks.length > 0,
		};
	}

	getElement(): HTMLElement | null {
		return this.domElement;
	}

	async onRender(): Promise<void> {
		await this.renderBlocks();
		this.bindEvents();
	}

	private async renderBlocks(): Promise<void> {
		const container = this.domElement?.querySelector('.note__body-container');
		if (!container) return;
		container.innerHTML = '';
		this.blockWrappers.clear();
		for (const block of this.blocks) {
			await this.appendBlock(block, container as HTMLElement);
		}
		if (this.blocks.length === 0) {
			await this.createFirstBlock();
		}
	}

	private async appendBlock(
		block: Block,
		container: HTMLElement,
	): Promise<void> {
		const wrapper = new BlockWrapper({
			block: block,
			onContentChange: this.handleContentChange.bind(this),
			onDelete: this.handleDeleteBlock.bind(this),
			onSplit: this.handleSplitBlock.bind(this),
			onJoin: this.handleJoinBlocks.bind(this),
			onAddBlock: this.handleAddBlock.bind(this),
			onDragStart: this.handleDragStart.bind(this),
		});
		wrapper.renderTo(container);
		this.blockWrappers.set(String(block.id), wrapper);
	}

	private async createFirstBlock(): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId) return;
		try {
			const newBlock = await noteService.createBlock(activeNoteId, {
				note_id: activeNoteId,
				block_type_id: 1,
				position: 0,
				content: '',
			});
			if (newBlock) {
				this.blocks = [newBlock];
				this.onBlocksChange?.(this.blocks);
				await this.renderBlocks();
				this.focusFirstBlock();
			}
		} catch (error) {
			console.error('Failed to create first block:', error);
		}
	}

	private focusFirstBlock(): void {
		const firstWrapper = this.blockWrappers.values().next().value;
		firstWrapper?.focus();
	}

	private async handleContentChange(
		blockId: string,
		content: string,
	): Promise<void> {
		const blockExists = this.blocks.some((b) => String(b.id) === blockId);
		if (!blockExists) {
			return;
		}
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId) return;
		try {
			await noteService.updateBlockContent(activeNoteId, blockId, content);
			const updatedBlocks = this.blocks.map((b) =>
				String(b.id) === blockId ? { ...b, content } : b,
			);
			this.blocks = updatedBlocks;
			this.onBlocksChange?.(this.blocks);
		} catch (error) {
			console.error('Failed to save block content:', error);
		}
	}

	private async handleDeleteBlock(blockId: string): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId) return;
		const currentIndex = this.blocks.findIndex((b) => String(b.id) === blockId);
		const prevBlockId =
			currentIndex > 0 ? String(this.blocks[currentIndex - 1].id) : null;
		const nextBlockId =
			currentIndex < this.blocks.length - 1
				? String(this.blocks[currentIndex + 1].id)
				: null;
		const block = this.blocks.find((b) => String(b.id) === blockId);
		if (block && block.block_type_id === 2 && block.content) {
			try {
				await attachmentService.deleteAttachment(activeNoteId, blockId);
			} catch (error) {
				console.error('Failed to delete attachment:', error);
			}
		}
		if (this.blocks.length > 1) {
			await noteService.deleteBlock(activeNoteId, blockId);
			this.blocks = this.blocks.filter((b) => String(b.id) !== blockId);
			this.onBlocksChange?.(this.blocks);
			await this.renderBlocks();
			const blockToFocus = prevBlockId || nextBlockId;
			if (blockToFocus) {
				const wrapperToFocus = this.blockWrappers.get(blockToFocus);
				if (wrapperToFocus) {
					wrapperToFocus.focus();
					const blockComponent = wrapperToFocus.getBlockComponent();
					if (blockComponent && 'setCursorAtOffset' in blockComponent) {
						const content = blockComponent.getContent?.() || '';
						blockComponent.setCursorAtOffset?.(content.length);
					}
				}
			}
		}
	}

	private async handleSplitBlock(
		blockId: string,
		beforeContent: string,
		afterContent: string,
	): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId) return;
		const createdBlock = await noteService.createBlockAfter(
			activeNoteId,
			{ note_id: activeNoteId, block_type_id: 1, content: '' },
			blockId,
		);
		const newBlock = await noteService.updateBlockContent(
			activeNoteId,
			createdBlock.id,
			afterContent,
		);
		const newBlocks = [...this.blocks];
		const index = newBlocks.findIndex((b) => String(b.id) === blockId);
		if (index !== -1) {
			newBlocks.splice(index + 1, 0, newBlock);
			this.blocks = newBlocks;
			this.onBlocksChange?.(this.blocks);
			await this.renderBlocks();
			const newWrapper = this.blockWrappers.get(String(newBlock.id));
			newWrapper?.focus();
			newWrapper?.getBlockComponent()?.setCursorAtStart?.();
		}
	}

	private async handleJoinBlocks(
		blockId: string,
		prevBlockId: string,
		joinOffset: number,
	): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId) return;
		const prevWrapper = this.blockWrappers.get(prevBlockId);
		const currentWrapper = this.blockWrappers.get(blockId);
		if (prevWrapper && currentWrapper) {
			const prevContent = prevWrapper.getBlockComponent()?.getContent?.() || '';
			const currentContent =
				currentWrapper.getBlockComponent()?.getContent?.() || '';
			const newContent = prevContent + currentContent;
			await noteService.updateBlockContent(
				activeNoteId,
				prevBlockId,
				newContent,
			);
			await noteService.deleteBlock(activeNoteId, blockId);
			this.blocks = this.blocks.filter((b) => String(b.id) !== blockId);
			const updatedPrevBlock = this.blocks.find(
				(b) => String(b.id) === prevBlockId,
			);
			if (updatedPrevBlock) {
				updatedPrevBlock.content = newContent;
			}
			this.onBlocksChange?.(this.blocks);
			const prevBlockEl = prevWrapper
				.getElement()
				?.querySelector('.note__block') as HTMLElement;
			if (prevBlockEl) {
				prevBlockEl.innerHTML = newContent;
			}
			const currentBlockEl = currentWrapper.getElement();
			if (currentBlockEl) {
				currentBlockEl.remove();
			}
			this.blockWrappers.delete(blockId);
			const freshPrevWrapper = this.blockWrappers.get(prevBlockId);
			if (freshPrevWrapper) {
				freshPrevWrapper.focus();
				setTimeout(() => {
					freshPrevWrapper.getBlockComponent()?.setCursorAtOffset?.(joinOffset);
				}, 0);
			}
		}
	}

	private handleAddBlock(afterBlockId: string): void {
		const event = new CustomEvent('addBlock', { detail: { afterBlockId } });
		this.domElement?.dispatchEvent(event);
	}

	private handleDragStart(blockId: string, event: DragEvent): void {
		const wrapper = this.domElement?.querySelector(
			`.note__block-wrapper[data-block-id="${blockId}"]`,
		);
		if (wrapper && event.dataTransfer) {
			this.draggedBlockWrapper = wrapper as HTMLElement;
			this.draggedBlockId = blockId;
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', blockId);
			wrapper.classList.add('note__block-wrapper--dragging');
		}
	}

	private handleDragOver = (e: Event): void => {
		const dragEvent = e as DragEvent;
		dragEvent.preventDefault();
		if (!this.draggedBlockWrapper || !dragEvent.dataTransfer) return;
		const container = this.domElement?.querySelector('.note__body-container');
		if (!container) return;
		const afterElement = this.getDragAfterElement(
			container as HTMLElement,
			dragEvent.clientY,
		);
		const draggedElement = this.draggedBlockWrapper;
		if (afterElement) {
			container.insertBefore(draggedElement, afterElement);
		} else {
			container.appendChild(draggedElement);
		}
	};

	private getDragAfterElement(
		container: HTMLElement,
		y: number,
	): HTMLElement | undefined {
		const wrappers = [
			...container.querySelectorAll(
				'.note__block-wrapper:not(.note__block-wrapper--dragging)',
			),
		] as HTMLElement[];
		return (
			wrappers.reduce<{ offset: number; element: HTMLElement | null }>(
				(closest, child) => {
					const rect = child.getBoundingClientRect();
					if (rect.height === 0 || rect.width === 0 || !child.offsetParent)
						return closest;
					const offset = y - rect.top - rect.height / 2;
					return offset < 0 && offset > closest.offset
						? { offset, element: child }
						: closest;
				},
				{ offset: Number.NEGATIVE_INFINITY, element: null },
			).element || undefined
		);
	}

	private handleDrop = async (e: Event): Promise<void> => {
		const dragEvent = e as DragEvent;
		dragEvent.preventDefault();
		dragEvent.stopPropagation();
		if (!this.draggedBlockId) return;
		const container = this.domElement?.querySelector('.note__body-container');
		if (!container) return;
		const blocks = Array.from(
			container.querySelectorAll('.note__block-wrapper'),
		) as HTMLElement[];
		const newIndex = blocks.indexOf(this.draggedBlockWrapper!);
		const activeNoteId = store.getActiveNoteId();
		if (activeNoteId && newIndex !== -1) {
			try {
				await noteService.moveBlock(
					activeNoteId,
					this.draggedBlockId,
					newIndex,
				);
				const updatedBlocks = this.blocks.map((b, idx) => ({
					...b,
					position: idx,
				}));
				this.blocks = updatedBlocks;
				this.onBlocksChange?.(this.blocks);
			} catch (error) {
				console.error('Error moving block:', error);
			}
		}
		this.handleDragEnd();
	};

	private handleDragEnd = (): void => {
		if (this.draggedBlockWrapper) {
			this.draggedBlockWrapper.classList.remove(
				'note__block-wrapper--dragging',
			);
		}
		this.draggedBlockWrapper = null;
		this.draggedBlockId = null;
	};

	private bindEvents(): void {
		const container = this.domElement?.querySelector('.note__body-container');
		if (!container) return;
		container.addEventListener(
			'contextmenu',
			this.handleContextMenu as EventListener,
		);
		container.addEventListener('mouseup', this.handleMouseUp as EventListener);
		container.addEventListener(
			'mousedown',
			this.handleMouseDown as EventListener,
		);
		container.addEventListener('scroll', this.handleScroll as EventListener);
		container.addEventListener(
			'dragover',
			this.handleDragOver as EventListener,
		);
		container.addEventListener('drop', this.handleDrop as EventListener);
		container.addEventListener('dragend', this.handleDragEnd as EventListener);
	}

	private handleContextMenu = (e: Event): void => {
		e.preventDefault();
	};

	private handleMouseUp = (): void => {
		if (!this.isDraggingSelection) return;
		this.isDraggingSelection = false;
		if (this.selectionTimeout) clearTimeout(this.selectionTimeout);
		this.selectionTimeout = window.setTimeout(() => {
			const selection = window.getSelection();
			if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
				const range = selection.getRangeAt(0);
				const noteBodyContainer = this.domElement?.querySelector(
					'.note__body-container',
				);
				if (noteBodyContainer?.contains(range.commonAncestorContainer)) {
					if (this.formattingPopup) {
						this.formattingPopup.close();
						this.formattingPopup = null;
					}
					this.formattingPopup = new FormatPopup({
						range: range.cloneRange(),
						editorElement: noteBodyContainer as HTMLElement,
					});
					this.formattingPopup.open();
				}
			}
		}, 10);
	};

	private handleMouseDown = (e: Event): void => {
		const mouseEvent = e as MouseEvent;
		const target = mouseEvent.target as HTMLElement;
		if (target.closest('.formattingPopup')) return;
		if (this.formattingPopup) {
			this.formattingPopup.close();
			this.formattingPopup = null;
		}
		this.isDraggingSelection = true;
	};

	private handleScroll = (): void => {
		if (this.formattingPopup) {
			this.formattingPopup.close();
			this.formattingPopup = null;
		}
	};

	async updateBlocks(blocks: Block[]): Promise<void> {
		this.blocks = blocks;
		await this.renderBlocks();
	}

	async saveAllBlocks(): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId) return;
		const savePromises: Promise<Block | void>[] = [];
		for (const block of this.blocks) {
			if (block.block_type_id !== 2) {
				const wrapper = this.blockWrappers.get(String(block.id));
				const currentContent = wrapper?.getBlockComponent()?.getContent?.();
				if (currentContent !== undefined && block.content !== currentContent) {
					savePromises.push(
						noteService
							.updateBlockContent(
								activeNoteId,
								String(block.id),
								currentContent,
							)
							.catch((error) => {
								console.error('Failed to save block:', error);
								return undefined;
							}),
					);
				}
			}
		}
		if (savePromises.length > 0) {
			await Promise.all(savePromises);
		}
	}

	closeFormattingPopup(): void {
		if (this.formattingPopup) {
			this.formattingPopup.close();
			this.formattingPopup = null;
		}
	}

	cleanup(): void {
		this.closeFormattingPopup();
		if (this.selectionTimeout) {
			clearTimeout(this.selectionTimeout);
			this.selectionTimeout = null;
		}
		this.blockWrappers.clear();
		this.blocks = [];
		this.draggedBlockWrapper = null;
		this.draggedBlockId = null;
		this.isDraggingSelection = false;
	}
}
