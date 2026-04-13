const CACHE_VERSION = 'noterian-v1';
const CACHE_NAME = `noterian-static-${CACHE_VERSION}`;
const ASSETS_TO_CACHE = [
	'/',
	'/index.html',
	'/assets/style/main.scss',
	'/assets/style/authForm.scss',
	'/icons/add.svg',
	'/icons/attach_picture.svg',
	'/icons/attach_table.svg',
	'/icons/attach_text.svg',
	'/icons/block_add.svg',
	'/icons/block_drag.svg',
	'/icons/bookmark.svg',
	'/icons/document.svg',
	'/icons/empty-page.svg',
	'/icons/expand.svg',
	'/icons/home.svg',
	'/icons/logout.svg',
	'/icons/more.svg',
	'/icons/pin.svg',
	'/icons/plane.svg',
	'/icons/profile.svg',
	'/icons/rename.svg',
	'/icons/req_no.svg',
	'/icons/req_yes.svg',
	'/icons/search.svg',
	'/icons/settings.svg',
	'/icons/star.svg',
	'/icons/text_bold.svg',
	'/icons/text_code.svg',
	'/icons/text_color.svg',
	'/icons/text_cross.svg',
	'/icons/text_formula.svg',
	'/icons/text_italica.svg',
	'/icons/text_link.svg',
	'/icons/text_underscore.svg',
	'/icons/trash.svg',
	'/icons/validation.svg',
	'/icons/visibility-off.svg',
	'/icons/visibility.svg',
	'/fonts/inter/inter.woff2',
	'/fonts/inter/inter_italic.woff2',
	'/fonts/librecaslon/LibreCaslonText-Bold.woff2',
	'/fonts/librecaslon/LibreCaslonText-Italic.woff2',
	'/fonts/librecaslon/LibreCaslonText-Regular.woff2',
];

self.addEventListener('install', (event) => {
	self.skipWaiting();
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			return Promise.allSettled(
				ASSETS_TO_CACHE.map((url) =>
					cache
						.add(url)
						.catch((err) => console.warn(`[SW] Failed to cache ${url}:`, err)),
				),
			);
		}),
	);
});

self.addEventListener('activate', (event) => {
	self.clients.claim();
	event.waitUntil(
		caches
			.keys()
			.then((cacheNames) =>
				Promise.all(
					cacheNames
						.filter((name) => name !== CACHE_NAME)
						.map((name) => caches.delete(name)),
				),
			),
	);
});

function cacheFirst(request) {
	return caches.match(request).then((cachedResponse) => {
		if (cachedResponse) {
			return cachedResponse;
		}
		return fetch(request)
			.then((networkResponse) => {
				if (networkResponse && networkResponse.ok) {
					const clonedResponse = networkResponse.clone();
					caches
						.open(CACHE_NAME)
						.then((cache) => cache.put(request, clonedResponse));
				}
				return networkResponse;
			})
			.catch((error) => {
				console.warn('[SW] Fetch failed:', request.url, error);
				if (request.mode === 'navigate') {
					return caches.match('/index.html');
				}
				return new Response('Network error', {
					status: 408,
					statusText: 'Network Error',
				});
			});
	});
}

function networkFirst(request) {
	return fetch(request)
		.then((response) => {
			if (response && response.ok) {
				const clonedResponse = response.clone();
				caches
					.open(CACHE_NAME)
					.then((cache) => cache.put(request, clonedResponse));
			}
			return response;
		})
		.catch((error) => {
			console.warn('[SW] Network failed, trying cache:', request.url, error);
			return caches.match(request).then((cachedResponse) => {
				if (cachedResponse) {
					return cachedResponse;
				}
				if (request.mode === 'navigate') {
					return caches.match('/index.html');
				}
				return new Response('Offline', {
					status: 503,
					statusText: 'Service Unavailable',
				});
			});
		});
}

self.addEventListener('fetch', (event) => {
	const request = event.request;
	const url = new URL(request.url);

	if (
		url.pathname.startsWith('/api/') ||
		url.pathname.startsWith('/minio/') ||
		url.pathname.startsWith('/null')
	) {
		return;
	}

	if (request.method !== 'GET') {
		return;
	}

	if (request.mode === 'navigate') {
		event.respondWith(networkFirst(request));
		return;
	}

	if (url.pathname === '/signin' || url.pathname === '/signup') {
		event.respondWith(fetch(request));
		return;
	}

	if (
		request.destination === 'style' ||
		request.destination === 'script' ||
		request.destination === 'image' ||
		request.destination === 'font' ||
		url.pathname.startsWith('/icons/') ||
		url.pathname.startsWith('/assets/') ||
		url.pathname.startsWith('/fonts/')
	) {
		event.respondWith(cacheFirst(request));
	}
});
