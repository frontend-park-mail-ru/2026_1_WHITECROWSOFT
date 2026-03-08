import Handlebars from 'handlebars';
import { Sidebar } from '../../components/sidebar/sidebar.js';
import { router } from '../../route/router.js';
import { authService } from '../../services/authService.js';
import { registerHelpers } from '../../utils/utils.js';
import './mainPage.css';

const mockData = {
	searchQuery: '',
	activeNav: 'library',
	activeNoteId: 'empty-note',
	notes: [
		{ id: 'projects', title: 'Projects', preview: '' },
		{ id: 'to-the-moon', title: 'To the Moon', preview: '' },
		{ id: 'finding-paradise', title: 'Finding Paradise', preview: '' },
		{ id: 'empty-note', title: 'Empty note', preview: '' },
		{ id: 'travels', title: 'Путешествия', preview: '' },
		{ id: 'extended-note', title: 'A note with an ext...', preview: '' },
		{ id: 'impostor-factory', title: 'Impostor Factory', preview: '' },
	],
	activeNote: {
		id: 'empty-note',
		title: 'Empty note',
		breadcrumb: 'Еще один набросок, сколько еще...',
		text: [
			`There is no game like Outer Wilds. That doesn't stop fans from search for the elusive Wilds-like.
            One game that keeps popping up is The Forgotten City. Being very fond of flying into the sun and eating burned marshmallows,
            I was intrigued to try another knowledge based game. I'd like to start by stating my expectations when I opened TFC. Because
            I feel this review, and my experience with the game at large, are in big part a result of them. When the internets sold me on The Forgotten City,
            I was painted an image of a knowledge-based time loop mystery with lots of philosophy set in the roman empire.
            A period drama whodunnit Outer Wilds meets The Talos Principle?! Count me in! My experience was shot through this lens, with expectations you might've not had.
            I usually begin reviews by talking about presentation. Alas, the graphics are often wonky and the mechanics are stiff.
            The NPC models are aggressively Bethesda-esque, and that's not a compliment. Part of game's fame comes from it starting life as a
            Skyrim mod made by 3 people, and unfortunately it shows. I can't deny it's an impressive feat. Few could create such an experience,
            but as I paid more for this than for some of my all-time favourite stories, I can't see such context as an excuse for rocks with poor
            clipping and countless opportunities to get soft-locked in invisible walls. I think part of my negative perception in this regard stems
            from TFC going for a "realistic" look, which beside being subjectively boring is hard to do well on a budget.
            I genuinely think I would've liked the exact same game measurably more if it was styled as well as indies tend to be. But it's never about the visuals.
            As long as the graphics are bearable, the story or concept can save a game in my eyes. What about them? Wobbly-wobbly, timey wimey loops in games are fun.
            The Forgotten City's offer a unique take on conditions for how they end and what happens when they do. You have to literally fight for a way out!
            This raises the stakes and makes it a bit more involved, but also leads to situations when immersion breaks and you see the good old "YOU ARE DEAD".
            Though this does make some things possible, and feels almost necessary due to the premise - you get some, you lose some.
            In general, I wasn't a fan of more floaty nature of loops`,
		],
	},
};

export async function initMainPage() {
	const user = await authService.checkAuth();
	if (!user) {
		router.replace('/signin');
		return;
	}

	registerHelpers();
	const response = await fetch('/pages/main/mainPage.hbs');
	const template = Handlebars.compile(await response.text());

	const app = document.querySelector('#app');
	if (!app) return;

	const state = { ...mockData };
	const html = template(state);
	app.innerHTML = html;

	const container = document.querySelector('.mainContainer');
	if (!container) return;

	const sidebar = new Sidebar('sidebar-thing', mockData);
	await sidebar.init();
}
