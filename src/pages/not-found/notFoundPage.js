import Handlebars from 'handlebars';
import { router } from '../../route/router.js';
import { registerHelpers, registerPartials } from '../../utils/utils.js';
import templateText from './notFoundPage.hbs?raw';

/**
 * Инициализирует страницу 404
 * @function initNotFoundPage
 */
export function initNotFoundPage() {
	registerHelpers();
	registerPartials();
	const template = Handlebars.compile(templateText);
	const app = document.querySelector('#app');
	if (!app) {
		return;
	}
	app.innerHTML = template({});
	attachEvents(app);
}

/**
 * Навешивает обработчики событий
 * @param {HTMLElement} app - контейнер страницы
 */
function attachEvents(app) {
	app.addEventListener('click', (e) => {
		const link = e.target.closest('[data-link]');
		if (link) {
			e.preventDefault();
			const target = link.dataset.link;
			if (target === 'home') {
				router.push('/');
			}
		}
	});
}
