import { handleAuthError } from '../utils/handleAuthError.js';
import { AppError, createError } from './appError';

const SERVER_URL = '/api';

interface RequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
	method?: string;
	headers?: Record<string, string>;
	body?: BodyInit | null;
	skipCsrf?: boolean;
	_retried?: boolean;
}

interface CsrfTokenResponse {
	csrf_token?: string;
	token?: string;
}

class Client {
	private readonly serverURL: string;
	private csrfToken: string | null;
	private csrfTokenPromise: Promise<string | null> | null;

	constructor() {
		this.serverURL = SERVER_URL;
		this.csrfToken = null;
		this.csrfTokenPromise = null;
	}

	async fetchCsrfToken(): Promise<string | null> {
		if (this.csrfToken) {
			return this.csrfToken;
		}

		if (this.csrfTokenPromise) {
			return this.csrfTokenPromise;
		}

		this.csrfTokenPromise = (async (): Promise<string | null> => {
			try {
				const response = await fetch(`${this.serverURL}/csrf-token`, {
					method: 'GET',
					credentials: 'include',
				});

				if (!response.ok) {
					throw new Error(`Failed to fetch CSRF token: ${response.status}`);
				}

				const data = (await response.json()) as CsrfTokenResponse;
				this.csrfToken = data.csrf_token ?? data.token ?? null;
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

	resetCsrfToken(): void {
		this.csrfToken = null;
		this.csrfTokenPromise = null;
	}

	private getAuthHeaders(): Record<string, string> {
		const headers: Record<string, string> = {};
		const token = localStorage.getItem('accessToken');
		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}
		return headers;
	}

	private handleResponseError(response: Response): void {
		if (response.status === 401) {
			handleAuthError({ status: 401 });
		}
	}

	async request<T = unknown>(
		endpoint: string,
		options: RequestOptions = {},
	): Promise<T> {
		const url = `${this.serverURL}${endpoint}`;
		const method = options.method || 'GET';
		const isMutatingMethod = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(
			method.toUpperCase(),
		);

		const headers: Record<string, string> = {
			...this.getAuthHeaders(),
			...options.headers,
		};

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
				headers,
				...options,
				body: options.body ?? null,
			});

			if (response.status === 403 && isMutatingMethod && !options._retried) {
				this.resetCsrfToken();
				const retryOptions: RequestOptions = { ...options, _retried: true };
				return this.request<T>(endpoint, retryOptions);
			}

			let responseData: T | null = null;
			const contentType = response.headers.get('content-type');

			if (contentType?.includes('application/json')) {
				try {
					responseData = (await response.json()) as T;
				} catch {
					console.log('[CLIENT] Failed to parse JSON response');
				}
			}

			if (response.status === 401) {
				this.handleResponseError(response);
				throw createError.fromResponse(response, responseData);
			}

			if (!response.ok) {
				throw createError.fromResponse(response, responseData);
			}

			if (response.status === 204) {
				return {} as T;
			}

			return responseData as T;
		} catch (err) {
			if (err instanceof AppError) {
				throw err;
			}

			if (err instanceof Error && err.name === 'AbortError') {
				throw createError.timeout(err);
			}

			throw createError.client(
				err instanceof Error ? err : new Error(String(err)),
			);
		}
	}

	get<T = unknown>(endpoint: string): Promise<T> {
		return this.request<T>(endpoint, { method: 'GET' });
	}

	post<T = unknown>(endpoint: string, body: object = {}): Promise<T> {
		return this.request<T>(endpoint, {
			method: 'POST',
			body: JSON.stringify(body),
		});
	}

	put<T = unknown>(endpoint: string, body: object = {}): Promise<T> {
		return this.request<T>(endpoint, {
			method: 'PUT',
			body: JSON.stringify(body),
		});
	}

	patch<T = unknown>(endpoint: string, body: object = {}): Promise<T> {
		return this.request<T>(endpoint, {
			method: 'PATCH',
			body: JSON.stringify(body),
		});
	}

	postForm<T = unknown>(endpoint: string, formData: FormData): Promise<T> {
		return this.request<T>(endpoint, {
			method: 'POST',
			body: formData,
		});
	}

	delete<T = unknown>(endpoint: string): Promise<T> {
		return this.request<T>(endpoint, {
			method: 'DELETE',
		});
	}

	async getBlob(endpoint: string): Promise<Blob> {
		const url = `${this.serverURL}${endpoint}`;
		const headers = this.getAuthHeaders();

		const response = await fetch(url, {
			credentials: 'include',
			method: 'GET',
			headers,
		});

		if (response.status === 401) {
			handleAuthError({ status: 401 });
			throw new Error('Unauthorized');
		}

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		return response.blob();
	}
}

export const client = new Client();
