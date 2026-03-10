import Handlebars from 'handlebars';
import { Sidebar } from '../../components/sidebar/sidebar.js';
import { router } from '../../route/router.js';
import { authService } from '../../services/authService.js';
import { registerHelpers } from '../../utils/utils.js';
import './mainPage.css';
import templateText from './mainPage.hbs?raw';

/**
 * Инициализирует главную страницу с заметками
 * @async
 * @function initMainPage
 * @returns {Promise<void>}
 * 
 * @description
 * Загружает список заметок, отображает активную заметку,
 * создает боковую панель и настраивает переключение между заметками
*/
export async function initMainPage() {
	registerHelpers();
	const template = Handlebars.compile(templateText);

	const app = document.querySelector('#app');
	if (!app) return;

	let data = await authService.getNotes();
	for (let i = 0; i < data.total; ++i) {
		data.notes[i].icon = "document";
	}

	let activeNote = await authService.getNote(data.notes[0].id);
	data["activeNoteId"] = activeNote.note.id;
	data["activeNote"] = {
		id: activeNote.note.id,
		title: activeNote.note.title,
		breadcrumb: activeNote.note.title,
		text: activeNote.blocks.map(item => item.content).join("\n\n")
	};

	const state = { ...data };
	const html = template(state);
	app.innerHTML = html;

	const container = document.querySelector('.mainContainer');
	if (!container) return;

	const updateUI = async (newNoteId) => {
		const selectedNote = await authService.getNote(newNoteId);
		if (!selectedNote) {
			router.replace('/signin');
			return;
		}

		const titleEl = document.querySelector('.noteTitle');
		const breadcrumbEl = document.querySelector('.currentItem');
		const noteBody = document.querySelector('.noteBody');

		if (titleEl) titleEl.textContent = selectedNote.note.title;
		if (breadcrumbEl) breadcrumbEl.textContent = selectedNote.note.title;
		if (noteBody) noteBody.textContent = selectedNote.blocks.map(item => item.content).join("\n\n");

		document.querySelectorAll('[data-note-id]').forEach((el) => {
			el.classList.toggle('active', el.dataset.noteId === newNoteId);
		});
	};

	const sidebar = new Sidebar('sidebarContainer', state, (id) => updateUI(id));
	await sidebar.init();
}
