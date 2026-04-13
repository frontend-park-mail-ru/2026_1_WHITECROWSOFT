/**
 * Класс для ошибок приложения
 * @class AppError
 * @classdesc Единый формат ошибок для всего приложения
 * @extends Error
 */
export class AppError<T = unknown> extends Error {
	public readonly status: number;
	public readonly data: T | null;
	public readonly cause: Error | null;

	constructor(message: string, status: number, data: T | null = null, cause: Error | null = null) {
		super(message);
		this.status = status;
		this.data = data;
		this.cause = cause;
		this.name = 'AppError';
		
		// Сохраняем стек вызовов (для корректной работы в TypeScript)
		Object.setPrototypeOf(this, AppError.prototype);
	}
}

/**
 * Параметры для создания ошибок
 */
interface CreateError {
	/**
	 * Создает ошибку из HTTP ответа
	 */
	fromResponse: <T = unknown>(response: Response, data?: T | null) => AppError<T>;
	
	/**
	 * Создает ошибку таймаута
	 */
	timeout: (cause?: Error | null) => AppError;
	
	/**
	 * Создает клиентскую ошибку
	 */
	client: (cause?: Error | null) => AppError;
	
	/**
	 * Создает ошибку неавторизованного доступа
	 */
	unauthorized: <T = unknown>(data?: T | null) => AppError<T>;
	
	/**
	 * Создает ошибку "не найдено"
	 */
	notFound: (resource?: string) => AppError;
}

/**
 * Функция для создания ошибок приложения
 */
export const createError: CreateError = {
	fromResponse: <T = unknown>(response: Response, data: T | null = null): AppError<T> => {
		return new AppError<T>(
			`Request failed: ${response.status}`,
			response.status,
			data,
		);
	},
	
	timeout: (cause: Error | null = null): AppError => {
		return new AppError('Request timeout', 408, null, cause);
	},
	
	client: (cause: Error | null = null): AppError => {
		return new AppError('Client error', 0, null, cause);
	},
	
	unauthorized: <T = unknown>(data: T | null = null): AppError<T> => {
		return new AppError('Unauthorized', 401, data);
	},
	
	notFound: (resource: string = 'Resource'): AppError => {
		return new AppError(`${resource} not found`, 404);
	},
};
