import { render } from '../utils.js';

/**
 * Создает объект для управления представлением формы
 * @param {HTMLElement} container - DOM элемент контейнера
 * @param {Function} template - Handlebars шаблон формы
 * @returns {Object} объект с методами для работы с представлением
 */
export function createFormView(container, template) {
	let errorCache = null;

	/**
	 * Кэширует DOM элементы для отображения ошибок
	 * @private
	 * @returns {Object} объект с кэшированными элементами
	 */
	function cacheErrorElements() {
		const form = container.querySelector('form');
		if (!form) return { container: null, text: null, fields: new Map() };

		const errorContainer = form.querySelector('[data-error-container]');
		const errorText =
			errorContainer?.querySelector('[data-error-text]') || errorContainer;
		const fields = new Map();
		const inputs = form.querySelectorAll('input[name]');

		inputs.forEach((input) => {
			const name = input.name;
			const errorEl = form.querySelector(`[data-field-error="${name}"]`);
			fields.set(name, { input, error: errorEl });
		});

		return { container: errorContainer, text: errorText, fields };
	}

	/**
	 * Полностью рендерит форму с текущим состоянием
	 * @param {Object} state - состояние формы
	 */
	function renderFull(state) {
		if (!container) return;
		const html = template(state);
		render(container, html);
		errorCache = cacheErrorElements();
	}

	/**
	 * Отображает ошибки валидации и серверные ошибки
	 * @param {Object} [errors={}] - ошибки полей формы
	 * @param {string} [serverError=''] - серверная ошибка
	 */
	function renderErrors(errors = {}, serverError = '') {
		if (!errorCache) return;

		if (errorCache.container && errorCache.text) {
			if (serverError) {
				errorCache.text.textContent = serverError;
				errorCache.container.style.visibility = 'visible';
			} else {
				errorCache.text.textContent = '';
				errorCache.container.style.visibility = 'hidden';
			}
		}

		Object.entries(errors).forEach(([fieldName, message]) => {
			const field = errorCache.fields.get(fieldName);
			if (field) {
				field.input.classList.add('error');
				if (field.error) {
					field.error.textContent = message;
					field.error.style.visibility = 'visible';
				}
			}
		});

		errorCache.fields.forEach((field, fieldName) => {
			if (!errors[fieldName]) {
				field.input.classList.remove('error');
				if (field.error) {
					field.error.textContent = '';
					field.error.style.visibility = 'hidden';
				}
			}
		});
	}

	/**
	 * Возвращает кэш элементов ошибок
	 * @returns {Object|null} кэш элементов
	 */
	function getCache() {
		return errorCache;
	}

	/**
	 * Очищает контейнер и сбрасывает кэш
	 */
	function clear() {
		errorCache = null;
		if (container) container.innerHTML = '';
	}

	return { renderFull, renderErrors, getCache, clear };
}
