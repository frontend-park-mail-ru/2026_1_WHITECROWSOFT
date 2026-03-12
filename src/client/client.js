import { AppError, createError } from './appError';

const SERVER_URL = '/api';

/**
 * Класс дял клиента, выполняющего HTTP-запросы к серверу
 * @class Client
 * @classdesc Предоставляет методы для работы с API (GET, POST, PUT)
 */
class Client {
	/**
	 * Создает экземпляр клиента
	 * @constructor
	 */
	constructor() {
		this.serverURL = SERVER_URL;
	}

	/**
	 * Отправляет HTTP запрос на сервер
	 * @async
	 * @param {string} endpoint - путь к контенту на сервере
	 * @param {object} options - доплнительные параметры запроса
	 * @returns {Promise<Object|null>} данные ответа от сервера или null при статусе 204
	 * @throws {AppError} ошибка запроса с полями status, data, cause
	 */
	async request(endpoint, options = {}) {
		const url = `${this.serverURL}${endpoint}`;

		try {
			const response = await fetch(url, {
				credentials: 'include',
				headers: {
					'Content-Type': 'application/json',
					...options.headers,
				},
				...options,
			});

			const responseData = await response.json().catch(() => null);

			if (!response.ok) {
				throw createError.fromResponse(response, responseData);
			}

			if (response.status === 204) return null;

			return await responseData;
		} catch (err) {
			if (err instanceof AppError) {
				throw err;
			}
			if (err.name === 'AbortError') {
				throw createError.timeout(err);
			}
			throw createError.client(err);
		}
	}

	/**
	 * Отправляет GET запрос на сервер
	 * @async
	 * @param {string} endpoint - путь к контенту на сервере
	 * @returns {Promise<Object|null>} данные ответа от сервера
	 * @throws {AppError} ошибка запроса
	 */
	get(endpoint) {
		return this.request(endpoint, { method: 'GET' });
	}

	/**
	 * Отправляет POST запрос на сервер
	 * @async
	 * @param {string} endpoint - путь к контенту на сервере
	 * @param {object} body - данные для отправки
	 * @returns {Promise<Object|null>} данные ответа от сервера
	 * @throws {AppError} ошибка запроса
	 */
	post(endpoint, body = {}) {
		return this.request(endpoint, {
			method: 'POST',
			body: JSON.stringify(body),
		});
	}

	/**
	 * Отправляет PUT запрос на сервер
	 * @async
	 * @param {string} endpoint - путь к контенту на сервере
	 * @param {object} body - данные для обновления или записи
	 * @returns {Promise<Object|null>} данные ответа от сервера
	 * @throws {AppError} ошибка запроса
	 */
	put(endpoint, body = {}) {
		return this.request(endpoint, {
			method: 'PUT',
			body: JSON.stringify(body),
		});
	}

	/**
	 * Отправляет POST запрос c FormData на сервер
	 * @async
	 * @param {string} endpoint - путь к контенту на сервере
	 * @param {FormData} formData - FormData объект с данными формы
	 * @returns {Promise<Object|null>} данные ответа от сервера
	 * @throws {AppError} ошибка запроса
	 */
	postForm(endpoint, formData) {
		return this.request(endpoint, {
			method: 'POST',
			body: formData,
			headers: {},
		});
	}
}

export const client = new Client();
