import { client } from '../client/client.js';
import { router } from '../route/router.js';

export const authService = {
	async signUp(data) {
		const result = client.post('/signup', data);
		router.clearAuthCache();
		return result;
	},

	async signIn(data) {
		const result = client.post('/signin', data);
		router.clearAuthCache();
		return result;
	},

	async logOut() {
		const result = client.post('/logout', {});
		router.clearAuthCache();
		return result;
	},

	async checkAuth() {
		try {
			const user = await client.get('/protected');
			return user;
		} catch (error) {
			if (error?.status === 401 || error?.message?.includes('401')) {
				console.debug('[Auth] User not authenticated (expected)');
				return null;
			}
			console.warn('[Auth] Check failed:', error);
			return null;
		}
	},
};
