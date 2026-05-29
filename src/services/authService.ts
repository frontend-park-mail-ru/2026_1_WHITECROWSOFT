import { client } from '../client/client.js';
import { db } from '../db.js';
import { store } from '../store.js';
import type { User, UserSession } from '../types.js';

interface AuthCredentials {
	username: string;
	password: string;
	email?: string;
}

interface AuthResponse {
	id: string | number;
	username: string;
	email?: string;
	avatar?: string | null;
	updated_at?: string;
	created_at?: string;
}

interface ProfileUpdateResponse {
	id?: string | number;
	username?: string;
	email?: string;
	avatar?: string | null;
}

interface AvatarUploadResponse {
	AvatarURL?: string;
	url?: string;
	message?: string;
}

export const authService = {
	async signUp(data: AuthCredentials): Promise<AuthResponse> {
		const result = await client.post<AuthResponse>('/signup', data);
		if (result?.id) {
			await db.clearAllUserData();
			store.setUser(null);
			store.setNotes([]);
			store.setActiveNote(null);
			store.setActiveNoteId(null);
			store.setActiveBlocks([]);
			const user: User = {
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

	async signIn(data: AuthCredentials): Promise<AuthResponse> {
		const result = await client.post<AuthResponse>('/signin', data);
		if (result?.id) {
			const previousUser = await db.settingsGet<User>('user');
			const shouldClear =
				previousUser && String(previousUser.id) !== String(result.id);
			if (shouldClear) {
				await db.clearAllUserData();
				store.setUser(null);
				store.setNotes([]);
				store.setActiveNote(null);
				store.setActiveNoteId(null);
				store.setActiveBlocks([]);
			}
			const user: User = {
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

	async logOut(): Promise<void> {
		try {
			await client.post('/logout', {});
		} catch (error) {
			console.debug('[Auth] Logout error:', error);
		} finally {
			await this.invalidateSession();
		}
	},

	async invalidateSession(): Promise<void> {
		store.setUser(null);
		store.setNotes([]);
		store.setActiveNote(null);
		store.setActiveNoteId(null);
		store.setActiveBlocks([]);
		store.setOnline(navigator.onLine);

		localStorage.removeItem('NoterianCookieCSRF');
		localStorage.removeItem('NoterianCookieJWT');
		sessionStorage.removeItem('authRedirectUrl');

		try {
			await db.clearAllUserData();
		} catch (error) {
			console.error('[Auth] Failed to clear local session data:', error);
		}

		if (
			window.location.pathname !== '/signin' &&
			window.location.pathname !== '/signup'
		) {
			window.history.replaceState({ path: '/' }, '', '/');
		}
	},

	async getUserSession(): Promise<UserSession> {
		const isOnline = store.getOnline();
		const cachedUser = await db.settingsGet<User>('user');
		if (!isOnline) {
			if (cachedUser) {
				store.setUser(cachedUser);
				return {
					isAuthenticated: true,
					user: cachedUser,
					isOffline: true,
					isStale: true,
				};
			}
			await this.invalidateSession();
			return {
				isAuthenticated: false,
				user: null,
			};
		}

		try {
			const user = await client.get<User>('/profile');
			const currentUser: User = {
				id: user.id,
				username: user.username,
				email: user.email || null,
				avatar: user.avatar || null,
			};
			const hasDifferentCachedUser =
				cachedUser && String(cachedUser.id) !== String(currentUser.id);
			if (hasDifferentCachedUser) {
				await db.clearAllUserData();
				store.setUser(null);
				store.setNotes([]);
				store.setActiveNote(null);
				store.setActiveNoteId(null);
				store.setActiveBlocks([]);
			}
			await db.settingsSet('user', currentUser);
			store.setUser(currentUser);
			return {
				isAuthenticated: true,
				user,
				isOffline: false,
			};
		} catch (error: unknown) {
			const err = error as { status?: number };
			if (err?.status === 401) {
				await this.invalidateSession();
				return {
					isAuthenticated: false,
					user: null,
					requiresRedirect: true,
				};
			}
			if (cachedUser) {
				store.setUser(cachedUser);
				return {
					isAuthenticated: true,
					user: cachedUser,
					isStale: true,
				};
			}
			await db.clearAllUserData();
			store.setUser(null);
			return {
				isAuthenticated: false,
				user: null,
				requiresRedirect: false,
			};
		}
	},

	async updateProfile(data: Partial<User>): Promise<ProfileUpdateResponse> {
		const result = await client.put<ProfileUpdateResponse>('/profile', data);
		const currentUser = store.getUser();

		if (currentUser && result) {
			const updatedUser: User = {
				...currentUser,
				...(result as Partial<User>),
				id: currentUser.id,
			};
			await db.settingsSet('user', updatedUser);
			store.setUser(updatedUser);
		}
		return result;
	},

	async updateAvatar(formData: FormData): Promise<AvatarUploadResponse> {
		const result = await client.postForm<AvatarUploadResponse>(
			'/profile/avatar',
			formData,
		);
		const currentUser = store.getUser();
		if (currentUser && result?.AvatarURL) {
			let avatarUrl = result.AvatarURL;
			avatarUrl = avatarUrl.replace('http://minio:9000', '/minio');
			avatarUrl = avatarUrl.replace('/minio/minio/', '/minio/');
			const updatedUser: User = {
				...currentUser,
				avatar: avatarUrl,
			};
			await db.settingsSet('user', updatedUser);
			store.setUser(updatedUser);
		}
		return result;
	},

	async deleteAvatar(): Promise<void> {
		await client.delete('/profile/avatar');
		const currentUser = store.getUser();
		if (currentUser) {
			const updatedUser: User = {
				...currentUser,
				avatar: null,
			};
			await db.settingsSet('user', updatedUser);
			store.setUser(updatedUser);
		}
	},

	async changePassword(data?: {
		oldPassword: string;
		newPassword: string;
	}): Promise<void> {
		console.warn('[AuthService] changePassword not implemented yet', data);
	},

	async deleteAccount(): Promise<void> {
		await client.delete('/profile');
		await this.invalidateSession();
	},
};

export type {
	AuthCredentials,
	AuthResponse,
	AvatarUploadResponse,
	ProfileUpdateResponse,
};
