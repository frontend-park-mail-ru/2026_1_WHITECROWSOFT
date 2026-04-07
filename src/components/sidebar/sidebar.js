import Handlebars from 'handlebars';
import { bindNavigationEvents, updateActiveNote, startInlineEdit } from './sidebarEvents.js';
import { NotePopup } from '../popups/notePopup/notePopup.js';
import { render } from '../../utils/utils.js';
import './sidebar.css';
import templateText from './sidebar.hbs?raw';
import { store } from '../../store.js';
import { noteService } from '../../services/noteService.js';

/**
 * Класс для боковой панели приложения
 * @class SideBar
 * @classdesc Управляет отображением и взаимодействием с боковой панелью,
 * содержит список заметок, инструменты и кнопку выхода
 */
export class Sidebar {
	/**
	 * Создаёт экземпляр боковой панели
	 * @param {string} containerSelector - ID элемнта контейнера
	 * @param {Object} initialState - начальное состояние панели
	 * @param {Function} onNoteClick - функция, вызываемая при нажатии на заметку
	 */
	constructor(containerSelector) {
		this.container = document.getElementById(containerSelector);
		this.template = null;
		this.currentPopup = null;
		this.state = store.getState();
	}

	/**
	 * Инициализирует боковую панель
	 * @async
	 * @throws {Error} Если не удалось загрузить шаблон
	 */
	async init() {
		this.template = Handlebars.compile(templateText);
		render(this.container, this.template(this.state));
		this._bindEvents();
	}

	/**
	 * Навешивает обработчики событий на элементы панели
	 * @private
	 * @listens click#logoutBtn - Клик по кнопке выхода
	 * @listens click#[data-note-id] - Клик по элементу заметки
	 */
	_bindEvents() {
		bindNavigationEvents(this.container, (noteId) => {
			noteService.getNote(noteId)
		});

		const addBlockBtn = this.container.querySelector('#addBlockBtn');
		if (addBlockBtn) {
			addBlockBtn.addEventListener('click', async () => {
				const activeNoteId = store.getActiveNoteId();
				if (activeNoteId) {
					await noteService.createBlock(activeNoteId, { type: 'text', content: '' });
				}
			});
		}

		this.container.addEventListener('sidebar:openPopup', (e) => {
            const { noteId, anchor } = e.detail;
            this._openNotePopup(noteId, anchor);
        });

		this.container.addEventListener('sidebar:noteChanged', () => {
            this.currentPopup?.close();
        });

		store.subscribe('notes', (notes) => {
			this._updateNotes(notes);
		});

		store.subscribe('activeNoteId', (noteId) => {
			this._setActiveNote(noteId);
		});

		store.subscribe('user', (user) => {
			this._updateUser(user);
		});

		document.addEventListener('sidebar:startInlineEdit', (e) => {
			const { noteId } = e.detail;
			this._startInlineEdit(noteId);
		});
	}

	_openNotePopup(noteId, anchorElement) {
		this.currentPopup?.close();
		this.currentPopup = new NotePopup(noteId, anchorElement);
		this.currentPopup.open();

		this.container.dispatchEvent(new CustomEvent('sidebar:popupOpened', {
            detail: { 
                noteId, 
                popupElement: this.currentPopup.getElement() 
            }
        }));
	}

	_setActiveNote(noteId) {
		this.state.activeNoteId = noteId;
		updateActiveNote(this.container, noteId);
		const addBlockBtn = this.container.querySelector('#addBlockBtn');
		if (addBlockBtn) {
			addBlockBtn.disabled = !noteId;
		}
		this.container.dispatchEvent(new CustomEvent('sidebar:noteChanged'))
	}

	_updateNotes(notes) {
		this.state.notes = notes;
		const notesList = this.container.querySelector('.notesList');
		if (notesList) {
			const notesTemplateString = `
				{{#each notes}}
					<div class="noteItem {{#if (eq this.ID ../activeNoteId)}}active{{/if}}" data-note-id="{{this.ID}}">
						<img src="/icons/{{this.icon}}.svg" class="icon" />
						<div class="noteItemTitle">{{this.title}}</div>
						<div class="noteItemActions">
							<button class="noteActionBtn addSubnoteBtn" data-action="addSubnote" data-note-id="{{this.ID}}">
								<img src="/icons/add.svg" class="icon" />
							</button>
							<button class="noteActionBtn settingsBtn" data-action="settings" data-note-id="{{this.ID}}">
								<img src="/icons/more.svg" class="icon" />
							</button>
						</div>
					</div>
				{{else}}
					<div class="emptyNotes">
						<p>У вас пока нет заметок</p>
					</div>
				{{/each}}
			`;
			const notesTemplate = Handlebars.compile(notesTemplateString);
			notesList.innerHTML = notesTemplate(this.state);
		}
	}

	_updateUser(user) {
		this.state.user = user;
		const usernameSpan = document.getElementById('profile-username');
		if (usernameSpan && user) {
			usernameSpan.textContent = user.username || 'Пользователь';
		}
	}

	_startInlineEdit(noteId) {
		const noteItem = this.container.querySelector(`.noteItem[data-note-id="${noteId}"]`);
		if (noteItem) {
			const noteItemTitle = noteItem.querySelector('.noteItemTitle');
			if (noteItemTitle) {
				startInlineEdit(noteItemTitle, noteId);
			}
		}
	}

	closePopup() {
        this.currentPopup?.close();
    }

    destroy() {
        this.currentPopup?.close();
    }	
}
