import { router } from '../route/router.js';

export interface AuthError extends Error {
    status?: number;
}

/**
 * Обрабатывает ошибки авторизации
 * @param error - ошибка для обработки
 * @returns true если это 401
 */
export function handleAuthError(error: unknown): boolean {
    const authError = error as AuthError;
    if (authError?.status === 401) {
        router.replace('/signin');
        return true;
    }
    return false;
}
