import { store } from '../../../store.js';
import type { Block, Note } from '../../../types.js';
import { collabManager } from '../../../utils/collaborativeManager.js';
import { rebuildBlockFromRanges } from '../../../utils/formattingUtils.js';
import Component from '../../component.js';
import templateString from './textBlock.hbs?raw';

interface TextBlockOptions {
	block: Block;
	onContentChange?: (blockId: string, content: string) => void;
	onDelete?: (blockId: string) => void;
	onSplit?: (
		blockId: string,
		beforeContent: string,
		afterContent: string,
	) => void;
	onJoin?: (blockId: string, prevBlockId: string, joinOffset: number) => void;
}

/**
 * Компонент текстового блока заметки с поддержкой совместного редактирования через WebSocket
 */
export default class TextBlock extends Component {
	protected templateString = templateString;

	private block: Block;
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
	private unsubscribeCollabEvents: (() => void) | null = null;
	private isProcessing: boolean = false;
	private isBeingDeleted: boolean = false;
	private previousContent: string = '';

	constructor(options: TextBlockOptions) {
		super();
		this.block = options.block;
		console.log('[TextBlock] Initializing block:', this.block);
		this.onContentChange = options.onContentChange;
		this.onDelete = options.onDelete;
		this.onSplit = options.onSplit;
		this.onJoin = options.onJoin;
		this.previousContent = options.block.content || '';
		this.subscribeToCollabEvents();
	}

	private subscribeToCollabEvents(): void {
		const blockId = String(this.block.id);
		const currentUserId = store.getUser()?.id;
		console.log(
			'[TextBlock] subscribeToCollabEvents for blockId:',
			blockId,
			'currentUserId:',
			currentUserId,
		);

		const handleBlockUpdate = (e: Event) => {
			const detail = (e as CustomEvent).detail;

			// Логирование для отладки
			const idMatches = detail.blockId === blockId;
			const userMatches = detail.userId !== currentUserId;

			console.log('[TextBlock] collaborativeBlockUpdate event:', {
				eventBlockId: detail.blockId,
				expectedBlockId: blockId,
				idMatches,
				eventUserId: detail.userId,
				currentUserId,
				userMatches,
				shouldApply: idMatches && userMatches,
				domElementExists: !!this.domElement,
			});

			if (idMatches && userMatches) {
				if (this.domElement) {
					this.applyRemoteUpdate(detail);
				} else {
					console.warn(
						'[TextBlock] Cannot apply update - domElement not found for blockId:',
						blockId,
					);
				}
			}
		};
		window.addEventListener('collaborativeBlockUpdate', handleBlockUpdate);
		this.unsubscribeCollabEvents = () => {
			window.removeEventListener('collaborativeBlockUpdate', handleBlockUpdate);
		};
	}

	private applyRemoteUpdate(detail: {
		content: string;
		position: number;
		char?: string;
		isInsert?: boolean;
	}): void {
		const blockEl = this.domElement;
		if (!blockEl) return;
		const wasFocused = document.activeElement === blockEl;
		let oldCursorPosition = 0;
		if (wasFocused) {
			const selection = window.getSelection();
			if (selection && selection.rangeCount > 0) {
				const range = selection.getRangeAt(0);
				const preRange = document.createRange();
				preRange.setStart(blockEl, 0);
				preRange.setEnd(range.startContainer, range.startOffset);
				oldCursorPosition = preRange.toString().length;
			}
		}
		blockEl.innerHTML = this.escapeHtml(detail.content);
		const ranges = this.block.formatting?.ranges || [];
		if (ranges.length > 0) {
			rebuildBlockFromRanges(blockEl as HTMLElement, ranges);
		}
		this.block.content = detail.content;
		if (wasFocused) {
			let newCursorPosition = oldCursorPosition;
			if (detail.isInsert && detail.position !== undefined) {
				if (detail.position <= oldCursorPosition) {
					newCursorPosition = oldCursorPosition + 1;
				}
			} else if (!detail.isInsert && detail.position !== undefined) {
				if (detail.position < oldCursorPosition) {
					newCursorPosition = oldCursorPosition - 1;
				}
			}
			if (newCursorPosition < 0) newCursorPosition = 0;
			this.setCursorAtOffset(newCursorPosition);
		}
	}

	protected getTemplateData() {
		const ranges = this.block.formatting?.ranges || [];
		return {
			blockId: this.block.id,
			content: this.block.content || '',
			hasFormatting: ranges.length > 0,
		};
	}

	onRender(): void {
		this.applyFormatting();
		this.bindEvents();
	}

	private applyFormatting(): void {
		const blockEl = this.domElement;
		if (!blockEl) return;
		const ranges = this.block.formatting?.ranges || [];
		if (ranges.length > 0) {
			rebuildBlockFromRanges(blockEl as HTMLElement, ranges);
		}
	}

