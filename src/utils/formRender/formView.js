import { render } from '../utils.js';

export function createFormView(container, template) {
	let errorCache = null;

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

	function renderFull(state) {
		if (!container) return;
		const html = template(state);
		render(container, html);
		errorCache = cacheErrorElements();
	}

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

	function getCache() {
		return errorCache;
	}

	function clear() {
		errorCache = null;
		if (container) container.innerHTML = '';
	}

	return { renderFull, renderErrors, getCache, clear };
}
