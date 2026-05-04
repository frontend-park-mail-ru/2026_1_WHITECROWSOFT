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
	_pendingQuery: null as Record<string, string> | null,

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

		this.handleRoute(window.location.pathname + window.location.search);
	},

	push(path: string): void {
		const pathWithoutQuery = path.split('?')[0];
		if (pathWithoutQuery === this._currentPath) return;
		history.pushState({ path: pathWithoutQuery }, '', path);
		this.handleRoute(path);
	},

	replace(path: string): void {
		const pathWithoutQuery = path.split('?')[0];
		if (pathWithoutQuery === this._currentPath) return;
		history.replaceState({ path: pathWithoutQuery }, '', path);
		this.handleRoute(path);
	},

	getQueryParams(path: string): Record<string, string> {
		const query: Record<string, string> = {};
		const queryString = path.split('?')[1];
		if (queryString) {
			const pairs = queryString.split('&');
			for (const pair of pairs) {
				const [key, value] = pair.split('=');
				if (key) {
					query[decodeURIComponent(key)] = value
						? decodeURIComponent(value)
						: '';
				}
			}
		}
		return query;
	},

	async handleRoute(fullPath: string): Promise<void> {
		const pathWithoutQuery = fullPath.split('?')[0];
		const queryParams = this.getQueryParams(fullPath);

		this._currentPath = pathWithoutQuery;
		this._pendingQuery = queryParams;

		const route = getRoute(pathWithoutQuery);
		if (!route) return;

		if (route.redirect) {
			if (route.redirect !== pathWithoutQuery) {
				this.replace(route.redirect);
			}
			return;
		}

		if (route.layout === 'auth') {
			if (this._currentLayout) {
				this._currentLayout.destroy();
				this._currentLayout = null;
			}

			const app = document.querySelector('#app');
			if (app) {
				app.innerHTML = '';
			}

			try {
				const modulePath = `../pages/${route.component}.ts`;
				const moduleLoader = modules[modulePath];

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
				if (pathWithoutQuery !== '*') {
					this.replace('*');
				}
			}
			return;
		}

		let session: UserSession;
		try {
			session = await authService.getUserSession();
		} catch (err) {
			console.error('Failed to get user session:', err);
			session = { isAuthenticated: false, user: null };
		}

		if (route.protected && !session.isAuthenticated) {
			const redirectUrl = `/signin?redirect=${encodeURIComponent(fullPath)}`;
			this.replace(redirectUrl);
			return;
		}

		if (route.guest && session.isAuthenticated) {
			this.replace('/');
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
					}

					await this._currentLayout.setPage(initFn, {
						query: this._pendingQuery,
					});
				}
			} else {
				throw new Error(`Module not found for ${route.component}`);
			}
		} catch (err) {
			console.warn('Error handling main route:', err);
			if (pathWithoutQuery !== '*' && pathWithoutQuery !== '/signin') {
				this.replace('*');
			}
		}
	},
};
