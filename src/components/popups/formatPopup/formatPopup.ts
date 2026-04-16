import Handlebars from 'handlebars';
import { noteService } from '../../../services/noteService.js';
import { store } from '../../../store.js';
import {
	applyFormattingToRanges,
	getSelectionPositionsInElement,
	updateFormattingInRange,
} from '../../../utils/formattingUtils.js';
import { createElement } from '../../../utils/utils.js';
import templateText from './formatPopup.hbs?raw';
import './formatPopup.scss';

interface FormattingState {
	bold: boolean;
	italic: boolean;
	underline: boolean;
}

interface SelectionData {
	blockEl: HTMLElement;
	start: number;
	end: number;
	noteId: string | number;
	blockId: string | number;
}

export class FormatPopup {
	private selectionData: SelectionData | null;
	private editor: HTMLElement;
	private element: HTMLElement | null;
	private _onDocumentClick: ((e: MouseEvent) => void) | null;
	private _onEscape: ((e: KeyboardEvent) => void) | null;
	private _onWindowResize: (() => void) | null;
	private _onScroll: (() => void) | null;
	private currentFormatting: FormattingState | null;
	private _checkSelectionInterval: number | null;
	private rangeForPosition: Range | null;

	constructor(range: Range, editorElement: HTMLElement) {
		this.rangeForPosition = range.cloneRange();
		this.editor = editorElement;
		this.element = null;
		this._onDocumentClick = null;
		this._onEscape = null;
		this._onWindowResize = null;
		this._onScroll = null;
		this.currentFormatting = null;
		this._checkSelectionInterval = null;
		this.selectionData = null;
	}

	open(): void {
		this.close();
		if (!this.rangeForPosition) return;

		const blockEl = this._getBlockFromRange(this.rangeForPosition);
		if (!blockEl?.dataset.blockId) {
			this.close();
			return;
		}

		const noteId = store.getActiveNoteId();
		if (!noteId) {
			this.close();
			return;
		}

		const { start, end } = getSelectionPositionsInElement(
			blockEl,
			this.rangeForPosition,
		);
		if (start >= end) {
			this.close();
			return;
		}

		this.selectionData = {
			blockEl,
			start,
			end,
			noteId,
			blockId: blockEl.dataset.blockId,
		};

		this._detectCurrentFormatting();

		const html = Handlebars.compile(templateText)({
			font: 'Inter',
			fontSize: '14',
			isBold: false,
			isItalic: false,
			isUnderline: false,
			isStrike: false,
		});

		this.element = createElement('div', 'formattingPopup');
		this.element.innerHTML = html;
		document.body.appendChild(this.element);
		this._position();
		this._bindGlobalCloseHandlers();
		this._bindPopupEvents();
		this.element.classList.add('formattingPopup--visible');

		this.element.addEventListener('mousedown', (e: MouseEvent) =>
			e.stopPropagation(),
		);
		this.element.addEventListener('click', (e: MouseEvent) =>
			e.stopPropagation(),
		);

		this._checkSelectionInterval = window.setInterval(() => {
			if (!this._isSelectionValid()) {
				this.close();
			}
		}, 500);
	}

	close(): void {
		if (this._checkSelectionInterval) {
			clearInterval(this._checkSelectionInterval);
			this._checkSelectionInterval = null;
		}
		if (this.element) {
			this._unbindGlobalCloseHandlers();
			this.element.remove();
			this.element = null;
		}
		this.selectionData = null;
	}

	private _position(): void {
		if (!this.rangeForPosition || !this.element) return;

		this.element.style.visibility = 'hidden';
		this.element.style.display = 'flex';
		this.element.style.position = 'fixed';

		void this.element.offsetHeight;

		const rect = this.rangeForPosition.getBoundingClientRect();
		const popupRect = this.element.getBoundingClientRect();

		let top = rect.top - popupRect.height - 15;
		let left = rect.left + rect.width / 2 - popupRect.width / 2;

		if (top < 10) {
			top = rect.bottom + 15;
		}

		if (top + popupRect.height > window.innerHeight - 10) {
			top = rect.top - popupRect.height - 15;
			if (top < 10) {
				top = 10;
			}
		}

		left = Math.max(
			10,
			Math.min(left, window.innerWidth - popupRect.width - 10),
		);

		this.element.style.top = `${top}px`;
		this.element.style.left = `${left}px`;
		this.element.style.visibility = 'visible';
	}

	private _bindGlobalCloseHandlers(): void {
		this._onDocumentClick = (e: MouseEvent) => {
			if (this.element?.contains(e.target as Node)) return;
			if (this.editor?.contains(e.target as Node)) {
				const selection = window.getSelection();
				if (selection && !selection.isCollapsed) {
					return;
				}
			}
			this.close();
		};

		this._onEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') this.close();
		};

