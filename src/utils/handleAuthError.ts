import { router } from '../route/router.js';

export interface AuthError extends Error {
	status?: number;
}

let isRedirecting = false;
let redirectTimeout: ReturnType<typeof setTimeout> | null = null;

export function handleAuthError(error: unknown): boolean {
	const authError = error as AuthError;
	if (authError?.status === 401 && !isRedirecting) {
		isRedirecting = true;

		const currentUrl = window.location.pathname + window.location.search;
		const isAuthPage =
			currentUrl.includes('/signin') || currentUrl.includes('/signup');

		if (!isAuthPage) {
			const redirectUrl = `/signin?redirect=${encodeURIComponent(currentUrl)}`;
			router.replace(redirectUrl);
		}

		if (redirectTimeout) {
			clearTimeout(redirectTimeout);
		}

		redirectTimeout = setTimeout(() => {
			isRedirecting = false;
			redirectTimeout = null;
		}, 1000);

		return true;
	}
	return false;
}

export function resetAuthRedirect(): void {
	isRedirecting = false;
	if (redirectTimeout) {
		clearTimeout(redirectTimeout);
		redirectTimeout = null;
	}
}
