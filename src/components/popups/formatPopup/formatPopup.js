import Handlebars from "handlebars";
import { createElement } from "../../../utils/utils.js";
import templateText from './formatPopup.hbs?raw';
import './formatPopup.scss';
import { noteService } from '../../../services/noteService.js';
import { store } from '../../../store.js';
import { getSelectionPositionsInElement, applyFormattingToRange } from '../../../utils/formattingUtils.js';

export class FormatPopup {
    constructor(range, editorElement) {
        this.range = range;
        this.editor = editorElement;
        this.element = null;
        this._onDocumentClick = null;
        this._onEscape = null;
        this._onWindowResize = null;
        this._onScroll = null;
        this.currentFormatting = null;
    }

    open() {
        this.close();
        const html = Handlebars.compile(templateText)({
            font: 'Inter', fontSize: '14', isBold: false, isItalic: false, isUnderline: false, isStrike: false
        });
        this.element = createElement('div', 'formattingPopup');
        this.element.innerHTML = html;
        document.body.appendChild(this.element);
        this._position();
        this._bindGlobalCloseHandlers();
        this._bindPopupEvents();
        this._detectCurrentFormatting();
        this.element.classList.add('formattingPopup--visible');
        
        this.element.addEventListener('mousedown', (e) => e.stopPropagation());
        this.element.addEventListener('click', (e) => e.stopPropagation());
        this._checkSelectionInterval = setInterval(() => {
            if (!this._isSelectionValid()) {
                this.close();
            }
        }, 500);
    }

    close() {
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

    _position() {
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
        
        left = Math.max(10, Math.min(left, window.innerWidth - popupRect.width - 10));
        
        this.element.style.top = `${top}px`;
        this.element.style.left = `${left}px`;
        this.element.style.visibility = 'visible';
    }

    _bindGlobalCloseHandlers() {
        this._onDocumentClick = (e) => {
            if (this.element?.contains(e.target)) return;
            if (this.editor?.contains(e.target)) {
                const selection = window.getSelection();
                if (selection && !selection.isCollapsed) {
                    return;
                }
            }
            this.close();
        };
        
        this._onEscape = (e) => { 
            if (e.key === 'Escape') this.close(); 
        };
        
        this._onWindowResize = () => this._position();
        this._onScroll = () => this._position();
        
        document.addEventListener('click', this._onDocumentClick, true);
        document.addEventListener('keydown', this._onEscape);
        window.addEventListener('resize', this._onWindowResize);
        window.addEventListener('scroll', this._onScroll, true);
    }

    _unbindGlobalCloseHandlers() {
        document.removeEventListener('click', this._onDocumentClick, true);
        document.removeEventListener('keydown', this._onEscape);
        window.removeEventListener('resize', this._onWindowResize);
        window.removeEventListener('scroll', this._onScroll, true);
        this._onDocumentClick = null;
        this._onEscape = null;
        this._onWindowResize = null;
        this._onScroll = null;
    }

    _bindPopupEvents() {
        if (!this.element) return;
        
        this.element.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            this._handleAction(btn.dataset.action);
        });
    }

    _restoreSelection() {
        if (!this.range) return;
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(this.range);
    }

    _getBlockFromRange() {
        if (!this.range) return null;
        const node = this.range.commonAncestorContainer;
        const el = node.nodeType === 1 ? node : node.parentElement;
        return el?.closest('.note__block') || null;
    }

    _detectCurrentFormatting() {
        if (!this.range) return;
        this._restoreSelection();
        
        this.currentFormatting = {
            bold: document.queryCommandState('bold'),
            italic: document.queryCommandState('italic'),
            underline: document.queryCommandState('underline')
        };
        
        this._updateActiveStates(this.currentFormatting);
    }

    _applyFormattingToDOM(element, start, end, formatting) {
        const selection = window.getSelection();
        const originalRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        
        applyFormattingToRange(element, start, end, {
            bold: formatting.bold,
            italic: formatting.italic,
            underline: formatting.underline
        });
        
        if (originalRange) {
            try {
                selection.removeAllRanges();
                selection.addRange(originalRange);
            } catch (e) {
                console.warn('Failed to restore selection:', e);
            }
        }
    }

    _handleAction(action) {
        if (!this.range) return;
        this._restoreSelection();
        const blockEl = this._getBlockFromRange();
        if (!blockEl?.dataset.blockId) return;
        const { start, end } = getSelectionPositionsInElement(blockEl, this.range);
        if (start >= end) return;
        const currentFmt = this.currentFormatting || {
            bold: false,
            italic: false,
            underline: false
        };
        let newFmt;
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
        this._applyFormattingToDOM(blockEl, start, end, newFmt);
        this.currentFormatting = newFmt;
        this._updateActiveStates(newFmt);
        const noteId = store.getActiveNoteId();
        if (noteId) {
            noteService.saveBlockFormatting(noteId, blockEl.dataset.blockId, start, end, newFmt)
                .catch(err => console.warn('[Popup] Save failed:', err));
        }
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            this.range = selection.getRangeAt(0).cloneRange();
        }
    }

    _updateActiveStates(formatting) {
        if (!this.element) return;
        const boldBtn = this.element.querySelector('[data-action="bold"]');
        const italicBtn = this.element.querySelector('[data-action="italic"]');
        const underlineBtn = this.element.querySelector('[data-action="underline"]');
        if (boldBtn) boldBtn.classList.toggle('formattingPopup__button--active', Boolean(formatting?.bold));
        if (italicBtn) italicBtn.classList.toggle('formattingPopup__button--active', Boolean(formatting?.italic));
        if (underlineBtn) underlineBtn.classList.toggle('formattingPopup__button--active', Boolean(formatting?.underline));
    }

    _isSelectionValid() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
            return false;
        }
        const currentRange = selection.getRangeAt(0);
        return this.editor?.contains(currentRange.commonAncestorContainer);
    }

    getElement() {
        return this.element;
    }
}