	private bindEvents(): void {
		const blockEl = this.domElement;
		if (!blockEl) return;

		blockEl.addEventListener('focus', () => {
			this.updateCursorPosition();
		});

		blockEl.addEventListener('click', () => {
			this.updateCursorPosition();
		});

		blockEl.addEventListener('beforeinput', (e) => {
			this.handleBeforeInput(e as InputEvent, blockEl as HTMLElement);
		});

		blockEl.addEventListener('input', () => {
			this.updateCursorPosition();
		});

		blockEl.addEventListener('blur', async () => {
			if (this.isBeingDeleted) return;
			await this.saveContent();
		});

		blockEl.addEventListener('keydown', async (e) => {
			if (this.isProcessing) return;
			await this.handleKeydown(e as KeyboardEvent, blockEl as HTMLElement);
		});
	}

	/**
	 * Обрабатывает событие beforeinput для отправки операций
	 * Определяет тип операции (вставка/удаление) и отправляет соответствующее сообщение
	 */
	private handleBeforeInput(e: InputEvent, blockEl: HTMLElement): void {
		if (!e.inputType) return;

		const activeNoteId = store.getActiveNoteId();
		const note = store.getNotes().find((n: Note) => n.ID === activeNoteId);
		const isPublic = note?.is_public === true;

		console.log('[TextBlock] handleBeforeInput:', {
			inputType: e.inputType,
			isPublic,
			data: e.data,
			blockId: this.block.id,
		});

		if (!isPublic) return;

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;

		const range = selection.getRangeAt(0);

		const preRange = document.createRange();
		preRange.setStart(blockEl, 0);
		preRange.setEnd(range.startContainer, range.startOffset);
		const cursorPosition = preRange.toString().length;

		const blockId = String(this.block.id);

		if (e.inputType === 'insertText' && e.data) {
			console.log('[TextBlock] Sending insert char:', {
				blockId,
				cursorPosition,
				char: e.data,
			});
			collabManager.sendInsertChar(blockId, cursorPosition, e.data);
		} else if (e.inputType === 'deleteContentBackward') {
			if (cursorPosition > 0) {
				console.log('[TextBlock] Sending delete char:', {
					blockId,
					position: cursorPosition - 1,
				});
				collabManager.sendDeleteChar(blockId, cursorPosition - 1);
			}
		} else if (e.inputType === 'deleteContentForward') {
			console.log('[TextBlock] Sending delete char:', {
				blockId,
				position: cursorPosition,
			});
			collabManager.sendDeleteChar(blockId, cursorPosition);
		}
	}

	/**
	 * Обновляет позицию курсора и отправляет её другим участникам
	 * Вызывается при фокусе, клике и вводе текста
	 */
	private updateCursorPosition(): void {
		const activeNoteId = store.getActiveNoteId();
		const note = store.getNotes().find((n: Note) => n.ID === activeNoteId);
		const isPublic = note?.is_public === true;

		if (!isPublic) return;
		const blockEl = this.domElement;
		if (!blockEl) return;

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;

		const range = selection.getRangeAt(0);

		const preRange = document.createRange();
		preRange.setStart(blockEl, 0);
		preRange.setEnd(range.startContainer, range.startOffset);
		const cursorPosition = preRange.toString().length;
		collabManager.sendCursorMove(String(this.block.id), cursorPosition);
	}

	private async saveContent(): Promise<void> {
		const blockEl = this.domElement;
		if (!blockEl) return;
		const newContent = blockEl.innerHTML;
		if (this.block.content !== newContent) {
			this.block.content = newContent;
			this.onContentChange?.(String(this.block.id), newContent);
		}
	}

	private async handleKeydown(
		e: KeyboardEvent,
		blockEl: HTMLElement,
	): Promise<void> {
		const isEnter = e.key === 'Enter';
		const isBackspace = e.key === 'Backspace';
		const isDelete = e.key === 'Delete';
		if (isEnter && !e.shiftKey) {
			e.preventDefault();
			this.isProcessing = true;
			await this.handleSplit(blockEl);
			this.isProcessing = false;
			return;
		}
		const isEmpty = blockEl.innerText.trim() === '';
		if ((isBackspace || isDelete) && isEmpty) {
			e.preventDefault();
			this.isProcessing = true;
			this.isBeingDeleted = true;
			this.onDelete?.(String(this.block.id));
			this.isProcessing = false;
			return;
		}
		if (isBackspace && !isEmpty && this.isCaretAtStart(blockEl)) {
			e.preventDefault();
			this.isProcessing = true;
			await this.handleJoinBackward(blockEl);
			this.isProcessing = false;
			return;
		}
	}

	private async handleSplit(blockEl: HTMLElement): Promise<void> {
		const parts = this.getCaretParts(blockEl);
		if (!parts) return;

		const activeNoteId = store.getActiveNoteId();
		const note = store.getNotes().find((n: Note) => n.ID === activeNoteId);
		const isPublic = note?.is_public === true;

		blockEl.innerHTML = parts.before;

		if (isPublic) {
			const blocks = store.getActiveBlocks();
			const currentIndex = blocks.findIndex((b) => b.id === this.block.id);
			const newPosition = currentIndex + 1;
			collabManager.sendCreateBlock(1, newPosition);
		} else {
			this.onSplit?.(String(this.block.id), parts.before, parts.after);
		}
	}

