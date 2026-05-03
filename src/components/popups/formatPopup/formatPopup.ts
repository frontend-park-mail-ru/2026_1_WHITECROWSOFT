import { noteService } from '../../../services/noteService.js';
import { store } from '../../../store.js';
import {
	applyFormattingToRanges,
	detectFormattingInSelection,
	getBlockFromRange,
	getSelectionPositionsInElement,
	restoreSelectionByPositions,
	updateFormattingInRange,
} from '../../../utils/formattingUtils.js';
import { positionPopup } from '../../../utils/positionPopup.js';
import { isSelectionValid } from '../../../utils/selectionUtils.js';
import Component from '../../component.js';
import templateString from './formatPopup.hbs?raw';
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

interface FormatPopupOptions {
	range: Range;
	editorElement: HTMLElement;
}

export default class FormatPopup extends Component {
	protected templateString = templateString;

	private range: Range;
	private editor: HTMLElement;
	private selectionData: SelectionData | null = null;
	private currentFormatting: FormattingState | null = null;
	private checkSelectionInterval: number | null = null;

	private boundHandlers: {
		onDocumentClick?: (e: MouseEvent) => void;
		onEscape?: (e: KeyboardEvent) => void;
		onWindowResize?: () => void;
		onScroll?: () => void;
		onPopupClick?: (e: MouseEvent) => void;
	} = {};

	constructor(options: FormatPopupOptions) {
		super();
		this.range = options.range.cloneRange();
		this.editor = options.editorElement;
	}

	protected getTemplateData() {
		const fmt = this.currentFormatting || {
			bold: false,
			italic: false,
			underline: false,
		};
		return {
			font: 'Inter',
			fontSize: '14',
			isBold: fmt.bold,
			isItalic: fmt.italic,
			isUnderline: fmt.underline,
			isStrike: false,
		};
	}

	open(): void {
		this.close();
		if (!this.range) return;
		const blockEl = getBlockFromRange(this.range);
		if (!blockEl?.dataset.blockId) {
			this.close();
			return;
		}
		const noteId = store.getActiveNoteId();
		if (!noteId) {
			this.close();
			return;
		}
		const { start, end } = getSelectionPositionsInElement(blockEl, this.range);
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
		this.currentFormatting = detectFormattingInSelection(blockEl, start, end);
		this.renderTo(document.body);
		this.startSelectionCheck();
	}

	onRender(): void {
		if (this.range && this.domElement) {
			positionPopup(this.range, this.domElement);
		}
		this.bindGlobalCloseHandlers();
		this.bindPopupEvents();
	}

	close(): void {
		this.stopSelectionCheck();
		if (this.domElement) {
			this.unbindGlobalCloseHandlers();
			this.unbindPopupEvents();
			this.domElement.remove();
			this.domElement = null;
		}
		this.selectionData = null;
		this.currentFormatting = null;
	}

