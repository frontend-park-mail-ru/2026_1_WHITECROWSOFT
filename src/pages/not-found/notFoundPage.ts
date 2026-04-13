import Handlebars from 'handlebars';
import { router } from '../../route/router.js';
import { registerHelpers, registerPartials } from '../../utils/utils.js';
import templateText from './notFoundPage.hbs?raw';

/**
 * Инициализирует страницу 404
 */
export function initNotFoundPage(): void {
    registerHelpers();
    registerPartials();
    const template = Handlebars.compile(templateText);
    const app = document.querySelector('#app') as HTMLElement | null;
    if (!app) {
        return;
    }
    app.innerHTML = template({});
    attachEvents(app);
}

/**
 * Навешивает обработчики событий
 * @param app - контейнер страницы
 */
function attachEvents(app: HTMLElement): void {
    app.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const link = target.closest('[data-link]') as HTMLElement | null;
        if (link) {
            e.preventDefault();
            const targetLink = link.dataset.link;
            if (targetLink === 'home') {
                router.push('/');
            }
        }
    });
}
