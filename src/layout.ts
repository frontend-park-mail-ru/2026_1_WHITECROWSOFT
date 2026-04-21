import Handlebars from 'handlebars';
import authLayoutTemplate from './authLayout.hbs?raw';
import { Sidebar } from './components/sidebar/sidebar.js';
import layoutTemplate from './layout.hbs?raw';
import { store } from './store.js';
import type { Note, User } from './types.js';

type PageModule = (
	container: HTMLElement,
	data?: unknown,
) => void | Promise<void>;

export class Layout {
	private sidebar: Sidebar | null = null;
	private mainContainer: HTMLElement | null = null;
	private _unsubscribeNotes: (() => void) | null = null;
	private _unsubscribeActiveNoteId: (() => void) | null = null;
	private _unsubscribeUser: (() => void) | null = null;
	private _isAuthMode: boolean = false;
	private _isSidebarInitialized: boolean = false;

	constructor() {}

	/**
	 * Инициализирует лейаут
	 * @param isAuthMode - режим авторизации (без сайдбара)
	 */
	async init(isAuthMode: boolean = false): Promise<void> {
		this._isAuthMode = isAuthMode;

		if (isAuthMode) {
			this._renderAuth();
		} else {
			this._render();
			this.sidebar = new Sidebar('sidebarContainer');
			await this.sidebar.init();
			this._isSidebarInitialized = true;
			this._subscribeToStore();
		}

		this.mainContainer = document.getElementById('mainContainer');
	}

	/**
	 * Рендерит основной шаблон лейаута с сайдбаром
	 */
	private _render(): void {
		const app = document.querySelector('#app');
		if (!app) return;
		const template = Handlebars.compile(layoutTemplate);
		app.innerHTML = template({});
		this.mainContainer = document.getElementById('mainContainer');
	}

	/**
	 * Рендерит упрощенный шаблон лейаута без сайдбара
	 */
	private _renderAuth(): void {
		const app = document.querySelector('#app');
		if (!app) return;
		const template = Handlebars.compile(authLayoutTemplate);
		app.innerHTML = template({});
		this.mainContainer = document.getElementById('mainContainer');
	}

	/**
	 * Уничтожает лейаут и очищает подписки
	 */
	destroy(): void {
		this._unsubscribeNotes?.();
		this._unsubscribeActiveNoteId?.();
		this._unsubscribeUser?.();

		if (this.sidebar) {
			this.sidebar.destroy();
		}

		this.sidebar = null;
		this.mainContainer = null;
		this._isSidebarInitialized = false;
	}

	/**
	 * Подписывается на изменения в хранилище
	 */
	private _subscribeToStore(): void {
		this._unsubscribeNotes?.();
		this._unsubscribeActiveNoteId?.();
		this._unsubscribeUser?.();

		this._unsubscribeNotes = store.subscribe('notes', (notes: Note[]) => {
			if (this.sidebar && typeof this.sidebar.updateNotes === 'function') {
				this.sidebar.updateNotes(notes);
			}
		});

		this._unsubscribeActiveNoteId = store.subscribe(
			'activeNoteId',
			(noteId: string | number | null) => {
				if (this.sidebar && typeof this.sidebar.setActiveNote === 'function') {
					this.sidebar.setActiveNote(noteId);
				}
			},
		);

		this._unsubscribeUser = store.subscribe('user', (user: User | null) => {
			if (this.sidebar && typeof this.sidebar.updateUser === 'function') {
				this.sidebar.updateUser(user);
			}
		});
	}

	/**
	 * Устанавливает страницу в основной контейнер
	 * @param pageModule - функция инициализации страницы
	 * @param pageData - данные для страницы
	 */
	async setPage(pageModule: PageModule, pageData: unknown = {}): Promise<void> {
		try {
			if (!this.mainContainer) return;
			if (this._isAuthMode) {
				const sidebarContainer = document.getElementById('sidebarContainer');
				if (sidebarContainer) {
					sidebarContainer.style.display = 'none';
				}
				if (this.mainContainer) {
					this.mainContainer.style.width = '100%';
					this.mainContainer.style.maxWidth = '100%';
				}
			} else {
				const sidebarContainer = document.getElementById('sidebarContainer');
				if (sidebarContainer) {
					sidebarContainer.style.display = 'block';
				}
				if (this.mainContainer) {
					this.mainContainer.style.width = '';
					this.mainContainer.style.maxWidth = '';
				}
			}

			this.mainContainer.innerHTML = '';
			const page = document.createElement('div');
			page.className = 'note';
			this.mainContainer.appendChild(page);

			if (pageModule) {
				await pageModule(page, pageData);
			}
		} catch (error) {
			console.error('[Layout] error', error);
		}
	}

	/**
	 * Возвращает экземпляр сайдбара
	 */
	getSidebar(): Sidebar | null {
		return this.sidebar;
	}
}
