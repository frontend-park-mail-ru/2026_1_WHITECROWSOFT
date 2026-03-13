import { client } from '../client/client.js';
import { router } from '../route/router.js';

/**
 * Сервис для работы с авторизацией
 * @namespace authService
 */
export const authService = {
	/**
	 * Регистрирует нового пользователя
	 * @async
	 * @param {Object} data - данные для регистрации
	 * @returns {Promise<Object>} результат регистрации
	 */
	async signUp(data) {
		const result = client.post('/signup', data);
		router.clearSessionCache();
		return result;
	},

	/**
	 * Выполняет вход пользователя
	 * @async
	 * @param {Object} data - данные для входа
	 * @returns {Promise<Object>} результат входа
	 */
	async signIn(data) {
		const result = client.post('/signin', data);
		router.clearSessionCache();
		return result;
	},

	/**
	 * Выполняет выход пользователя
	 * @async
	 * @returns {Promise<Object>} результат выхода
	 */
	async logOut() {
		const result = client.post('/logout', {});
		router.clearSessionCache();
		return result;
	},

	// /**
	//  * Проверяет статус авторизации
	//  * @async
	//  * @returns {Promise<Object|null>} данные пользователя или null
	//  */
	// async getUserSession() {
	// 	try {
	// 		const user = await client.get('/protected');
	// 		return user;
	// 	} catch (error) {
	// 		if (error?.status === 401 || error?.message?.includes('401')) {
	// 			return {
	// 				isAuthenticated: false,
	// 				user: null,
	// 				error: {
	// 					type: 'AUTH',
	// 					status: 401,
	// 					redirectTo: '/signin',
	// 					onSamePage: false,
	// 				},
	// 			};
	// 		}
	// 		if (error?.status >= 500) {
	// 			return {
	// 				isAuthenticated: false,
	// 				user: null,
	// 				error: {
	// 					type: 'SERVER',
	// 					status: error.status,
	// 					onSamePage: true,
	// 				},
	// 			};
	// 		}
	// 		return {
	// 			isAuthenticated: false,
	// 			user: null,
	// 			error: {
	// 				type: 'NETWORK',
	// 				status: error?.status || 0,
	// 				onSamePage: true,
	// 			},
	// 		};
	// 	}
	// },
};
