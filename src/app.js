import { router } from './route/router.js';

/**
 * Инициализирует приложение после загрузки DOM
 * @event DOMContentLoaded
 */
document.addEventListener('DOMContentLoaded', () => {
	router.init();
});
