/**
 * Массив маршрутов приложения
 * @type {Array<Object>}
 * @property {string} path - URL путь
 * @property {string} component - путь к компоненту страницы
 * @property {string} init - имя функции инициализации страницы
 * @property {boolean} [guest] - доступно только для неавторизованных
 * @property {boolean} [protected] - требует авторизации
 */
export const routes = [
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
];

/**
 * Возвращает маршрут по пути
 * @param {string} path - путь для поиска
 * @returns {Object} найденный маршрут или маршрут по умолчанию (*)
 */
export function getRoute(path) {
	return (
		routes.find((r) => r.path === path) || routes.find((r) => r.path === '*')
	);
}