		this._onWindowResize = () => this._position();
		this._onScroll = () => this._position();

		document.addEventListener('click', this._onDocumentClick, true);
		document.addEventListener('keydown', this._onEscape);
		window.addEventListener('resize', this._onWindowResize);
		window.addEventListener('scroll', this._onScroll, true);
	}

	private _unbindGlobalCloseHandlers(): void {
		if (this._onDocumentClick) {
			document.removeEventListener('click', this._onDocumentClick, true);
		}
		if (this._onEscape) {
			document.removeEventListener('keydown', this._onEscape);
		}
		if (this._onWindowResize) {
			window.removeEventListener('resize', this._onWindowResize);
		}
		if (this._onScroll) {
			window.removeEventListener('scroll', this._onScroll, true);
		}
		this._onDocumentClick = null;
		this._onEscape = null;
		this._onWindowResize = null;
		this._onScroll = null;
	}

	private _bindPopupEvents(): void {
		if (!this.element) return;

		this.element.addEventListener('click', (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			const btn = target.closest('button[data-action]') as HTMLElement | null;
			if (!btn) return;
			e.preventDefault();
			e.stopPropagation();
			const action = btn.dataset.action;
			if (action) {
				this._handleAction(action);
			}
		});
	}

	private _getBlockFromRange(range: Range): HTMLElement | null {
		if (!range) return null;

		let container = range.commonAncestorContainer;
		if (container.nodeType === Node.TEXT_NODE) {
			container = container.parentElement as HTMLElement;
		}

		let block = (container as HTMLElement).closest?.('.note__block');
		if (block) return block as HTMLElement;

		container = range.startContainer;
		if (container.nodeType === Node.TEXT_NODE) {
			container = container.parentElement as HTMLElement;
		}
		block = (container as HTMLElement).closest?.('.note__block');
		if (block) return block as HTMLElement;

		container = range.endContainer;
		if (container.nodeType === Node.TEXT_NODE) {
			container = container.parentElement as HTMLElement;
		}
		block = (container as HTMLElement).closest?.('.note__block');
		if (block) return block as HTMLElement;

		return null;
	}

	private _detectCurrentFormatting(): void {
		if (!this.selectionData) return;

		const { blockEl, start, end } = this.selectionData;

		let hasBold = false;
		let hasItalic = false;
		let hasUnderline = false;

		const spans = blockEl.querySelectorAll('.formatted-range');
		for (const span of spans) {
			const htmlSpan = span as HTMLElement;
			const spanStart = this._getSpanStartPosition(blockEl, htmlSpan);
			const spanEnd = spanStart + (htmlSpan.textContent?.length || 0);

			if (spanEnd > start && spanStart < end) {
				const styles = window.getComputedStyle(htmlSpan);
				const fontWeight = styles.fontWeight;
				hasBold =
					hasBold || fontWeight === 'bold' || parseInt(fontWeight, 10) >= 700;
				hasItalic = hasItalic || styles.fontStyle === 'italic';
				hasUnderline =
					hasUnderline || styles.textDecoration.includes('underline');
			}
		}

		this.currentFormatting = {
			bold: hasBold,
			italic: hasItalic,
			underline: hasUnderline,
		};

		this._updateActiveStates(this.currentFormatting);
	}

	private _getSpanStartPosition(
		blockEl: HTMLElement,
		span: HTMLElement,
	): number {
		let startPos = 0;
		let currentPos = 0;
		const walker = document.createTreeWalker(
			blockEl,
			NodeFilter.SHOW_TEXT,
			null,
		);
		let node: Node | null;

		while ((node = walker.nextNode())) {
			const nodeText = node.textContent || '';
			if (span.contains(node)) {
				startPos = currentPos;
				break;
			}
			currentPos += nodeText.length;
		}

		return startPos;
	}

	private async _handleAction(action: string): Promise<void> {
		if (!this.selectionData) {
			this.close();
			return;
		}

		const { blockEl, start, end, noteId, blockId } = this.selectionData;

		const currentFmt = this.currentFormatting || {
			bold: false,
			italic: false,
			underline: false,
		};

		let newFmt: FormattingState;
		switch (action) {
			case 'bold':
				newFmt = { ...currentFmt, bold: !currentFmt.bold };
				break;
			case 'italic':
				newFmt = { ...currentFmt, italic: !currentFmt.italic };
				break;
			case 'underline':
				newFmt = { ...currentFmt, underline: !currentFmt.underline };
				break;
			default:
				return;
		}

		this._applyFormattingToDOM(
			blockEl,
			start,
			end,
			action,
			newFmt[action as keyof FormattingState],
		);

		this.currentFormatting = newFmt;
		this._updateActiveStates(newFmt);

		const newContent = blockEl.innerHTML;

		try {
			await noteService.updateBlockContent(noteId, blockId, newContent);
		} catch (error) {
			console.warn('[Popup] Failed to save content:', error);
		}

		try {
			const formattingPayload: {
				bold?: boolean;
				italic?: boolean;
				underline?: boolean;
			} = {};
			if (action === 'bold') formattingPayload.bold = newFmt.bold;
			if (action === 'italic') formattingPayload.italic = newFmt.italic;
			if (action === 'underline')
				formattingPayload.underline = newFmt.underline;

			await noteService.saveBlockFormatting(
				noteId,
				blockId,
				start,
				end,
				formattingPayload,
			);

			const blocks = store.getActiveBlocks();
			const updatedBlocks = blocks.map((b) => {
				if (String(b.id) === String(blockId)) {
					const existingRanges = b.formatting?.ranges || [];
					const newRange = {
						start_pos: start,
						end_pos: end,
						bold: action === 'bold' ? newFmt.bold : null,
						italic: action === 'italic' ? newFmt.italic : null,
						underline: action === 'underline' ? newFmt.underline : null,
					};
					const newRanges = applyFormattingToRanges(existingRanges, newRange);
					return { ...b, formatting: { ranges: newRanges } };
				}
				return b;
			});
			store.setActiveBlocks(updatedBlocks);
		} catch (error) {
			console.warn('[Popup] Save formatting failed:', error);
		}

		this._restoreSelectionByPositions(blockEl, start, end);
		blockEl.focus();
	}

	private _restoreSelectionByPositions(
		element: HTMLElement,
		start: number,
		end: number,
	): void {
		const selection = window.getSelection();
		if (!selection) return;
		selection.removeAllRanges();

		const currentElement = document.querySelector(
			`.note__block[data-block-id="${element.dataset.blockId}"]`,
		) as HTMLElement;
		if (!currentElement) {
			console.log('[FormatPopup] Element not found in DOM');
			return;
		}

		const walker = document.createTreeWalker(
			currentElement,
			NodeFilter.SHOW_TEXT,
			null,
		);
		let currentNode: Text | null = walker.nextNode() as Text | null;
		let currentPos = 0;
		let startNode: Text | null = null;
		let startOffset = 0;
		let endNode: Text | null = null;
		let endOffset = 0;

		while (currentNode) {
			const nodeLength = currentNode.textContent?.length || 0;
			const nodeStart = currentPos;
			const nodeEnd = currentPos + nodeLength;

			if (nodeStart <= start && nodeEnd >= start) {
				startNode = currentNode;
				startOffset = start - nodeStart;
			}

			if (nodeStart <= end && nodeEnd >= end) {
				endNode = currentNode;
				endOffset = end - nodeStart;
				break;
			}

			currentPos = nodeEnd;
			currentNode = walker.nextNode() as Text | null;
		}

		if (startNode && endNode) {
			try {
				const newRange = document.createRange();
				newRange.setStart(startNode, startOffset);
				newRange.setEnd(endNode, endOffset);
				selection.addRange(newRange);
			} catch (e) {
				console.log('[FormatPopup] Error creating range:', e);
			}
		}
	}

	private _applyFormattingToDOM(
		element: HTMLElement,
		start: number,
		end: number,
		action: string,
		value: boolean,
	): void {
		updateFormattingInRange(element, start, end, action, value);
	}

	private _updateActiveStates(formatting: FormattingState | null): void {
		if (!this.element) return;
		const boldBtn = this.element.querySelector('[data-action="bold"]');
		const italicBtn = this.element.querySelector('[data-action="italic"]');
		const underlineBtn = this.element.querySelector(
			'[data-action="underline"]',
		);

		if (boldBtn)
			boldBtn.classList.toggle(
				'formattingPopup__button--active',
				Boolean(formatting?.bold),
			);
		if (italicBtn)
			italicBtn.classList.toggle(
				'formattingPopup__button--active',
				Boolean(formatting?.italic),
			);
		if (underlineBtn)
			underlineBtn.classList.toggle(
				'formattingPopup__button--active',
				Boolean(formatting?.underline),
			);
	}

	private _isSelectionValid(): boolean {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
			return false;
		}
		const currentRange = selection.getRangeAt(0);
		return this.editor?.contains(currentRange.commonAncestorContainer) || false;
	}

	getElement(): HTMLElement | null {
		return this.element;
	}
}
