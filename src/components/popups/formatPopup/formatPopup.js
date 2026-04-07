import Handlebars from "handlebars";
import { createElement } from "../../../utils/utils.js";
import templateText from './formatPopup.hbs?raw';
import './formatPopup.css';
import { noteService } from '../../../services/noteService.js';
import { store } from '../../../store.js';
import { collectFormattingFromElement, applyFormattingToElement } from '../../../utils/formattingUtils.js';

export class FormatPopup {
    constructor(range, editorElement) {
        this.range = range;
        this.editor = editorElement;
        this.element = null;
        this._onDocumentClick = null;
        this._onEscape = null;
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
        this._updateActiveStates();
        this.element.classList.add('visible');
        this.element.dispatchEvent(new CustomEvent('popup:opened'));
    }

    close() {
        if (this.element) {
            this._unbindGlobalCloseHandlers();
            this.element.dispatchEvent(new CustomEvent('popup:closing'));
            this.element.remove();
            this.element = null;
        }
    }

    _position() {
        if (!this.range || !this.element) return;
        this.element.style.visibility = 'hidden';
        this.element.style.display = 'flex';
        void this.element.offsetHeight;
        const rect = this.range.getBoundingClientRect();
        const popupRect = this.element.getBoundingClientRect();
        let top = rect.top - popupRect.height - 10;
        let left = rect.left + rect.width / 2;
        const padding = 10;
        left = Math.max(popupRect.width / 2 + padding, Math.min(left, window.innerWidth - popupRect.width / 2 - padding));
        top = Math.max(padding, top);
        this.element.style.top = `${top}px`;
        this.element.style.left = `${left}px`;
        this.element.style.visibility = 'visible';
    }

    _bindGlobalCloseHandlers() {
        this._onDocumentClick = (e) => {
            if (this.element?.contains(e.target) || this.editor?.contains(e.target)) return;
            this.close();
        };
        this._onEscape = (e) => { if (e.key === 'Escape') this.close(); };
        document.addEventListener('click', this._onDocumentClick, true);
        document.addEventListener('keydown', this._onEscape);
    }

    _unbindGlobalCloseHandlers() {
        document.removeEventListener('click', this._onDocumentClick, true);
        document.removeEventListener('keydown', this._onEscape);
        this._onDocumentClick = null;
        this._onEscape = null;
    }

    _bindPopupEvents() {
        if (!this.element) return;
        this.element.addEventListener('mousedown', (e) => {
            if (e.target.closest('button') || e.target.closest('input')) e.preventDefault();
        });
        this.element.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
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
        return el?.closest('.block') || null;
    }

    _handleAction(action) {
        if (!this.range) return;
        this._restoreSelection();
        const blockEl = this._getBlockFromRange();
        if (!blockEl?.dataset.blockId) return;

        const blockId = blockEl.dataset.blockId;
        const noteId = store.getActiveNoteId();
        if (!noteId) return;

        const currentFmt = collectFormattingFromElement(blockEl);

        switch (action) {
            case 'bold': currentFmt.bold = !currentFmt.bold; break;
            case 'italic': currentFmt.italic = !currentFmt.italic; break;
            case 'underline': currentFmt.underline = !currentFmt.underline; break;
            default: return;
        }

        applyFormattingToElement(blockEl, currentFmt);
        noteService.saveBlockFormatting(noteId, blockId, currentFmt);
        this._updateActiveStates(currentFmt);
    }

    _updateActiveStates(fmt = null) {
        // if (!this.element) return;
        // const blockEl = this._getBlockFromRange();
        // const targetFmt = fmt || (blockEl ? collectFormattingFromElement(blockEl) : {});
        // this.element.querySelector('[data-action="bold"]')?.classList.toggle('active', Boolean(targetFmt.bold));
        // this.element.querySelector('[data-action="italic"]')?.classList.toggle('active', Boolean(targetFmt.italic));
        // this.element.querySelector('[data-action="underline"]')?.classList.toggle('active', Boolean(targetFmt.underline));
    }

    getElement() {
        return this.element;
    }
}