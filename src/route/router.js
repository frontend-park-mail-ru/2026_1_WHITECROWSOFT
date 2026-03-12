import { authService } from '../services/authService.js';
import { getRoute } from './routes.js';
const modules = import.meta.glob('../pages/**/*.js');

/**
 * Роутер для навигации между страницами
 * @namespace router
 * @property {string} _currentPath - текущий путь
 * @property {object|null} _sessionCache - кэш сессии пользователя
 * @property {number} _sessionCacheTime - время последней проверки сессии
 * @property {number} _SESSION_CACHE_MS - время жизни кэша (5000 мс)
*/
export const router = {
    _currentPath: null,
    _sessionCache: null,
    _sessionCacheTime: 0,
    _SESSION_CACHE_MS: 5000,

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

        const accessCheck = await this.checkAuth(route);
        if (!accessCheck.allowed) {
            if (accessCheck.redirectTo && accessCheck.redirectTo !== path) {
                this.replace(accessCheck.redirectTo);
            }
            return;
        }

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
            console.error('[Router] Failed to load module:', err);
            if (path !== '*' && path !== '/signin') {
                this.replace('*');
            }
        }
    },

    /**
     * Проверяет доступ к маршруту на основе сессии
     * @async
     * @param {object} route - объект маршрута
     * @returns {Promise<object>} результат проверки доступа
    */
    async checkAuth(route) {
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
     * @param {object} route - объект маршрута
     * @param {object} session - объект сессии { isAuthenticated, user, error }
     * @returns {object} результат проверки { allowed, redirectTo }
    */
    _checkAuthLogic(route, session) {
        const isAuthenticated = session.isAuthenticated;
        const error = session.error;
        
        if (error?.onSamePage) {
            return {
                allowed: true,
                redirectTo: ''
            }
        }
        if (error?.type === 'AUTH') {
            return {
                allowed: false,
                redirect: error.redirectTo || '/signin'
                
            }
        }
        if (route.protected && !isAuthenticated) {
            return { 
                allowed: false, 
                redirectTo: session.error?.redirectTo || '/signin' 
            };
        }
        if (route.guest && isAuthenticated) {
            return { 
                allowed: false, 
                redirectTo: '/' 
            };
        }
        return { 
            allowed: true, 
            redirectTo: '' 
        };
    },

    /**
     * Очищает кэш сессии
     * @returns {void}
    */
    clearSessionCache() {
        this._sessionCache = null;
        this._sessionCacheTime = 0;
    },
};