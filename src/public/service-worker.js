const CACHE_VERSION = 'noterian-v1';
const CACHE_NAME = `noterian-static-${CACHE_VERSION}`;
const ASSETS_TO_CACHE = [
	'/',
	'/index.html',
	'/assets/style/main.css',
	'/assets/style/authForm.css',
	'/assets/style/profilePage.css',
	'/icons/search.svg',
	'/icons/profile.svg',
	'/icons/home.svg',
	'/icons/add.svg',
	'/icons/more.svg',
];

self.addEventListener('install', (event) => {
	self.skipWaiting();
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
	);
});

self.addEventListener('activate', (event) => {
	self.clients.claim();
	event.waitUntil(
		caches.keys().then((cacheNames) =>
			Promise.all(
				cacheNames
					.filter((name) => name !== CACHE_NAME)
					.map((name) => caches.delete(name))
			)
		)
	);
});

function cacheFirst(request) {
	return caches.match(request).then((cachedResponse) => {
		if (cachedResponse) {
			return cachedResponse;
		}
		return fetch(request).then((networkResponse) => {
			if (networkResponse && networkResponse.ok) {
				const clonedResponse = networkResponse.clone();
				caches.open(CACHE_NAME).then((cache) => cache.put(request, clonedResponse));
			}
			return networkResponse;
		});
	});
}

function networkFirst(request) {
	return fetch(request)
		.then((response) => {
			if (response && response.ok) {
				const clonedResponse = response.clone();
				caches.open(CACHE_NAME).then((cache) => cache.put(request, clonedResponse));
			}
			return response;
		})
		.catch(() => caches.match(request).then((cachedResponse) => cachedResponse || caches.match('/index.html')));
}

self.addEventListener('fetch', (event) => {
	const request = event.request;
	const url = new URL(request.url);

	if (url.origin !== location.origin) {
		return;
	}

	if (request.method !== 'GET') {
		return;
	}

	if (request.mode === 'navigate') {
		event.respondWith(networkFirst(request));
		return;
	}

	if (
		request.destination === 'style' ||
		request.destination === 'script' ||
		request.destination === 'image' ||
		url.pathname.startsWith('/icons/') ||
		url.pathname.startsWith('/assets/')
	) {
		event.respondWith(cacheFirst(request));
	}
});
