import { authService } from '../services/authService.js';
import { getRoute } from './routes.js';
const modules = import.meta.glob('../pages/**/*.js');


/**
 * Роутер для навигации между страницами
 * @namespace router
 * @property {string} _currentPath - текущий путь
 * @property {boolean|null} _authCache - кэш статуса авторизации
 * @property {number} _authCacheTime - время последней проверки авторизации
 * @property {number} _AUTH_CACHE_MS - время жизни кэша (5000 мс)
*/
export const router = {
	_currentPath: null,
	_authCache: null,
	_authCacheTime: 0,
	_AUTH_CACHE_MS: 5000,

	/**
	 * Инициализирует роутер
	 * @returns {void}
	*/
	init() {
		window.addEventListener('popstate', (e) => {
			this.handleRoute(e.state?.path || window.location.pathname);
		});

		document.addEventListener('click', (e) => {
			const link = e.target.closest('a[href]');
			if (!link) return;

			const href = link.getAttribute('href');

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
	 * @param {string} path - целевой путь
	 * @returns {void}
	*/
	push(path) {
		if (path === this._currentPath) return;
		history.pushState({ path }, '', path);
		this.handleRoute(path);
	},

	/**
	 * Заменяет текущий путь
	 * @param {string} path - целевой путь
	 * @returns {void}
	*/
	replace(path) {
		if (path === this._currentPath) return;
		history.replaceState({ path }, '', path);
		this.handleRoute(path);
	},

	/**
	 * Обрабатывает маршрут и загружает соответствующую страницу
	 * @async
	 * @param {string} path - путь для обработки
	 * @returns {Promise<void>}
	*/
	async handleRoute(path) {
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

		// const authCheck = await this.checkAuth(route);
		// if (!authCheck.allowed) {
		// 	if (authCheck.redirectTo !== path) {
		// 		this.replace(authCheck.redirectTo);
		// 	}
		// 	return;
		// }

		try {
			const path = `../pages/${route.component}.js`;
			const moduleLoader = modules[path];
			if (moduleLoader) {
				const module = await moduleLoader();
				const initFn = module[route.init];
				if (typeof initFn === 'function') {
					await initFn();
				}
			} else {
				throw new Error(`Module not found at ${path}`);
			}
		} catch (err) {
			console.log(err);
			if (path !== '*' && path !== '/signin') {
				this.replace('/signin');
			}
		}
	},

	// async checkAuth(route) {
	// 	const now = Date.now();

	// 	if (
	// 		this._authCache !== null &&
	// 		now - this._authCacheTime < this._AUTH_CACHE_MS
	// 	) {
	// 		return this._checkAuthLogic(route, this._authCache);
	// 	}

	// 	const isAuthenticated = await authService.checkAuth();
	// 	this._authCache = isAuthenticated;
	// 	this._authCacheTime = Date.now();

	// 	return this._checkAuthLogic(route, isAuthenticated);
	// },

	// _checkAuthLogic(route, isAuthenticated) {
	// 	if (route.protected && !isAuthenticated) {
	// 		return { allowed: false, redirectTo: '/signin' };
	// 	}
	// 	if (route.guest && isAuthenticated) {
	// 		return { allowed: false, redirectTo: '/' };
	// 	}
	// 	return { allowed: true, redirectTo: '' };
	// },

	/**
	 * Очищает кэш авторизации
	 * @returns {void}
	*/
	clearAuthCache() {
		this._authCache = null;
		this._authCacheTime = 0;
	},
};