	private bindGlobalCloseHandlers(): void {
		this.boundHandlers.onDocumentClick = (e: MouseEvent) => {
			if (this.domElement?.contains(e.target as Node)) return;
			if (this.editor?.contains(e.target as Node)) {
				const selection = window.getSelection();
				if (selection && !selection.isCollapsed) {
					return;
				}
			}
			this.close();
		};
		this.boundHandlers.onEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') this.close();
		};
		this.boundHandlers.onWindowResize = () => {
			if (this.range && this.domElement) {
				positionPopup(this.range, this.domElement);
			}
		};
		this.boundHandlers.onScroll = () => {
			if (this.range && this.domElement) {
				positionPopup(this.range, this.domElement);
			}
		};
		document.addEventListener(
			'click',
			this.boundHandlers.onDocumentClick,
			true,
		);
		document.addEventListener('keydown', this.boundHandlers.onEscape);
		window.addEventListener('resize', this.boundHandlers.onWindowResize);
		window.addEventListener('scroll', this.boundHandlers.onScroll, true);
	}

	private unbindGlobalCloseHandlers(): void {
		if (this.boundHandlers.onDocumentClick) {
			document.removeEventListener(
				'click',
				this.boundHandlers.onDocumentClick,
				true,
			);
		}
		if (this.boundHandlers.onEscape) {
			document.removeEventListener('keydown', this.boundHandlers.onEscape);
		}
		if (this.boundHandlers.onWindowResize) {
			window.removeEventListener('resize', this.boundHandlers.onWindowResize);
		}
		if (this.boundHandlers.onScroll) {
			window.removeEventListener('scroll', this.boundHandlers.onScroll, true);
		}
	}

	private bindPopupEvents(): void {
		if (!this.domElement) return;
		this.boundHandlers.onPopupClick = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			const btn = target.closest('button[data-action]') as HTMLElement | null;
			if (!btn) return;
			e.preventDefault();
			e.stopPropagation();
			const action = btn.dataset.action;
			this.handleFormattingAction(action);
		};
		this.domElement.addEventListener('click', this.boundHandlers.onPopupClick);
		this.domElement.addEventListener('mousedown', (e) => e.stopPropagation());
	}

	private unbindPopupEvents(): void {
		if (this.domElement && this.boundHandlers.onPopupClick) {
			this.domElement.removeEventListener(
				'click',
				this.boundHandlers.onPopupClick,
			);
		}
	}

	private async handleFormattingAction(
		action: string | undefined,
	): Promise<void> {
		if (!this.selectionData || !this.currentFormatting) return;
		let newValue: boolean;
		switch (action) {
			case 'bold':
				newValue = !this.currentFormatting.bold;
				await this.applyFormatting('bold', newValue);
				this.currentFormatting.bold = newValue;
				break;
			case 'italic':
				newValue = !this.currentFormatting.italic;
				await this.applyFormatting('italic', newValue);
				this.currentFormatting.italic = newValue;
				break;
			case 'underline':
				newValue = !this.currentFormatting.underline;
				await this.applyFormatting('underline', newValue);
				this.currentFormatting.underline = newValue;
				break;
			default:
				return;
		}
		this.updateActiveStates();
	}

	private async applyFormatting(action: string, value: boolean): Promise<void> {
		if (!this.selectionData) return;
		const { blockEl, start, end, noteId, blockId } = this.selectionData;
		const oldContent = blockEl.innerHTML;
		updateFormattingInRange(blockEl, start, end, action, value);
		const newContent = blockEl.innerHTML;

		if (oldContent !== newContent) {
			try {
				await noteService.updateBlockContent(noteId, blockId, newContent);
				const blocks = store.getActiveBlocks();
				const updatedBlocks = blocks.map((b) =>
					String(b.id) === String(blockId) ? { ...b, content: newContent } : b,
				);
				store.setActiveBlocksSilently(updatedBlocks);
			} catch (error) {
				console.warn('[FormatPopup] Failed to save content:', error);
			}
		}

		try {
			const formattingPayload: {
				bold?: boolean;
				italic?: boolean;
				underline?: boolean;
			} = {};
			if (action === 'bold') formattingPayload.bold = value;
			if (action === 'italic') formattingPayload.italic = value;
			if (action === 'underline') formattingPayload.underline = value;
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
						bold: action === 'bold' ? value : null,
						italic: action === 'italic' ? value : null,
						underline: action === 'underline' ? value : null,
					};
					const newRanges = applyFormattingToRanges(existingRanges, newRange);
					return { ...b, formatting: { ranges: newRanges } };
				}
				return b;
			});
			store.setActiveBlocksSilently(updatedBlocks);
		} catch (error) {
			console.warn('[FormatPopup] Save formatting failed:', error);
		}
		restoreSelectionByPositions(blockEl, start, end);
		blockEl.focus();
	}

	private updateActiveStates(): void {
		if (!this.domElement || !this.currentFormatting) return;
		const boldBtn = this.domElement.querySelector('[data-action="bold"]');
		const italicBtn = this.domElement.querySelector('[data-action="italic"]');
		const underlineBtn = this.domElement.querySelector(
			'[data-action="underline"]',
		);
		boldBtn?.classList.toggle(
			'formattingPopup__button--active',
			this.currentFormatting.bold,
		);
		italicBtn?.classList.toggle(
			'formattingPopup__button--active',
			this.currentFormatting.italic,
		);
		underlineBtn?.classList.toggle(
			'formattingPopup__button--active',
			this.currentFormatting.underline,
		);
	}

	private startSelectionCheck(): void {
		this.checkSelectionInterval = window.setInterval(() => {
			if (!isSelectionValid(this.editor)) {
				this.close();
			}
		}, 500);
	}

	private stopSelectionCheck(): void {
		if (this.checkSelectionInterval) {
			clearInterval(this.checkSelectionInterval);
			this.checkSelectionInterval = null;
		}
	}

	destroy(): void {
		this.close();
	}
}
