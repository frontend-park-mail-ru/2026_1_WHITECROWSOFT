import { authService } from '../services/authService.js';
import type { UserSession } from '../types.js';
import { Layout } from './../layout.js';
import { getRoute } from './routes.js';

const modules = import.meta.glob<{ default?: unknown; [key: string]: unknown }>(
	'../pages/**/*.{ts,js}',
);

export const router = {
	_currentPath: null as string | null,
	_currentLayout: null as Layout | null,
	_sessionCache: null as UserSession | null,
	_sessionCacheTime: 0 as number,
	_SESSION_CACHE_MS: (60 * 60 * 1000) as number,
	_isRedirecting: false as boolean,

	init(): void {
		window.addEventListener('popstate', (e: PopStateEvent) => {
			this.handleRoute(e.state?.path || window.location.pathname);
		});

		document.addEventListener('click', (e: MouseEvent) => {
			const link = (e.target as HTMLElement).closest(
				'a[href]',
			) as HTMLAnchorElement | null;
			if (!link) return;

			const href = link.getAttribute('href');
			if (!href) return;

			if (
				href.startsWith('http') ||
				href.startsWith('#') ||
				href.startsWith('mailto:') ||
				link.hasAttribute('download') ||
				link.getAttribute('target') === '_blank'
			) {
				return;
			}

			if (href === window.location.pathname) {
				e.preventDefault();
				return;
			}

			if (href.startsWith('/')) {
				e.preventDefault();
				this.push(href);
			}
		});

		this.handleRoute(window.location.pathname);
	},

	push(path: string): void {
		if (path === this._currentPath) return;
		history.pushState({ path }, '', path);
		this.handleRoute(path);
	},

	replace(path: string): void {
		if (path === this._currentPath) return;
		history.replaceState({ path }, '', path);
		this.handleRoute(path);
	},

	updateSessionCache(session: UserSession): void {
		console.log('[Router] Updating session cache:', session);
		this._sessionCache = session;
		this._sessionCacheTime = Date.now();
		this._isRedirecting = false;
	},

	clearSessionCache(): void {
		console.log('[Router] Clearing session cache');
		this._sessionCache = null;
		this._sessionCacheTime = 0;
		this._isRedirecting = false;
	},

	async handleRoute(path: string): Promise<void> {
		if (this._isRedirecting) return;

		this._currentPath = path;

		const route = getRoute(path);
		if (!route) return;

		if (route.redirect) {
			if (route.redirect !== path) {
				this._isRedirecting = true;
				this.replace(route.redirect);
				this._isRedirecting = false;
			}
			return;
		}

		if (route.layout === 'auth') {
			if (this._currentLayout) {
				this._currentLayout.destroy();
				this._currentLayout = null;
				(window as any).appLayout = null;
			}

			const app = document.querySelector('#app');
			if (app) {
				app.innerHTML = '';
			}

			try {
				let modulePath = `../pages/${route.component}.ts`;
				let moduleLoader = modules[modulePath];

				if (!moduleLoader) {
					modulePath = `../pages/${route.component}.js`;
					moduleLoader = modules[modulePath];
				}

				if (moduleLoader) {
					const module = await moduleLoader();
					const initFn = module[route.init] as
						| ((data?: unknown) => void | Promise<void>)
						| undefined;
					if (typeof initFn === 'function') {
						await initFn();
					}
				}
			} catch (err) {
				console.warn('Error handling auth route:', err);
				if (path !== '*') {
					this.replace('*');
				}
			}
			return;
		}

		let session = this._sessionCache;

		const now = Date.now();
		if (!session || now - this._sessionCacheTime >= this._SESSION_CACHE_MS) {
			try {
				session = await authService.getUserSession();
				this._sessionCache = session;
				this._sessionCacheTime = now;
			} catch (error) {
				console.error('Failed to get user session:', error);
				session = { isAuthenticated: false, user: null };
			}
		}

		if (route.protected && !session.isAuthenticated) {
			this._isRedirecting = true;
			this.replace('/signin');
			this._isRedirecting = false;
			return;
		}

		if (route.guest && session.isAuthenticated) {
			this._isRedirecting = true;
			this.replace('/');
			this._isRedirecting = false;
			return;
		}

		try {
			let modulePath = `../pages/${route.component}.ts`;
			let moduleLoader = modules[modulePath];

			if (!moduleLoader) {
				modulePath = `../pages/${route.component}.js`;
				moduleLoader = modules[modulePath];
			}

			if (moduleLoader) {
				const module = await moduleLoader();
				const initFn = module[route.init] as
					| ((data?: unknown) => void | Promise<void>)
					| undefined;

				if (typeof initFn === 'function') {
					if (!this._currentLayout) {
						this._currentLayout = new Layout();
						await this._currentLayout.init(false);
						(window as any).appLayout = this._currentLayout;
					}

					await this._currentLayout.setPage(initFn, route.data);
				}
			} else {
				throw new Error(`Module not found for ${route.component}`);
			}
		} catch (err) {
			console.warn('Error handling main route:', err);
			if (path !== '*' && path !== '/signin') {
				this.replace('*');
			}
		}
	},
};
