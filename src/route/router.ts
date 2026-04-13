import { getRoute, Route } from './routes.js';
import { authService } from '../services/authService.js';
import { Layout } from './../layout.js';
import type { UserSession } from '../types.js';

const modules = import.meta.glob<{ default?: unknown; [key: string]: unknown }>('../pages/**/*.ts');

/**
 * Роутер для навигации между страницами
 */
export const router = {
	_currentPath: null as string | null,
	_currentLayout: null as Layout | null,
	_sessionCache: null as UserSession | null,
	_sessionCacheTime: 0 as number,
	_SESSION_CACHE_MS: 5000 as number,

	/**
	 * Инициализирует роутер
	 */
	init(): void {
		window.addEventListener('popstate', (e: PopStateEvent) => {
			this.handleRoute(e.state?.path || window.location.pathname);
		});

		document.addEventListener('click', (e: MouseEvent) => {
			const link = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
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

	/**
	 * Переводит на новый путь
	 * @param path - целевой путь
	 */
	push(path: string): void {
		if (path === this._currentPath) return;
		history.pushState({ path }, '', path);
		this.handleRoute(path);
	},

	/**
	 * Заменяет текущий путь
	 * @param path - целевой путь
	 */
	replace(path: string): void {
		if (path === this._currentPath) return;
		history.replaceState({ path }, '', path);
		this.handleRoute(path);
	},

	/**
	 * Обрабатывает маршрут и загружает соответствующую страницу
	 * @param path - путь для обработки
	 */
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

		const access = await this.checkAuth(route);
		if (!access.allowed) {
		    if (access.redirectTo && access.redirectTo !== path) {
		        this.replace(access.redirectTo);
		    }
		    return;
		}

		try {
			const modulePath = `../pages/${route.component}.ts`;
			const moduleLoader = modules[modulePath];

			if (moduleLoader) {
				const module = await moduleLoader();
				const initFn = module[route.init] as ((data?: unknown) => void | Promise<void>) | undefined;

				if (typeof initFn === 'function') {
					if (route.layout === 'auth') {
						if (this._currentLayout) {
							if (typeof this._currentLayout.destroy === 'function') {
								this._currentLayout.destroy();
							}
							this._currentLayout = null;
							(window as any).appLayout = null;
						}
						initFn();
					} else {
						if (!this._currentLayout) {
							this._currentLayout = new Layout();
							await this._currentLayout.init();
							(window as any).appLayout = this._currentLayout;
						}
						await (window as any).appLayout.setPage(initFn, route.data);
					}
				}
			} else {
				throw new Error(`Module not found at ${modulePath}`);
			}
		} catch (err) {
			console.warn('Error handling a route:', err);
			if (path !== '*' && path !== '/signin') {
				this.replace('*');
			}
		}
	},

	/**
	 * Проверяет доступ к маршруту на основе сессии
	 * @param route - объект маршрута
	 * @returns результат проверки доступа
	 */
	async checkAuth(route: Route): Promise<{ allowed: boolean; redirectTo: string }> {
		const now = Date.now();

		if (
			this._sessionCache !== null &&
			now - this._sessionCacheTime < this._SESSION_CACHE_MS
		) {
			return this._checkAuthLogic(route, this._sessionCache);
		}

		const session = await authService.getUserSession();
		this._sessionCache = session;
		this._sessionCacheTime = Date.now();
		return this._checkAuthLogic(route, session);
	},

	/**
	 * Оценивает доступ на основе сессии и типа маршрута
	 * @private
	 * @param route - объект маршрута
	 * @param session - объект сессии
	 * @returns результат проверки
	 */
	_checkAuthLogic(route: Route, session: UserSession): { allowed: boolean; redirectTo: string } {
		const { isAuthenticated, requiresRedirect } = session;

		if (requiresRedirect) {
			return {
				allowed: false,
				redirectTo: '/signin'
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

	/**
	 * Очищает кэш сессии
	 */
	clearSessionCache(): void {
		this._sessionCache = null;
		this._sessionCacheTime = 0;
	},
};
