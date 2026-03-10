import Handlebars from 'handlebars';
import { Sidebar } from '../../components/sidebar/sidebar.js';
import { router } from '../../route/router.js';
import { authService } from '../../services/authService.js';
import { registerHelpers } from '../../utils/utils.js';
import './mainPage.css';
import templateText from './mainPage.hbs?raw';

// const mockData = {
// 	searchQuery: '',
// 	activeNav: 'library',
// 	activeNoteId: 'empty-note',
// 	notes: [
// 		{ id: 'projects', title: 'Projects', icon: 'document' },
// 		{ id: 'to-the-moon', title: 'To the Moon', icon: 'empty-page' },
// 		{ id: 'finding-paradise', title: 'Finding Paradise', icon: 'plane' },
// 		{ id: 'empty-note', title: 'Empty note', icon: 'empty-page' },
// 		{ id: 'travels', title: 'Travel', icon: 'document' },
// 		// {
// 		// 	id: 'extended-note',
// 		// 	title: 'A note with an extremely, obscenely long title',
// 		// 	icon: 'document',
// 		// },
// 		// { id: 'impostor-factory', title: 'Impostor Factory', icon: 'star-shine' },
// 	],
// 	activeNote: {
// 		id: 'empty-note',
// 		title: 'Empty note',
// 		breadcrumb: 'Empty note',
// 		text: [
// 			`There is no game like Outer Wilds. That doesn't stop fans from search for the elusive Wilds-like.
//             One game that keeps popping up is The Forgotten City. Being very fond of flying into the sun and eating burned marshmallows,
//             I was intrigued to try another knowledge based game. I'd like to start by stating my expectations when I opened TFC. Because
//             I feel this review, and my experience with the game at large, are in big part a result of them. When the internets sold me on The Forgotten City,
//             I was painted an image of a knowledge-based time loop mystery with lots of philosophy set in the roman empire.
//             A period drama whodunnit Outer Wilds meets The Talos Principle?! Count me in! My experience was shot through this lens, with expectations you might've not had.
//             I usually begin reviews by talking about presentation. Alas, the graphics are often wonky and the mechanics are stiff.
//             The NPC models are aggressively Bethesda-esque, and that's not a compliment. Part of game's fame comes from it starting life as a
//             Skyrim mod made by 3 people, and unfortunately it shows. I can't deny it's an impressive feat. Few could create such an experience,
//             but as I paid more for this than for some of my all-time favourite stories, I can't see such context as an excuse for rocks with poor
//             clipping and countless opportunities to get soft-locked in invisible walls. I think part of my negative perception in this regard stems
//             from TFC going for a "realistic" look, which beside being subjectively boring is hard to do well on a budget.
//             I genuinely think I would've liked the exact same game measurably more if it was styled as well as indies tend to be. But it's never about the visuals.
//             As long as the graphics are bearable, the story or concept can save a game in my eyes. What about them? Wobbly-wobbly, timey wimey loops in games are fun.
//             The Forgotten City's offer a unique take on conditions for how they end and what happens when they do. You have to literally fight for a way out!
//             This raises the stakes and makes it a bit more involved, but also leads to situations when immersion breaks and you see the good old "YOU ARE DEAD".
//             Though this does make some things possible, and feels almost necessary due to the premise - you get some, you lose some.
//             In general, I wasn't a fan of more floaty nature of loops`,
// 		],
// 	},
// };


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
		text: activeNote.blocks.map(item => item.content).join("<br>")
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
		if (noteBody) noteBody.textContent = selectedNote.blocks.map(item => item.content).join("<br>");

		document.querySelectorAll('[data-note-id]').forEach((el) => {
			el.classList.toggle('active', el.dataset.noteId === newNoteId);
		});
	};

	const sidebar = new Sidebar('sidebarContainer', state, (id) => updateUI(id));
	await sidebar.init();
}