	private async handleJoinBackward(blockEl: HTMLElement): Promise<void> {
		const wrapper = blockEl.closest('.note__block-wrapper');
		if (!wrapper) return;
		const prevWrapper = wrapper.previousElementSibling as HTMLElement;
		const prevBlockEl = prevWrapper?.querySelector(
			'.note__block',
		) as HTMLElement;
		if (!prevBlockEl || prevBlockEl.contentEditable !== 'true') return;
		await this.saveContent();
		const joinOffset = prevBlockEl.innerText.length;
		this.onJoin?.(
			String(this.block.id),
			String(prevWrapper.dataset.blockId),
			joinOffset,
		);
	}

	private getCaretParts(
		blockEl: HTMLElement,
	): { before: string; after: string } | null {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return null;
		const range = selection.getRangeAt(0);
		range.collapse(true);
		const marker = document.createElement('span');
		marker.id = '__split_marker__';
		range.insertNode(marker);
		const fullHTML = blockEl.innerHTML;
		marker.remove();
		const MARKER = '<span id="__split_marker__"></span>';
		const splitIndex = fullHTML.indexOf(MARKER);
		if (splitIndex === -1) return null;
		return {
			before: fullHTML.slice(0, splitIndex),
			after: fullHTML.slice(splitIndex + MARKER.length),
		};
	}

	private isCaretAtStart(blockEl: HTMLElement): boolean {
		const selection = window.getSelection();
		if (!selection || !selection.isCollapsed || selection.rangeCount === 0)
			return false;
		const range = selection.getRangeAt(0);
		const beforeRange = document.createRange();
		beforeRange.setStart(blockEl, 0);
		beforeRange.setEnd(range.startContainer, range.startOffset);
		return beforeRange.toString().length === 0;
	}

	focus(): void {
		const blockEl = this.domElement;
		blockEl?.focus();
	}

	getContent(): string {
		return this.block.content || '';
	}

	setCursorAtStart(): void {
		const blockEl = this.domElement;
		if (!blockEl) return;
		const selection = window.getSelection();
		if (!selection) return;
		const range = document.createRange();
		range.setStart(blockEl, 0);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);
	}

	setCursorAtOffset(offset: number): void {
		const blockEl = this.domElement;
		if (!blockEl) return;
		const selection = window.getSelection();
		if (!selection) return;
		const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
		let remaining = offset;
		let node: Text | null;
		while ((node = walker.nextNode() as Text | null)) {
			if (remaining <= node.length) {
				const range = document.createRange();
				range.setStart(node, remaining);
				range.collapse(true);
				selection.removeAllRanges();
				selection.addRange(range);
				return;
			}
			remaining -= node.length;
		}
		const range = document.createRange();
		range.selectNodeContents(blockEl);
		range.collapse(false);
		selection.removeAllRanges();
		selection.addRange(range);
	}

	/**
	 * Обновляет блок из store (когда содержимое изменилось извне)
	 * Применяется при обновлениях от других пользователей
	 */
	updateBlock(newBlock: Block): void {
		const contentChanged = this.block.content !== newBlock.content;
		const formattingChanged =
			JSON.stringify(this.block.formatting) !==
			JSON.stringify(newBlock.formatting);

		this.block = newBlock;

		if (!contentChanged && !formattingChanged) {
			console.log('[TextBlock] updateBlock called but no changes detected');
			return;
		}

		if (!this.domElement) {
			console.warn(
				'[TextBlock] updateBlock called but domElement not ready, skipping update',
			);
			return;
		}

		console.log('[TextBlock] Updating content for block:', this.block.id, {
			contentChanged,
			formattingChanged,
		});

		if (contentChanged) {
			// Сохраняем позицию курсора если блок в фокусе
			const wasFocused = document.activeElement === this.domElement;
			let oldCursorPosition = 0;

			if (wasFocused) {
				const selection = window.getSelection();
				if (selection && selection.rangeCount > 0) {
					const range = selection.getRangeAt(0);
					const preRange = document.createRange();
					preRange.setStart(this.domElement, 0);
					preRange.setEnd(range.startContainer, range.startOffset);
					oldCursorPosition = preRange.toString().length;
				}
			}

			// Обновляем содержимое
			this.domElement.textContent = newBlock.content || '';
			this.previousContent = newBlock.content || '';

			// Восстанавливаем фокус и позицию курсора
			if (wasFocused) {
				this.domElement.focus();
				this.setCursorAtOffset(oldCursorPosition);
			}
		}

		if (formattingChanged) {
			this.applyFormatting();
		}
	}

	destroy(): void {
		this.unsubscribeCollabEvents?.();
	}
}
