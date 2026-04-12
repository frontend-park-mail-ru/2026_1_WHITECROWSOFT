import { AppError, createError } from './appError';

const SERVER_URL = '/api';

/**
 * Класс для клиента, выполняющего HTTP-запросы к серверу
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
		this.csrfToken = null;
		this.csrfTokenPromise = null;
	}

	/**
	 * Получает CSRF-токен с сервера
	 * @async
	 * @returns {Promise<string|null>} CSRF-токен или null
	 */
	async fetchCsrfToken() {
		if (this.csrfToken) {
			return this.csrfToken;
		}
		if (this.csrfTokenPromise) {
			return this.csrfTokenPromise;
		}
		this.csrfTokenPromise = (async () => {
			try {
				const response = await fetch(`${this.serverURL}/csrf-token`, {
					method: 'GET',
					credentials: 'include',
				});

				if (!response.ok) {
					throw new Error(`Failed to fetch CSRF token: ${response.status}`);
				}
				const data = await response.json();
				this.csrfToken = data.csrf_token || data.token;
				return this.csrfToken;
			} catch (error) {
				console.error('[Client] Failed to get CSRF token:', error);
				return null;
			} finally {
				this.csrfTokenPromise = null;
			}
		})();

		return this.csrfTokenPromise;
	}

	/**
	 * Сбрасывает CSRF-токен (при ошибке 403)
	 */
	resetCsrfToken() {
		this.csrfToken = null;
		this.csrfTokenPromise = null;
	}

	/**
	 * Отправляет HTTP запрос на сервер
	 * @async
	 * @param {string} endpoint - путь к контенту на сервере
	 * @param {object} options - дополнительные параметры запроса
	 * @returns {Promise<Object|null>} данные ответа от сервера или null при статусе 204
	 * @throws {AppError} ошибка запроса с полями status, data, cause
	 */
	async request(endpoint, options = {}) {
		const url = `${this.serverURL}${endpoint}`;
		const method = options.method || 'GET';
		const isMutatingMethod = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
		let headers = { ...options.headers };
		if (isMutatingMethod && !options.skipCsrf) {
			const csrfToken = await this.fetchCsrfToken();
			if (csrfToken) {
				headers['X-CSRF-Token'] = csrfToken;
			}
		}
		if (!(options.body instanceof FormData)) {
			headers['Content-Type'] = 'application/json';
		}
		try {
			const response = await fetch(url, {
				credentials: 'include',
				headers: headers,
				...options,
				body: options.body,
			});
			if (response.status === 403 && isMutatingMethod && !options._retried) {
				console.warn('[Client] CSRF token invalid, refreshing and retrying...');
				this.resetCsrfToken();
				const retryOptions = { ...options, _retried: true };
				return this.request(endpoint, retryOptions);
			}

			const responseData = await response.json().catch(() => null);

			if (!response.ok) {
				throw createError.fromResponse(response, responseData);
			}

			if (response.status === 204) return null;

			return responseData;
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
			// Не устанавливаем Content-Type для FormData
		});
	}

	/**
	 * Отправляет DELETE запрос на сервер
	 * @async
	 * @param {string} endpoint - путь к контенту на сервере
	 * @returns {Promise<Object|null>} данные ответа от сервера
	 * @throws {AppError} ошибка запроса
	 */
	delete(endpoint) {
		return this.request(endpoint, {
			method: 'DELETE',
		});
	}
}

export const client = new Client();