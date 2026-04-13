import { db } from '../db.js';
import { authService } from '../services/authService.js';
import { store } from '../store.js';
import type { User, UserSession } from '../types.js';
import { Layout } from './../layout.js';
import { getRoute, Route } from './routes.js';

const modules = import.meta.glob<{ default?: unknown; [key: string]: unknown }>(
	'../pages/**/*.{ts,js}',
);

/**
 * Роутер для навигации между страницами
 */
export const router = {
	_currentPath: null as string | null,
	_currentLayout: null as Layout | null,
	_sessionCache: null as UserSession | null,
	_sessionCacheTime: 0 as number,
	_SESSION_CACHE_MS: (60 * 60 * 1000) as number,

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

	/**
	 * Быстрая проверка авторизации без запроса к серверу
	 */
	async isAuthenticatedFast(): Promise<boolean> {
		const cachedUser = store.getUser() || (await db.settingsGet<User>('user'));
		return !!cachedUser;
	},

	async handleRoute(path: string): Promise<void> {
		if (path === this._currentPath) {
			return;
		}
		this._currentPath = path;

		const route = getRoute(path);
		if (!route) return;

		if (route.redirect) {
			if (route.redirect !== path) {
				this.replace(route.redirect);
			}
			return;
		}

		if (route.layout === 'auth') {
			const isAuth = await this.isAuthenticatedFast();
			if (isAuth) {
				this.replace('/');
				return;
			}

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

		const access = await this.checkAuth(route);
		if (!access.allowed) {
			if (access.redirectTo && access.redirectTo !== path) {
				this.replace(access.redirectTo);
			}
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

	async checkAuth(
		route: Route,
	): Promise<{ allowed: boolean; redirectTo: string }> {
		if (route.guest) {
			const isAuth = await this.isAuthenticatedFast();
			if (isAuth) {
				return {
					allowed: false,
					redirectTo: '/',
				};
			}
			return {
				allowed: true,
				redirectTo: '',
			};
		}

		const now = Date.now();

		if (
			this._sessionCache !== null &&
			now - this._sessionCacheTime < this._SESSION_CACHE_MS
		) {
			return this._checkAuthLogic(route, this._sessionCache);
		}

		let session: UserSession;
		try {
			session = await authService.getUserSession();
		} catch (error) {
			console.error('Failed to get user session:', error);
			session = {
				isAuthenticated: false,
				user: null,
			};
		}
		this._sessionCache = session;
		this._sessionCacheTime = Date.now();
		return this._checkAuthLogic(route, session);
	},

	_checkAuthLogic(
		route: Route,
		session: UserSession,
	): { allowed: boolean; redirectTo: string } {
		const { isAuthenticated, requiresRedirect } = session;

		if (requiresRedirect) {
			return {
				allowed: false,
				redirectTo: '/signin',
			};
		}

		if (route.protected && !isAuthenticated) {
			return {
				allowed: false,
				redirectTo: (session as any).error?.redirectTo || '/signin',
			};
		}

		if (route.guest && isAuthenticated) {
			return {
				allowed: false,
				redirectTo: '/',
			};
		}

		return {
			allowed: true,
			redirectTo: '',
		};
	},

	clearSessionCache(): void {
		this._sessionCache = null;
		this._sessionCacheTime = 0;
	},
};
