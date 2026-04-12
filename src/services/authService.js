import { client } from '../client/client.js';
import { db } from '../db.js';
import { router } from '../route/router.js';
import { store } from '../store.js';

/**
 * Сервис для работы с авторизацией
 * @namespace authService
 */
export const authService = {
	/**
	 * Регистрирует нового пользователя
	 * @async
	 * @param {Object} data - данные для регистрации
	 * @returns {Promise<Object>} результат регистрации
	 */
	async signUp(data) {
		const result = await client.post('/signup', data);
        if (result?.id) {
            const user = {
                id: result.id,
                username: result.username,
                email: result.email || null,
                avatar: result.avatar || null,
            };
            await db.settingsSet('user', user);
            store.setUser(user);
        }
		return result;
	},

	/**
	 * Выполняет вход пользователя
	 * @async
	 * @param {Object} data - данные для входа
	 * @returns {Promise<Object>} результат входа
	 */
	async signIn(data) {
		const result = await client.post('/signin', data);
        if (result?.id) {
            const user = {
                id: result.id,
                username: result.username,
                email: result.email || null,
                avatar: result.avatar || null,
            };
            await db.settingsSet('user', user);
            store.setUser(user);
        }
		return result;
	},

	/**
	 * Выполняет выход пользователя
	 * @async
	 * @returns {Promise<Object>} результат выхода
	 */
	async logOut() {
        try {
            await client.post('/logout', {});
        } catch (error) {
            console.debug('[Auth] Logout error:', error);
        } finally {
            await db.settingsSet('user', null);
            store.setUser(null);
            await db.notesClear();
            store.setNotes([]);
            router.clearSessionCache();
        }
	},

	/**
	 * Проверяет статус авторизации
	 * @async
	 * @returns {Promise<Object|null>} данные пользователя или null
	 */
    async getUserSession() {
        const isOnline = store.getOnline();

        if (!isOnline) {
            const cachedUser = await db.settingsGet('user');
            if (cachedUser) {
                store.setUser(cachedUser);
                return {
                    isAuthenticated: true,
                    user: cachedUser,
                    isOffline: true,
                    isStale: true,
                }
            }
            return {
                isAuthenticated: false,
                user: null,
            }
        }

        try {
            const user = await client.get('/profile');
            await db.settingsSet('user', user);
            store.setUser(user);
            return {
                isAuthenticated: true,
                user,
                isOffline: false,
            };
        } catch (error) {
            if (error?.status === 401) {
                await db.settingsSet('user', null);
                store.setUser(null);
                return {
                    isAuthenticated: false,
                    user: null,
                    requiresRedirect: true,
                }
            }
            const cachedUser = await db.settingsGet('user');
            if (cachedUser) {
                store.setUser(cachedUser);
                return {
                    isAuthenticated: true,
                    user: cachedUser,
                    isStale: true,
                }
            }
            return {
                isAuthenticated: false,
                user: null,
                requiresRedirect: false,
            }
        }
    },

    /**
     * Обновляет профиль (после изменения настроек)
     */
    async updateProfile(data) {
        const result = await client.put('/profile', data);
        const currentUser = store.getUser();
        if (currentUser) {
            const updatedUser = { ...currentUser, ...result };
            await db.settingsSet('user', updatedUser);
            store.setUser(updatedUser);
        }
        
        return result;
    },

    /**
     * Обновляет аватар
     * @param {FormData} formData - FormData с файлом аватара
     * @returns {Promise<Object>} результат загрузки с URL аватара
     */
    async updateAvatar(formData) {
        const result = await client.postForm('/profile/avatar', formData);
        const currentUser = store.getUser();
        
        if (currentUser && result?.AvatarURL) {
            let avatarUrl = result.AvatarURL;
            avatarUrl = avatarUrl.replace('http://minio:9000', '/minio');
            avatarUrl = avatarUrl.replace('/minio/minio/', '/minio/');
            const updatedUser = { ...currentUser, avatar: avatarUrl };
            await db.settingsSet('user', updatedUser);
            store.setUser(updatedUser);
        }
        return result;
    },
	
	async changePassword() {
        // TODO: реализовать смену пароля
    },
};
