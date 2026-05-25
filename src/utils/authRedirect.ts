const REDIRECT_STORAGE_KEY = 'authRedirectUrl';

export function getAuthRedirectUrl(): string {
	const urlParams = new URLSearchParams(window.location.search);
	let redirectUrl = urlParams.get('redirect') || '/';
	if (!urlParams.has('redirect')) {
		const savedRedirect = sessionStorage.getItem(REDIRECT_STORAGE_KEY);
		if (savedRedirect) {
			redirectUrl = savedRedirect;
		}
	}
	if (redirectUrl !== '/') {
		sessionStorage.setItem(REDIRECT_STORAGE_KEY, redirectUrl);
	}
	return redirectUrl;
}

export function clearAuthRedirect(): void {
	sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
}

export function getRedirectUrlForPage(page: 'signin' | 'signup'): string {
	const currentRedirect = getAuthRedirectUrl();
	if (currentRedirect !== '/') {
		return `/${page}?redirect=${encodeURIComponent(currentRedirect)}`;
	}
	return `/${page}`;
}
