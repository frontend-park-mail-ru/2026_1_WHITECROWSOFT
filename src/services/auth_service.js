import { client } from '../http/client.js';

export const authService = {
	async signUp(data) {
		return client.post('/signup', data);
	},

	async signIn(data) {
		return client.post('/signin', data);
	},

	async logOut() {
		return client.post('/logout', {});
	},

	async checkAuth() {
		try {
			return await client.get('/protected');
		} catch {
			return null;
		}
	},
};
