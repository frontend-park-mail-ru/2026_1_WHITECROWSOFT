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

	private blockWrappers: Map<string, BlockWrapper> = new Map();
	private formattingPopup: FormatPopup | null = null;
	private isDraggingSelection = false;
	private selectionTimeout: number | null = null;
	private draggedBlockWrapper: HTMLElement | null = null;
	private draggedBlockId: string | null = null;
	private isRendering = false;
	private needsRender = false;
	private unsubscribeActiveBlocks: (() => void) | null = null;
	private unsubscribePendingFocus: (() => void) | null = null;
	private unsubscribeCollaborativeCreate: (() => void) | null = null;
	private unsubscribeCollaborativeDelete: (() => void) | null = null;

	constructor() {
		super();
	}

	protected getTemplateData() {
		const blocks = store.getActiveBlocks();
		return {
			hasBlocks: blocks.length > 0,
		};
	}

	getElement(): HTMLElement | null {
		return this.domElement;
	}

	async onRender(): Promise<void> {
		this.subscribeToStore();
		this.subscribeToPendingFocus();
		this.subscribeToCollaborativeCreate();
		this.subscribeToCollaborativeDelete();
		await this.renderBlocks();
		this.bindEvents();
	}

	private subscribeToStore(): void {
		this.unsubscribeActiveBlocks = store.subscribe('activeBlocks', () => {
			this.renderBlocks();
		});
	}

	private subscribeToPendingFocus(): void {
		this.unsubscribePendingFocus = store.subscribe(
			'pendingFocus',
			(focusData) => {
				if (focusData && focusData.blockId && !this.isRendering) {
					this.applyPendingFocus(focusData.blockId, focusData.offset);
				}
			},
		);
	}

	private subscribeToCollaborativeCreate(): void {
		const handleBlockCreate = ((e: CustomEvent) => {
			const { userId, focusBlockId } = e.detail;
			const currentUserId = store.getUser()?.id;
			if (userId === currentUserId) {
				store.setPendingFocus(focusBlockId, 'start');
				return;
			}
			this.renderBlocks();
			store.setPendingFocus(focusBlockId, 'start');
		}) as EventListener;
		window.addEventListener('collaborativeBlockCreate', handleBlockCreate);
		this.unsubscribeCollaborativeCreate = () => {
			window.removeEventListener('collaborativeBlockCreate', handleBlockCreate);
		};
	}

	private subscribeToCollaborativeDelete(): void {
		const handleBlockDelete = ((e: CustomEvent) => {
			const { blockId, userId, focusBlockId } = e.detail;
			const currentUserId = store.getUser()?.id;
			console.log('[NoteBody] Received collaborativeBlockDelete:', {
				blockId,
				userId,
				currentUserId,
				isOwnEvent: userId === currentUserId,
			});
			if (userId === currentUserId) {
				console.log('[NoteBody] Skipping own block deletion');
				return;
			}
			const blocks = store.getActiveBlocks();
			const updatedBlocks = blocks.filter((b) => String(b.id) !== blockId);
			updatedBlocks.forEach((block, idx) => {
				block.position = idx;
			});
			console.log(
				'[NoteBody] Updating blocks after deletion, removed blockId:',
				blockId,
			);
			store.setActiveBlocks(updatedBlocks);
			store.setPendingFocus(focusBlockId, 'end');
		}) as EventListener;
		window.addEventListener('collaborativeBlockDelete', handleBlockDelete);
		this.unsubscribeCollaborativeDelete = () => {
			window.removeEventListener('collaborativeBlockDelete', handleBlockDelete);
		};
	}

	private applyPendingFocus(
		blockId: string | number,
		offset: number | 'start' | 'end' | null,
	): void {
		const wrapper = this.blockWrappers.get(String(blockId));
		if (wrapper) {
			wrapper.focus();
			const blockComponent = wrapper.getBlockComponent();
			if (blockComponent) {
				if (offset === 'start') {
					if ('setCursorAtStart' in blockComponent) {
						blockComponent.setCursorAtStart();
					}
				} else if (offset === 'end') {
					const content = blockComponent.getContent?.() || '';
					if ('setCursorAtOffset' in blockComponent) {
						blockComponent.setCursorAtOffset?.(content.length);
					}
				} else if (typeof offset === 'number') {
					if ('setCursorAtOffset' in blockComponent) {
						blockComponent.setCursorAtOffset?.(offset);
					}
				}
			}
			store.clearPendingFocus();
		}
	}

	private async renderBlocks(): Promise<void> {
		if (this.isRendering) {
			this.needsRender = true;
			return;
		}
		this.isRendering = true;
		try {
			const container = this.domElement?.querySelector(
				'.note__body-container',
			) as HTMLElement | null;
			if (!container) return;

			const blocks = store.getActiveBlocks();
			if (blocks.length === 0) {
				if (this.blockWrappers.size === 0) {
					await this.createFirstBlock();
					return;
				}
				this.clearBlocks(container);
				await this.createFirstBlock();
				return;
			}
			const nextIds = blocks.map((block) => String(block.id));
			for (const [id, wrapper] of this.blockWrappers.entries()) {
				if (!nextIds.includes(id)) {
					wrapper.destroy();
					this.blockWrappers.delete(id);
				}
			}
			for (let index = 0; index < blocks.length; index++) {
				const block = blocks[index];
				const blockId = String(block.id);
				const wrapper = this.blockWrappers.get(blockId);
				const targetNode = container.children[index] as HTMLElement | null;
				if (wrapper) {
					wrapper.updateBlock(block);
					const wrapperElement = wrapper.getElement();
					if (wrapperElement && wrapperElement !== targetNode) {
						container.insertBefore(wrapperElement, targetNode);
					}
				} else {
					await this.insertBlockAt(block, container, index);
				}
			}
			const pendingFocus = store.getPendingFocus();
			if (pendingFocus.blockId) {
				this.applyPendingFocus(pendingFocus.blockId, pendingFocus.offset);
			}
		} finally {
			this.isRendering = false;
			if (this.needsRender) {
				this.needsRender = false;
				await this.renderBlocks();
			}
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
			onFocusBlock: this.handleFocusBlock.bind(this),
		});
		wrapper.renderTo(container);
		this.blockWrappers.set(String(block.id), wrapper);
	}

	private async insertBlockAt(
		block: Block,
		container: HTMLElement,
		index: number,
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
		const wrapperElement = wrapper.getElement();
		if (wrapperElement) {
			const referenceNode = container.children[index] as HTMLElement | null;
			if (referenceNode && wrapperElement !== referenceNode) {
				container.insertBefore(wrapperElement, referenceNode);
			}
		}
		this.blockWrappers.set(String(block.id), wrapper);
	}

	private clearBlocks(container: HTMLElement): void {
		for (const wrapper of this.blockWrappers.values()) {
			if (wrapper.destroy) wrapper.destroy();
		}
		this.blockWrappers.clear();
		container.innerHTML = '';
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
			if (newBlock && newBlock.id) {
				store.setPendingFocus(newBlock.id, 'start');
			}
		} catch (error) {
			console.error('Failed to create first block:', error);
		}
	}

	private handleFocusBlock(blockId: string): void {
		for (const [id, wrapper] of this.blockWrappers) {
			const el = wrapper.getElement();
			if (el) {
				if (id === blockId) {
					el.classList.add('note__block-wrapper--focused');
				} else {
					el.classList.remove('note__block-wrapper--focused');
				}
			}
		}
	}

	private async handleContentChange(
		blockId: string,
		content: string,
	): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId) return;
		try {
			await noteService.updateBlockContent(activeNoteId, blockId, content);
		} catch (error) {
			console.error('Failed to save block content:', error);
		}
	}

	private async handleDeleteBlock(blockId: string): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId) return;
		const blocks = store.getActiveBlocks();
		const block = blocks.find((b) => String(b.id) === blockId);
		if (!block) return;

		if (block.block_type_id === 5 && block.content) {
			const subnoteId = block.content;
			const subnote = store.getNotes().find((n) => n.ID === subnoteId);
			const subnoteTitle = subnote?.title || 'эту подзаметку';
			const confirmed = confirm(
				`Вы действительно хотите удалить подзаметку "${subnoteTitle}"?\n\n` +
					`Внимание: Подзаметка и все её содержимое будут удалены без возможности восстановления.`,
			);
			if (!confirmed) return;
			try {
				await noteService.deleteBlock(activeNoteId, blockId);
				await noteService.deleteNoteRecursive(subnoteId);
				const currentNotes = store.getNotes();
				const updatedNotes = currentNotes.filter((n) => n.ID !== subnoteId);
				store.setNotes(updatedNotes);
				if (store.getActiveNoteId() === subnoteId) {
					if (updatedNotes.length > 0) {
						await noteService.getNote(updatedNotes[0].ID);
					} else {
						store.setActiveNote(null);
						store.setActiveBlocks([]);
						store.setActiveNoteId(null);
					}
				}
				const currentIndex = blocks.findIndex((b) => String(b.id) === blockId);
				const prevBlockId =
					currentIndex > 0 ? String(blocks[currentIndex - 1].id) : null;
				const nextBlockId =
					currentIndex < blocks.length - 1
						? String(blocks[currentIndex + 1].id)
						: null;
				const blockToFocus = prevBlockId || nextBlockId;
				if (blockToFocus) {
					store.setPendingFocus(blockToFocus, 'end');
				}
			} catch (error) {
				console.error('Failed to delete subnote:', error);
			}
			return;
		}

		if (block.block_type_id === 2 && block.content) {
			try {
				await attachmentService.deleteAttachment(activeNoteId, blockId);
			} catch (error) {
				console.error('Failed to delete attachment:', error);
			}
		}

		if (blocks.length > 1) {
			await noteService.deleteBlock(activeNoteId, blockId);
		}

		const wrapper = this.blockWrappers.get(blockId);
		if (wrapper) {
			wrapper.destroy();
			this.blockWrappers.delete(blockId);
		}

		const currentIndex = blocks.findIndex((b) => String(b.id) === blockId);
		const prevBlockId =
			currentIndex > 0 ? String(blocks[currentIndex - 1].id) : null;
		const nextBlockId =
			currentIndex < blocks.length - 1
				? String(blocks[currentIndex + 1].id)
				: null;
		const blockToFocus = prevBlockId || nextBlockId;
		if (blocks.length > 1 && blockToFocus) {
			store.setPendingFocus(blockToFocus, 'end');
		}
	}

	private async handleSplitBlock(
		blockId: string,
		beforeContent: string,
		afterContent: string,
	): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId) return;
		const newBlock = await noteService.createBlockAfter(
			activeNoteId,
			{ note_id: activeNoteId, block_type_id: 1, content: afterContent },
			blockId,
		);
		await noteService.updateBlockContent(
			activeNoteId,
			newBlock.id,
			afterContent,
		);
		store.setPendingFocus(newBlock.id, 'start');
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
			store.setPendingFocus(prevBlockId, joinOffset);
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

	async saveAllBlocks(): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId) return;
		const blocks = store.getActiveBlocks();
		const savePromises: Promise<Block | void>[] = [];
		for (const block of blocks) {
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
		for (const wrapper of this.blockWrappers.values()) {
			if (wrapper.destroy) wrapper.destroy();
		}
		this.blockWrappers.clear();
		this.draggedBlockWrapper = null;
		this.draggedBlockId = null;
		this.isDraggingSelection = false;
		this.unsubscribeActiveBlocks?.();
		this.unsubscribePendingFocus?.();
		this.unsubscribeCollaborativeCreate?.();
		this.unsubscribeCollaborativeDelete?.();
	}
}
