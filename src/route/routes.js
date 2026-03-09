export const routes = [
	{
		path: '/signin',
		component: 'signin/signinPage',
		init: 'initSigninPage',
		guest: true,
	},
	{
		path: '/signup',
		component: 'signup/signupPage',
		init: 'initSignupPage',
		guest: true,
	},
	{
		path: '/',
		component: 'main/mainPage',
		init: 'initMainPage',
		protected: true,
	},
	{
		path: '*',
		component: 'not-found/notFoundPage',
		init: 'initNotFoundPage',
	},
];

export function getRoute(path) {
	return (
		routes.find((r) => r.path === path) || routes.find((r) => r.path === '*')
	);
}
