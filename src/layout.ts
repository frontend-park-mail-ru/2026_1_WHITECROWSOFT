// @ts-ignore
import { Sidebar } from "./components/sidebar/sidebar.js";
import { store } from "./store.js";
import Handlebars from 'handlebars';
import layoutTemplate from './layout.hbs?raw';
import type { Note, User } from './types.js';

type PageModule = (container: HTMLElement, data?: unknown) => void | Promise<void>;

export class Layout {
	private sidebar: Sidebar | null = null;
	private mainContainer: HTMLElement | null = null;
	private _unsubscribeNotes: (() => void) | null = null;
	private _unsubscribeActiveNoteId: (() => void) | null = null;
	private _unsubscribeUser: (() => void) | null = null;

	constructor() {}

	/**
	 * Инициализирует лейаут
	 */
	async init(): Promise<void> {
		this._render();
		this.sidebar = new Sidebar('sidebarContainer');
		await this.sidebar.init();
		this._subscribeToStore();
	}

	/**
	 * Уничтожает лейаут и очищает подписки
	 */
	destroy(): void {
		this._unsubscribeNotes?.();
		this._unsubscribeActiveNoteId?.();
		this._unsubscribeUser?.();
		
		if (this.sidebar && typeof (this.sidebar as any).destroy === 'function') {
			(this.sidebar as any).destroy();
		}
		
		this.sidebar = null;
		this.mainContainer = null;
	}

	/**
	 * Рендерит основной шаблон лейаута
	 */
	private _render(): void {
		const app = document.querySelector('#app');
		if (!app) return;
		const template = Handlebars.compile(layoutTemplate);
		app.innerHTML = template({});
		this.mainContainer = document.getElementById('mainContainer');
	}

	/**
	 * Подписывается на изменения в хранилище
	 */
	private _subscribeToStore(): void {
		// Отписываемся от старых подписок, если они есть
		this._unsubscribeNotes?.();
		this._unsubscribeActiveNoteId?.();
		this._unsubscribeUser?.();

		this._unsubscribeNotes = store.subscribe('notes', (notes: Note[]) => {
			if (this.sidebar && typeof this.sidebar._updateNotes === 'function') {
				this.sidebar._updateNotes(notes);
			}
		});

		this._unsubscribeActiveNoteId = store.subscribe('activeNoteId', (noteId: string | number | null) => {
			if (this.sidebar && typeof this.sidebar._setActiveNote === 'function') {
				this.sidebar._setActiveNote(noteId);
			}
		});

		this._unsubscribeUser = store.subscribe('user', (user: User | null) => {
			if (this.sidebar && typeof this.sidebar._updateUser === 'function') {
				this.sidebar._updateUser(user);
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
