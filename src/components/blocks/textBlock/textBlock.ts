import type { Block } from '../../../types.js';
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
	private isProcessing: boolean = false;
	private isBeingDeleted: boolean = false;
	private previousContent: string = '';

	constructor(options: TextBlockOptions) {
		super();
		this.block = options.block;
		this.onContentChange = options.onContentChange;
		this.onDelete = options.onDelete;
		this.onSplit = options.onSplit;
		this.onJoin = options.onJoin;
		this.previousContent = options.block.content || '';
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

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;

		const range = selection.getRangeAt(0);
		let cursorPosition = 0;

		const preRange = document.createRange();
		preRange.setStart(blockEl, 0);
		preRange.setEnd(range.startContainer, range.startOffset);
		cursorPosition = preRange.toString().length;

		collabManager.sendCursorMove(String(this.block.id), cursorPosition);

		if (e.inputType === 'insertText' && e.data) {
			setTimeout(() => {
				collabManager.sendInsertChar(
					String(this.block.id),
					cursorPosition,
					e.data!,
				);
			}, 0);
		} else if (e.inputType === 'deleteContentBackward') {
			if (cursorPosition > 0) {
				collabManager.sendDeleteChar(String(this.block.id), cursorPosition - 1);
			}
		} else if (e.inputType === 'deleteContentForward') {
			collabManager.sendDeleteChar(String(this.block.id), cursorPosition);
		}
	}

	/**
	 * Обновляет позицию курсора и отправляет её другим участникам
	 * Вызывается при фокусе, клике и вводе текста
	 */
	private updateCursorPosition(): void {
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
		blockEl.innerHTML = parts.before;
		this.onSplit?.(String(this.block.id), parts.before, parts.after);
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

	updateBlock(newBlock: Block): void {
		const contentChanged = this.block.content !== newBlock.content;
		const formattingChanged =
			JSON.stringify(this.block.formatting) !==
			JSON.stringify(newBlock.formatting);
		this.block = newBlock;

		if (!this.domElement || (!contentChanged && !formattingChanged)) {
			return;
		}

		this.domElement.innerHTML = this.block.content || '';
		if (formattingChanged) {
			this.applyFormatting();
		}
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

	destroy(): void {}
}
