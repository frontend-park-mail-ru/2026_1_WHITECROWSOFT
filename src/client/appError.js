/**
 * Класс для ошибок приложения
 * @class AppError
 * @classdesc Единый формат ошибок для всего приложения
 * @extends Error
 */
export class AppError extends Error {
	constructor(message, status, data = null, cause = null) {
		super(message);
		this.status = status;
		this.data = data;
		this.cause = cause;
		this.name = 'AppError';
	}
}

/**
 * Функция для создания ошибок приложения
 */
export const createError = {
	fromResponse: (response, data = null) => {
		return new AppError(
			`Request failed: ${response.status}`,
			response.status,
			data,
		);
	},
	timeout: (cause = null) => {
		return new AppError('Request timeout', 408, null, cause);
	},
	client: (cause = null) => {
		return new AppError('Client error', 0, null, cause);
	},
	unauthorized: (data = null) => {
		return new AppError('Unauthorized', 401, data);
	},
	notFound: (resource = 'Resource') => {
		return new AppError(`${resource} not found`, 404);
	},
};
