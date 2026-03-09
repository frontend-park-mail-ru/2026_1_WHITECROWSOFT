import Handlebars from 'handlebars';
import { router } from '../../route/router.js';
import { render } from '../../utils/utils.js';
import { authService } from '../../services/authService.js';
import './sidebar.css';

/**
 * Класс дял боковой панели приложения
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
	constructor(containerSelector, initialState = {}, onNoteClick) {
		this.container = document.getElementById(containerSelector);
		this.state = initialState;
		this.template = null;
		this.onNoteClick = onNoteClick;
	}

	/**
	 * Инициализирует боковую панель
	 * @async
	 * @throws {Error} Если не удалось загрузить шаблон
	*/
	async init() {
		const response = await fetch('/components/sidebar/sidebar.hbs');
		if (!response.ok) {
			throw new Error(`Failed to load template: ${response.status}`);
		}
		this.template = Handlebars.compile(await response.text());
		render(this.container, this.template);
		this.bindEvents();
	}

	/**
	 * Навешивает обработчики событий на элементы панели
	 * @private 
	 * @listens click#logoutBtn - Клик по кнопке выхода
	 * @listens click#[data-note-id] - Клик по элементу заметки 
	*/
	bindEvents() {
		const logoutBtn = document.getElementById('logoutBtn');
		if (logoutBtn) {
			logoutBtn.addEventListener('click', async () => {
				console.log('[MainPage] Logout clicked');
				try {
					await authService.logOut();
					console.log('[MainPage] signOut() completed');
					router.clearAuthCache();
					router.replace('/signin');
				} catch (err) {
					console.error('[MainPage] Logout error:', err);
					router.clearAuthCache();
					router.replace('/signin');
				}
			});
		}

		this.container.addEventListener('click', (e) => {
			const noteItem = e.target.closest('[data-note-id]');
			if (noteItem) {
				const noteId = noteItem.dataset.noteId;
				if (this.onNoteClick) {
					this.onNoteClick(noteId);
				}
			}
		});
	}
}
