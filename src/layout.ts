import Handlebars from 'handlebars';
import authLayoutTemplate from './authLayout.hbs?raw';
import Sidebar from './components/sidebar/sidebar.js';
import layoutTemplate from './layout.hbs?raw';

type PageModule = (
	container: HTMLElement,
	data?: unknown,
) => void | Promise<void>;

export class Layout {
	private sidebar: Sidebar | null = null;
	private mainContainer: HTMLElement | null = null;
	private sidebarContainer: HTMLElement | null = null;
	private layoutContainer: HTMLElement | null = null;
	private sidebarToggle: HTMLElement | null = null;
	private _unsubscribeNotes: (() => void) | null = null;
	private _unsubscribeActiveNoteId: (() => void) | null = null;
	private _unsubscribeUser: (() => void) | null = null;
	private _isAuthMode: boolean = false;

	async init(isAuthMode: boolean = false): Promise<void> {
		this._isAuthMode = isAuthMode;

		if (isAuthMode) {
			this._renderAuth();
		} else {
			this._render();
			await this._initSidebar();
		}

		this.mainContainer = document.getElementById('mainContainer');
	}

	private _render(): void {
		const app = document.querySelector('#app');
		if (!app) return;
		const template = Handlebars.compile(layoutTemplate);
		app.innerHTML = template({});
		this.sidebarContainer = document.getElementById('sidebarContainer');
		this.mainContainer = document.getElementById('mainContainer');
		this.layoutContainer = document.getElementById('appLayout');
		this.sidebarToggle = document.getElementById('sidebarToggle');
	}

	private _renderAuth(): void {
		const app = document.querySelector('#app');
		if (!app) return;
		const template = Handlebars.compile(authLayoutTemplate);
		app.innerHTML = template({});
		this.mainContainer = document.getElementById('mainContainer');
	}

	private async _initSidebar(): Promise<void> {
		if (!this.sidebarContainer) return;
		this.sidebar = new Sidebar();
		this.sidebar.renderTo(this.sidebarContainer);
		this.sidebarContainer.style.display = 'block';
		await this._toggleSidebar();
		this.sidebarToggle?.addEventListener('click', async () => {
			await this._toggleSidebar();
		});
		this.sidebar.setSidebarToggle(async () => {
			await this._toggleSidebar();
		});
	}

	private async _toggleSidebar(): Promise<void> {
		if (!this.sidebarContainer) return;
		this.sidebarContainer.style.display =
			this.sidebarContainer.style.display === 'none' ? 'block' : 'none';
		if (this.layoutContainer) {
			this.layoutContainer.style.gridTemplateColumns =
				this.layoutContainer.style.gridTemplateColumns === '250px 1fr'
					? '0px 1fr'
					: '250px 1fr';
		}
		// if (this.sidebarToggle) {
		// 	this.sidebarToggle.style.display = this.sidebarToggle.style.display === 'none' ? 'block' : 'none';
		// }
	}

	destroy(): void {
		this._unsubscribeNotes?.();
		this._unsubscribeActiveNoteId?.();
		this._unsubscribeUser?.();

		if (this.sidebar) {
			this.sidebar.destroy();
		}

		this.sidebar = null;
		this.mainContainer = null;
		this.sidebarContainer = null;
		this._isAuthMode = false;
	}

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

	getSidebar(): Sidebar | null {
		return this.sidebar;
	}
}
