import { client } from '../client/client.js';
import { router } from '../route/router.js';

/**
 * Сервис для работы с авторизацией и заметками
 * @namespace authService
*/
export const authService = {
	/**
	 * Получает список всех заметок пользователя
	 * @async
	 * @returns {Promise<Array|null>} список заметок или null при ошибке
	*/
	async getNotes() {
		try {
			const result = client.get('/notes');
			// router.clearAuthCache();
			return result;
		} catch (error) {
			if (error?.status === 401 || error?.message?.includes('401')) {
				console.debug('[Auth] User not authenticated (expected)');
				return null;
			}
			console.warn('[Auth] Check failed:', error);
			return null;
		}
	},

	/**
	 * Получает конкретную заметку по ID
	 * @async
	 * @param {string} noteID - идентификатор заметки
	 * @returns {Promise<Object|null>} данные заметки или null при ошибке
	*/
	async getNote(noteID) {
		try {
			const result = client.get(`/notes/${noteID}`);
			// if (result.status != 200) {
			// 	throw new Error;
			// }
			return result;
		} catch (error) {
			if (error?.status === 401 || error?.message?.includes('401')) {
				console.debug('[Auth] User not authenticated (expected)');
				return null;
			}
			console.warn('[Auth] Check failed:', error);
			return null;
		}
	},

	/**
	 * Регистрирует нового пользователя
	 * @async
	 * @param {Object} data - данные для регистрации
	 * @returns {Promise<Object>} результат регистрации
	*/
	async signUp(data) {
		const result = client.post('/signup', data);
		router.clearAuthCache();
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
		router.clearAuthCache();
		return result;
	},

	/**
	 * Выполняет выход пользователя
	 * @async
	 * @returns {Promise<Object>} результат выхода
	*/
	async logOut() {
		const result = client.post('/logout', {});
		router.clearAuthCache();
		return result;
	},

	/**
	 * Проверяет статус авторизации
	 * @async
	 * @returns {Promise<Object|null>} данные пользователя или null
	*/
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
