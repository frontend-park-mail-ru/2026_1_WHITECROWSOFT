import { client } from '../client/client.js';

/**
 * Сервис для работы с заметками
 * @namespace noteService
 */
export const noteService = {
	/**
	 * Получает список всех заметок пользователя
	 * @async
	 * @returns {Promise<Array|null>} список заметок или null при ошибке
	 */
	async getNotes() {
		try {
			const result = client.get('/notes');
			// router.clearSessionCache();
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
};
