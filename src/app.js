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

		window.addEventListener('online', async () => {
			store.setOnline(true);
			await queueService.flushQueue();
		});

		window.addEventListener('offline', () => {
			store.setOnline(false);
		});

		const cachedNotes = await db.notesGetAll();
		console.log(cachedNotes);
		if (cachedNotes && cachedNotes.length > 0) {
			const notesWithFormatting = [];
			for (const note of cachedNotes) {
				const formattingMap = await db.formattingGetByNoteId(note.ID);
				const blocksWithFormatting = (note.blocks || []).map((block) => ({
					...block,
					formatting: formattingMap[block.id]
						? { ranges: formattingMap[block.id] }
						: block.formatting || { ranges: [] },
				}));
				notesWithFormatting.push({
					...note,
					blocks: blocksWithFormatting,
				});
			}
			store.setNotesSilently(notesWithFormatting);
			for (const note of notesWithFormatting) {
				await db.notesPut(note);
			}
		}

		const activeNodeId = await db.settingsGet('activeNoteId');
		if (activeNodeId) {
			const note = await db.notesGet(activeNodeId);
			const activenote = {
				ID: activeNodeId,
				title: note.title,
				breadcrumb: note.title,
				text: '',
				parent_id: note.parent_id || null,
				section: note.section,
				coverUrl: note.coverUrl,
				iconUrl: note.iconUrl,
			};
			store.setActiveNote(activenote);
			store.setActiveNoteId(activeNodeId);
			const activeNote = await db.notesGet(activeNodeId);
			if (activeNote && activeNote.blocks && activeNote.blocks.length > 0) {
				const formattingMap = await db.formattingGetByNoteId(activeNodeId);
				const blocksWithFormatting = activeNote.blocks.map((block) => ({
					...block,
					formatting: formattingMap[block.id]
						? { ranges: formattingMap[block.id] }
						: block.formatting || { ranges: [] },
				}));
				store.setActiveBlocks(blocksWithFormatting);
			}
		}

		const cachedUser = await db.settingsGet('user');
		if (cachedUser) {
			store.setUser(cachedUser);
		}
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
