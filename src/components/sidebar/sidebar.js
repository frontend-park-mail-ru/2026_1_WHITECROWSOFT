import Handlebars from 'handlebars';
import { router } from '../../route/router.js';
import { authService } from '../../services/authService.js';
import './sidebar.css';

export class Sidebar {
	constructor(containerSelector, initialState = {}) {
		this.container = document.getElementById(containerSelector);
		this.state = initialState;
		this.template = null;
	}

	async init() {
		const response = await fetch('/components/sidebar/sidebar.hbs');
		this.template = Handlebars.compile(await response.text());

		this.render();
	}

	render() {
		if (!this.template) return;
		this.container.innerHTML = this.template(this.state);
		this.bindEvents();
	}

	bindEvents() {
		const logoutBtn = document.getElementById('logoutBtn');
		if (logoutBtn) {
			logoutBtn.addEventListener('click', async () => {
				console.log('[MainPage] Logout clicked');
				try {
					await authService.logOut();
					console.log('[MainPage] signOut() completed');
					router.clearAuthCache();
					router.replace('/signin');
				} catch (err) {
					console.error('[MainPage] Logout error:', err);
					router.clearAuthCache();
					router.replace('/signin');
				}
			});
		}

		this.container.addEventListener('click', (e) => {
			const noteItem = e.target.closest('[data-note-id]');
			if (noteItem) {
				const noteId = noteItem.dataset.noteId;
				console.log('Note clicked:', noteId);
			}
		});
	}
}
