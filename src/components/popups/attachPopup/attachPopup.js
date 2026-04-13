import Handlebars from "handlebars";
import { createElement } from "../../../utils/utils.js";
import templateText from './attachPopup.hbs?raw';
import { attachmentService } from '../../../services/attachmentService.js';
import { noteService } from '../../../services/noteService.js';
import { store } from '../../../store.js';
import '../../../assets/style/genericPopup.scss';

export class AttachPopup {
    constructor(anchorElement) {
        this.anchorElement = anchorElement;
        this.element = null;
        this._onDocumentClick = null;
        this._onEscape = null;
        this.fileInput = null;
    }

    open() {
        this.close();

        const html = Handlebars.compile(templateText)({});
        this.element = createElement('div', 'popup__wrapper');
        this.element.innerHTML = html;

        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = 'image/*';
        this.fileInput.style.display = 'none';
        this.element.appendChild(this.fileInput);

        this._position();
        document.body.appendChild(this.element);

        this._bindGlobalCloseHandlers();
        this._bindPopupEvents();

        this.element.dispatchEvent(new CustomEvent('popup:opened'));
    }

    close() {
        if (this.element) {
            this._unbindGlobalCloseHandlers();
            this.element.dispatchEvent(new CustomEvent('popup:closing'));
            this.element.remove();
            this.element = null;
            this.fileInput = null;
        }
    }

    _position() {
        if (!this.anchorElement || !this.element) return;
        const rect = this.anchorElement.getBoundingClientRect();
        const popupRect = this.element.getBoundingClientRect();
        let top = rect.bottom + window.scrollY + 5;
        let left = rect.left + window.scrollX;
        if (left + popupRect.width > window.innerWidth) {
            left = window.innerWidth - popupRect.width - 10;
        }
        this.element.style.top = `${top}px`;
        this.element.style.left = `${left}px`;
    }

    _bindGlobalCloseHandlers() {
        this._onDocumentClick = (e) => {
            if (!this.element?.contains(e.target)) this.close();
        };
        this._onEscape = (e) => {
            if (e.key === 'Escape') this.close();
        };
        document.addEventListener('click', this._onDocumentClick);
        document.addEventListener('keydown', this._onEscape);
    }

    _unbindGlobalCloseHandlers() {
        if (this._onDocumentClick) document.removeEventListener('click', this._onDocumentClick);
        if (this._onEscape) document.removeEventListener('keydown', this._onEscape);
        this._onDocumentClick = null;
        this._onEscape = null;
    }

    _bindPopupEvents() {
        const textBtn = this.element.querySelector('[data-action="text"]');
        if (textBtn) {
            textBtn.addEventListener('click', async () => {
                const activeNoteId = store.getActiveNoteId();
                if (activeNoteId) {
                    await noteService.createBlock(activeNoteId, {
                        note_id: activeNoteId,
                        block_type_id: 1,
                        position: store.getActiveBlocks().length,
                        content: ''
                    });
                }
                this.close();
            });
        }

        const pictureBtn = this.element.querySelector('[data-action="picture"]');
        if (pictureBtn) {
            pictureBtn.addEventListener('click', () => {
                if (this.fileInput) this.fileInput.click();
            });
        }

        const tableBtn = this.element.querySelector('[data-action="table"]');
        if (tableBtn) {
            tableBtn.addEventListener('click', () => {
                console.log('Add table block');
                this.close();
            });
        }

        if (this.fileInput) {
            this.fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const activeNoteId = store.getActiveNoteId();
                if (!activeNoteId) {
                    alert('Нет активной заметки');
                    this.close();
                    return;
                }

                if (file.size > 10 * 1024 * 1024) {
                    alert('Файл слишком большой. Максимальный размер 10MB');
                    this.close();
                    return;
                }
                if (!file.type.startsWith('image/')) {
                    alert('Пожалуйста, выберите изображение');
                    this.close();
                    return;
                }

                try {
                    await attachmentService.createImageBlock(activeNoteId, file);
                } catch (error) {
                    console.error('[AttachPopup] Error:', error);
                    alert('Ошибка при загрузке изображения');
                }

                this.fileInput.value = '';
                this.close();
            });
        }
    }

    getElement() {
        return this.element;
    }
}