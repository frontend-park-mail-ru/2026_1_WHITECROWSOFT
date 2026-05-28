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

		const currentPath = window.location.pathname;
		const isAuthPage = currentPath === '/signin' || currentPath === '/signup';

		if (!isAuthPage) {
			router.replace('/signin');
		} else {
			const url = new URL(window.location.href);
			url.search = '';
			window.history.replaceState({}, '', url.toString());
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
