import { db } from './db.js';
import { router } from './route/router.js';
import { queueService } from './services/requestQueueService.js';
import { store } from './store.js';
import { registerHelpers } from './utils/utils.js';

/**
 * Инициализирует приложение после загрузки DOM
 * @event DOMContentLoaded
 */
document.addEventListener('DOMContentLoaded', async () => {
	await bootstrap();
});

async function bootstrap() {
	try {
		registerHelpers();
		await db.open();
		await queueService.clearQueue();

		const cachedNotes = await db.notesGetAll();
		if (cachedNotes && cachedNotes.length > 0) {
			store.setNotes(cachedNotes);
		}

		const activeNodeId = await db.settingsGet('activeNoteId');
		if (activeNodeId) {
			store.setActiveNoteId(activeNodeId);
		}

		const cachedUser = await db.settingsGet('user');
		if (cachedUser) {
			store.setUser(cachedUser);
		}

		await store.loadRecentNotes();

		window.addEventListener('online', async () => {
			store.setOnline(true);
			await queueService.flushQueue();
		});

		window.addEventListener('offline', () => {
			store.setOnline(false);
		});
	} catch (error) {
		console.error('[App] Bootstrap error:', error);
	} finally {
		registerServiceWorker();
		router.init();
	}
}

function registerServiceWorker() {
	if ('serviceWorker' in navigator) {
		navigator.serviceWorker
			.register('/service-worker.js')
			.then(() => console.log('[SW] Service worker registered'))
			.catch((error) =>
				console.warn('[SW] Service worker registration failed:', error),
			);
	}
}
