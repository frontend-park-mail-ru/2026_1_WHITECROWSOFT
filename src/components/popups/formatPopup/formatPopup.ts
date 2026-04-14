import Handlebars from 'handlebars';
import { noteService } from '../../../services/noteService.js';
import { store } from '../../../store.js';
import {
	applyFormattingToRange,
	getSelectionPositionsInElement,
} from '../../../utils/formattingUtils.js';
import { createElement } from '../../../utils/utils.js';
import templateText from './formatPopup.hbs?raw';
import './formatPopup.scss';

interface FormattingState {
	bold: boolean;
	italic: boolean;
	underline: boolean;
}

export class FormatPopup {
	private range: Range;
	private editor: HTMLElement;
	private element: HTMLElement | null;
	private _onDocumentClick: ((e: MouseEvent) => void) | null;
	private _onEscape: ((e: KeyboardEvent) => void) | null;
	private _onWindowResize: (() => void) | null;
	private _onScroll: (() => void) | null;
	private currentFormatting: FormattingState | null;
	private _checkSelectionInterval: number | null;

	constructor(range: Range, editorElement: HTMLElement) {
		this.range = range;
		this.editor = editorElement;
		this.element = null;
		this._onDocumentClick = null;
		this._onEscape = null;
		this._onWindowResize = null;
		this._onScroll = null;
		this.currentFormatting = null;
		this._checkSelectionInterval = null;
	}

	open(): void {
		this.close();
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
		this._detectCurrentFormatting();
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
	}

	private _position(): void {
		if (!this.range || !this.element) return;

		this.element.style.visibility = 'hidden';
		this.element.style.display = 'flex';
		this.element.style.position = 'fixed';

		void this.element.offsetHeight;

		const rect = this.range.getBoundingClientRect();
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

	private _restoreSelection(): void {
		if (!this.range) return;
		const selection = window.getSelection();
		if (selection) {
			selection.removeAllRanges();
			selection.addRange(this.range);
		}
	}

	private _getBlockFromRange(): HTMLElement | null {
		if (!this.range) return null;
		const node = this.range.commonAncestorContainer;
		const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
		return el?.closest('.note__block') || null;
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
		let node;

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

	private _clearFormattingInRange(
		element: HTMLElement,
		startPos: number,
		endPos: number,
	): void {
		const spans = element.querySelectorAll('.formatted-range');

		for (const span of spans) {
			const htmlSpan = span as HTMLElement;
			const spanStart = this._getSpanStartPosition(element, htmlSpan);
			const spanEnd = spanStart + (htmlSpan.textContent?.length || 0);

			if (spanStart >= startPos && spanEnd <= endPos) {
				const text = htmlSpan.textContent || '';
				const parent = htmlSpan.parentNode;
				if (parent) {
					parent.replaceChild(document.createTextNode(text), htmlSpan);
				}
			} else if (spanEnd > startPos && spanStart < endPos) {
				const text = htmlSpan.textContent || '';
				const beforeText = text.substring(0, Math.max(0, startPos - spanStart));
				const middleText = text.substring(
					Math.max(0, startPos - spanStart),
					Math.min(text.length, endPos - spanStart),
				);
				const afterText = text.substring(
					Math.min(text.length, endPos - spanStart),
				);

				const parent = htmlSpan.parentNode;
				if (parent) {
					const fragment = document.createDocumentFragment();
					if (beforeText)
						fragment.appendChild(document.createTextNode(beforeText));
					if (middleText)
						fragment.appendChild(document.createTextNode(middleText));
					if (afterText)
						fragment.appendChild(document.createTextNode(afterText));
					parent.replaceChild(fragment, htmlSpan);
				}
			}
		}

		element.normalize();
	}

	private _detectCurrentFormatting(): void {
		if (!this.range) return;
		this._restoreSelection();

		const blockEl = this._getBlockFromRange();
		if (!blockEl) {
			this.currentFormatting = {
				bold: false,
				italic: false,
				underline: false,
			};
			this._updateActiveStates(this.currentFormatting);
			return;
		}

		const { start, end } = getSelectionPositionsInElement(blockEl, this.range);
		if (start >= end) {
			this.currentFormatting = {
				bold: false,
				italic: false,
				underline: false,
			};
			this._updateActiveStates(this.currentFormatting);
			return;
		}

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

		if (!hasBold && !hasItalic && !hasUnderline) {
			const selection = window.getSelection();
			if (selection && selection.rangeCount > 0) {
				const range = selection.getRangeAt(0);
				const container = range.commonAncestorContainer;
				const parent =
					container.nodeType === 1
						? (container as HTMLElement)
						: container.parentElement;

				if (parent) {
					const styles = window.getComputedStyle(parent);
					const fontWeight = styles.fontWeight;
					hasBold = fontWeight === 'bold' || parseInt(fontWeight, 10) >= 700;
					hasItalic = styles.fontStyle === 'italic';
					hasUnderline = styles.textDecoration.includes('underline');
				}
			}
		}

		this.currentFormatting = {
			bold: hasBold,
			italic: hasItalic,
			underline: hasUnderline,
		};

		this._updateActiveStates(this.currentFormatting);
	}

	private _applyFormattingToDOM(
		element: HTMLElement,
		start: number,
		end: number,
		formatting: FormattingState,
	): void {
		const selection = window.getSelection();
		const originalRange =
			selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

		this._clearFormattingInRange(element, start, end);

		if (formatting.bold || formatting.italic || formatting.underline) {
			applyFormattingToRange(element, start, end, {
				bold: formatting.bold,
				italic: formatting.italic,
				underline: formatting.underline,
			});
		}

		if (originalRange && selection) {
			try {
				selection.removeAllRanges();
				selection.addRange(originalRange);
			} catch (e) {
				console.warn('Failed to restore selection:', e);
			}
		}
	}

	private async _handleAction(action: string): Promise<void> {
		if (!this.range) return;
		this._restoreSelection();
		const blockEl = this._getBlockFromRange();
		if (!blockEl?.dataset.blockId) return;

		const { start, end } = getSelectionPositionsInElement(blockEl, this.range);
		if (start >= end) return;

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

		const noteId = store.getActiveNoteId();
		if (!noteId) return;

		const currentContent = blockEl.innerHTML;
		try {
			await noteService.updateBlockContent(
				noteId,
				blockEl.dataset.blockId,
				currentContent,
			);
		} catch (error) {
			console.warn('[Popup] Failed to save content before formatting:', error);
		}

		this._applyFormattingToDOM(blockEl, start, end, newFmt);
		this.currentFormatting = newFmt;
		this._updateActiveStates(newFmt);

		try {
			await noteService.saveBlockFormatting(
				noteId,
				blockEl.dataset.blockId,
				start,
				end,
				newFmt,
			);
		} catch (error) {
			console.warn('[Popup] Save formatting failed:', error);
		}

		const newContent = blockEl.innerHTML;
		const blocks = store.getActiveBlocks();
		const updatedBlocks = blocks.map((b) =>
			String(b.id) === blockEl.dataset.blockId
				? { ...b, content: newContent }
				: b,
		);
		store.setActiveBlocks(updatedBlocks);

		this._restoreSelection();
		blockEl.focus();

		const selection = window.getSelection();
		if (selection && selection.rangeCount > 0) {
			this.range = selection.getRangeAt(0).cloneRange();
		} else if (this.range) {
			selection?.removeAllRanges();
			selection?.addRange(this.range);
		}
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
