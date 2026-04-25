/**
 * Интерфейс маршрута
 */
export interface Route {
	path: string;
	component: string;
	init: string;
	guest?: boolean;
	protected?: boolean;
	layout: 'auth' | 'main';
	redirect?: string;
	data?: unknown;
}

/**
 * Массив маршрутов приложения
 */
export const routes: Route[] = [
	{
		path: '/signin',
		component: 'signin/signinPage',
		init: 'initSigninPage',
		guest: true,
		layout: 'auth',
	},
	{
		path: '/signup',
		component: 'signup/signupPage',
		init: 'initSignupPage',
		guest: true,
		layout: 'auth',
	},
	{
		path: '/profile',
		component: 'profile/profilePage',
		init: 'initProfilePage',
		protected: true,
		layout: 'main',
	},
	{
		path: '/',
		component: 'main/mainPage',
		init: 'initMainPage',
		protected: true,
		layout: 'main',
	},
	{
		path: '*',
		component: 'not-found/notFoundPage',
		init: 'initNotFoundPage',
		layout: 'auth',
	},
	{
        path: '/support-iframe.html',
        component: 'iframe/supportIframe',
        init: 'initSupportIframe',
        layout: 'auth',
    },
];

/**
 * Возвращает маршрут по пути
 * @param path - путь для поиска
 * @returns найденный маршрут или маршрут по умолчанию (*)
 */
export function getRoute(path: string): Route | undefined {
	return (
		routes.find((r) => r.path === path) || routes.find((r) => r.path === '*')
	);
}
