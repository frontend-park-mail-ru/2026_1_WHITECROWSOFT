import { router } from '../route/router.js';

/**
 * Обрабатывает ошибки авторизации
 * @param {Error} error 
 * @returns {boolean} true если это 401
 */
export function handleAuthError(error) {
    if (error?.status === 401) {
        router.replace('/signin');
        return true;
    }
    return false;
}