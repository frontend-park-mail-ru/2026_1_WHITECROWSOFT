import type { User } from '../types.js';

export const DEFAULT_AVATAR_URL = '/icons/avatarBig.svg';

export function getAvatarUrl(user: User | null): string {
	const raw = user?.avatar || DEFAULT_AVATAR_URL;
	return raw.replace('http://minio:9000', '/minio');
}

export function hasCustomAvatar(user: User | null): boolean {
	return !!user?.avatar && user.avatar !== DEFAULT_AVATAR_URL;
}
