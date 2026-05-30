import { attachmentService } from '../../../services/attachmentService.js';
import { noteService } from '../../../services/noteService.js';
import { store } from '../../../store.js';
import type { Block } from '../../../types.js';
import BlockWrapper from '../../blocks/blockWrapper/blockWrapper.js';
import Component from '../../component.js';
import { confirmDialog } from '../../popups/confirmDialog/confirmDialog.js';
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
	private phantomBlock: HTMLElement | null = null;
	private unsubscribeActiveBlocks: (() => void) | null = null;
	private unsubscribeSyncBlockId: (() => void) | null = null;
	private unsubscribePendingFocus: (() => void) | null = null;
	private unsubscribeCollaborativeCreate: (() => void) | null = null;
	private unsubscribeCollaborativeDelete: (() => void) | null = null;
	private beforeUnloadHandler: (() => void) | null = null;

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
		this.subscribeToSyncBlockId();
		await this.restoreFromSessionStorage();
		await this.renderBlocks();
		this.ensurePhantomBlock();
		this.bindEvents();
		this.bindBeforeUnload();
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

	private subscribeToSyncBlockId(): void {
		const handleSync = ((e: CustomEvent) => {
			const { serverId, localId } = e.detail;
			const oldWrapper = this.blockWrappers.get(localId);
			if (oldWrapper) {
				this.blockWrappers.delete(localId);
				oldWrapper.updateBlockId(serverId);
				this.blockWrappers.set(serverId, oldWrapper);
			}
		}) as EventListener;
		window.addEventListener('syncBlockId', handleSync);
		this.unsubscribeSyncBlockId = () => {
			window.removeEventListener('syncBlockId', handleSync);
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
		console.log('render body:', store.getActiveBlocks());
		if (this.isRendering) {
			console.log('here');
			return;
		}
		this.isRendering = true;
		try {
			const container = this.domElement?.querySelector(
				'.note__body-container',
			) as HTMLElement | null;
			if (!container) return;

			const blocks = store.getActiveBlocks();
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
			this.updatePhantomState();
		}
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
			const confirmed = await confirmDialog({
				title: 'Удаление подзаметки',
				message:
					`Вы действительно хотите удалить подзаметку "${subnoteTitle}"?\n\n` +
					`Внимание: Подзаметка и все её содержимое будут удалены без возможности восстановления.`,
				confirmText: 'Удалить',
				danger: true,
			});
			if (!confirmed) return;
			try {
				await noteService.deleteNote(subnoteId);
			} catch (error) {
				console.error('Failed to delete subnote:', error);
			}
			return;
		}

		if ([2, 6, 7].includes(block.block_type_id) && block.content) {
			try {
				await attachmentService.deleteAttachment(activeNoteId, blockId);
			} catch (error) {
				console.error('Failed to delete attachment:', error);
			}
		}

		await noteService.deleteBlock(activeNoteId, blockId);

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

	private async handleSplitBlock(blockId: string): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId) return;
		await noteService.createBlockAfter(
			activeNoteId,
			{ note_id: activeNoteId, block_type_id: 1 },
			blockId,
		);
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
		} else if (this.phantomBlock && container.contains(this.phantomBlock)) {
			container.insertBefore(draggedElement, this.phantomBlock);
		} else {
			container.appendChild(draggedElement);
		}
		this.updatePhantomState();
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
		container.addEventListener(
			'input',
			this.handleContainerInput as EventListener,
		);
	}

	private ensurePhantomBlock(): void {
		const container = this.domElement?.querySelector(
			'.note__body-container',
		) as HTMLElement | null;
		if (!container) return;
		if (this.phantomBlock && container.contains(this.phantomBlock)) {
			this.updatePhantomState();
			return;
		}
		const phantom = document.createElement('div');
		phantom.className = 'note__phantom-block';
		phantom.setAttribute('aria-hidden', 'true');
		phantom.addEventListener('click', this.handlePhantomClick);
		container.appendChild(phantom);
		this.phantomBlock = phantom;
		this.updatePhantomState();
	}

	private updatePhantomState(): void {
		if (!this.phantomBlock) return;
		const container = this.domElement?.querySelector(
			'.note__body-container',
		) as HTMLElement | null;
		if (!container) return;
		if (container.lastElementChild !== this.phantomBlock) {
			container.appendChild(this.phantomBlock);
		}
		const wrapperEls = container.querySelectorAll('.note__block-wrapper');
		const lastWrapperEl = wrapperEls[wrapperEls.length - 1] as
			| HTMLElement
			| undefined;
		let shouldShow = !!lastWrapperEl;
		if (shouldShow && lastWrapperEl) {
			const lastBlockId = lastWrapperEl.dataset.blockId;
			const block = store
				.getActiveBlocks()
				.find((b) => String(b.id) === lastBlockId);
			if (block && block.block_type_id === 1) {
				const blockEl = lastWrapperEl.querySelector(
					'.note__block',
				) as HTMLElement | null;
				const text = blockEl
					? blockEl.innerText
					: (block.content || '').replace(/<[^>]*>/g, '');
				if (text.replace(/ /g, '').trim() === '') {
					shouldShow = false;
				}
			}
		}
		this.phantomBlock.classList.toggle(
			'note__phantom-block--hidden',
			!shouldShow,
		);
	}

	private handlePhantomClick = async (): Promise<void> => {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId) return;
		const blocks = store.getActiveBlocks();
		if (blocks.length === 0) return;
		const lastBlock = blocks[blocks.length - 1];
		try {
			await noteService.createBlockAfter(
				activeNoteId,
				{ note_id: activeNoteId, block_type_id: 1 },
				String(lastBlock.id),
			);
		} catch (error) {
			console.error('Failed to create block from phantom:', error);
		}
	};

	private handleContainerInput = (e: Event): void => {
		const target = e.target as HTMLElement | null;
		if (!target?.closest('.note__block')) return;
		this.updatePhantomState();
	};

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

	private bindBeforeUnload(): void {
		this.beforeUnloadHandler = () => {
			const activeNoteId = store.getActiveNoteId();
			if (!activeNoteId) return;

			const container = this.domElement?.querySelector('.note__body-container');
			if (!container) return;

			const blocks = store.getActiveBlocks();
			for (const block of blocks) {
				if (block.block_type_id === 1) {
					const blockElement = container.querySelector(
						`.note__block-wrapper[data-block-id="${block.id}"] .note__block`,
					);
					if (blockElement) {
						const currentContent = blockElement.innerHTML;
						if (currentContent && block.content !== currentContent) {
							sessionStorage.setItem(
								`pending_block_${activeNoteId}_${block.id}`,
								currentContent,
							);
						}
					}
				}
			}
		};
		window.addEventListener('beforeunload', this.beforeUnloadHandler);
	}

	private async restoreFromSessionStorage(): Promise<void> {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId) return;

		const blocks = store.getActiveBlocks();
		for (const block of blocks) {
			if (block.block_type_id === 1) {
				const key = `pending_block_${activeNoteId}_${block.id}`;
				const savedContent = sessionStorage.getItem(key);
				if (
					savedContent &&
					block.block_type_id === 1 &&
					block.content !== savedContent
				) {
					try {
						await noteService.updateBlockContent(
							activeNoteId,
							String(block.id),
							savedContent,
						);
						sessionStorage.removeItem(key);
					} catch (error) {
						console.error('Failed to restore block content:', error);
					}
				}
			}
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
		if (this.phantomBlock) {
			this.phantomBlock.removeEventListener('click', this.handlePhantomClick);
			this.phantomBlock.remove();
			this.phantomBlock = null;
		}
		this.draggedBlockWrapper = null;
		this.draggedBlockId = null;
		this.isDraggingSelection = false;
		this.unsubscribeActiveBlocks?.();
		this.unsubscribePendingFocus?.();
		this.unsubscribeCollaborativeCreate?.();
		this.unsubscribeCollaborativeDelete?.();
		this.unsubscribeSyncBlockId?.();
		if (this.beforeUnloadHandler) {
			window.removeEventListener('beforeunload', this.beforeUnloadHandler);
		}
	}
}
