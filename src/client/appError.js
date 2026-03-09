/**
 * Класс для ошибок приложения
 * @class appError
 * @classdesc Единый формат ошибок для всего приложения
 * @extends Error
 */
export class appError extends Error {
    constructor (message, data=null, cause=null, status) {
        super(message);
        this.name = 'clientError';
        this.cause = cause;
        this.status = status;
        this.data = data;
    }
}

/**
 * Функция для создания ошибок приложения
 * @example
 * throw createError.notFound('User');
 * throw createError.unauthorized();
 * throw createError.timeout(originalError);
*/
export const createError = {
    fromResponse: (response, data) => {
		return new AppError(
			`Request failed: ${response.status}`,
			response.status,
			data
		);
	},
    timeout: (cause) => {
		return new AppError('Request timeout', 408, null, cause);
	},
    client: (cause) => {
		return new AppError('Client error', 0, null, cause);
	},
    unauthorized: (data = null) => {
		return new AppError('Unauthorized', 401, data);
	},
    notFound: (resource = 'Resource') => {
		return new AppError(`${resource} not found`, 404);
	}
}