import Handlebars from "handlebars";
import { createElement, getElementPosition } from "../../../utils/utils.js";
import templateText from './notePopup.hbs?raw';
import { noteService } from '../../../services/noteService.js';
import '../../../assets/style/genericPopup.scss';

export class NotePopup {
    constructor(noteId, anchorElement) {
        this.noteId = noteId;
        this.anchorElement = anchorElement;
        this.element = null;
        this._onDocumentClick = null;
        this._onEscape = null;
    }

    open() {
        this.close();

        const html = Handlebars.compile(templateText)({ noteId: this.noteId });
        this.element = createElement('div', 'popup__wrapper');
        this.element.innerHTML = html;

        this._position();
        document.body.appendChild(this.element);

        this._bindGlobalCloseHandlers();
        this._bindPopupEvents();

        this.element.dispatchEvent(new CustomEvent('popup:opened', {
            detail: { noteId: this.noteId }
        }));
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
        if (!this.anchorElement || !this.element) return;
        
        const rect = getElementPosition(this.anchorElement);
        this.element.style.top = `${rect.bottom + window.scrollY + 5}px`;
        this.element.style.left = `${rect.left + window.scrollX}px`;
    }

    _bindGlobalCloseHandlers() {
        this._onDocumentClick = (e) => {
            if (!this.element?.contains(e.target)) {
                this.close();
            }
        };
        this._onEscape = (e) => {
            if (e.key === 'Escape') this.close();
        };
        
        document.addEventListener('click', this._onDocumentClick);
        document.addEventListener('keydown', this._onEscape);
    }

    _unbindGlobalCloseHandlers() {
        if (this._onDocumentClick) {
            document.removeEventListener('click', this._onDocumentClick);
        }
        if (this._onEscape) {
            document.removeEventListener('keydown', this._onEscape);
        }
        this._onDocumentClick = null;
        this._onEscape = null;
    }

    _bindPopupEvents() {
        const deleteBtn = this.element.querySelector('[data-action="delete"]');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                try {
                    await noteService.deleteNote(this.noteId);
                    this.close();
                } catch (error) {
                    console.error('Error deleting note:', error);
                    alert('Ошибка при удалении заметки');
                }
            });
        }

        const renameBtn = this.element.querySelector('[data-action="rename"]');
        if (renameBtn) {
            renameBtn.addEventListener('click', () => {
                this._startInlineEdit();
                this.close();
            });
        }

        // Для pinBtn можно добавить позже, если нужно
        const pinBtn = this.element.querySelector('[data-action="pin"]');
        if (pinBtn) {
            pinBtn.addEventListener('click', () => {
                // TODO: Implement pin functionality
                console.log('Pin note:', this.noteId);
                this.close();
            });
        }
    }

    getElement() {
        return this.element;
    }

    _startInlineEdit() {
        // Dispatch event to sidebar to start inline edit
        document.dispatchEvent(new CustomEvent('sidebar:startInlineEdit', {
            detail: { noteId: this.noteId }
        }));
    }
}