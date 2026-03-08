export const routes = [
	{
		path: '/signin',
		component: '/pages/signin/signinPage.js',
		init: 'initSigninPage',
		guest: true,
	},
	{
		path: '/signup',
		component: '/pages/signup/signupPage.js',
		init: 'initSignupPage',
		guest: true,
	},
	{
		path: '/',
		component: '/pages/main/mainPage.js',
		init: 'initMainPage',
		protected: true,
	},
	{
		path: '*',
		component: '/pages/not-found/notFoundPage.js',
		init: 'initNotFoundPage',
	},
];

export function getRoute(path) {
	return (
		routes.find((r) => r.path === path) || routes.find((r) => r.path === '*')
	);
}
