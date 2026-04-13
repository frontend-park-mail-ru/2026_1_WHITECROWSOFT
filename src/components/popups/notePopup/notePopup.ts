import Handlebars from "handlebars";
import { createElement, getElementPosition } from "../../../utils/utils.js";
import templateText from './notePopup.hbs?raw';
import { noteService } from '../../../services/noteService.js';
import '../../../assets/style/genericPopup.scss';

export class NotePopup {
    private noteId: string | number;
    private anchorElement: HTMLElement;
    private element: HTMLElement | null;
    private _onDocumentClick: ((e: MouseEvent) => void) | null;
    private _onEscape: ((e: KeyboardEvent) => void) | null;

    constructor(noteId: string | number, anchorElement: HTMLElement) {
        this.noteId = noteId;
        this.anchorElement = anchorElement;
        this.element = null;
        this._onDocumentClick = null;
        this._onEscape = null;
    }

    open(): void {
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

    close(): void {
        if (this.element) {
            this._unbindGlobalCloseHandlers();
            this.element.dispatchEvent(new CustomEvent('popup:closing'));
            this.element.remove();
            this.element = null;
        }
    }

    private _position(): void {
        if (!this.anchorElement || !this.element) return;
        
        const rect = getElementPosition(this.anchorElement);
        this.element.style.top = `${rect.bottom + window.scrollY + 5}px`;
        this.element.style.left = `${rect.left + window.scrollX}px`;
    }

    private _bindGlobalCloseHandlers(): void {
        this._onDocumentClick = (e: MouseEvent) => {
            if (!this.element?.contains(e.target as Node)) {
                this.close();
            }
        };
        this._onEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.close();
        };
        
        document.addEventListener('click', this._onDocumentClick);
        document.addEventListener('keydown', this._onEscape);
    }

    private _unbindGlobalCloseHandlers(): void {
        if (this._onDocumentClick) {
            document.removeEventListener('click', this._onDocumentClick);
        }
        if (this._onEscape) {
            document.removeEventListener('keydown', this._onEscape);
        }
        this._onDocumentClick = null;
        this._onEscape = null;
    }

    private _bindPopupEvents(): void {
        if (!this.element) return;
        
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

        const pinBtn = this.element.querySelector('[data-action="pin"]');
        if (pinBtn) {
            pinBtn.addEventListener('click', () => {
                console.log('Pin note:', this.noteId);
                this.close();
            });
        }
    }

    getElement(): HTMLElement | null {
        return this.element;
    }

    private _startInlineEdit(): void {
        document.dispatchEvent(new CustomEvent('sidebar:startInlineEdit', {
            detail: { noteId: this.noteId }
        }));
    }
}
