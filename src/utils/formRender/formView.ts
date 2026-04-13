import { render } from '../utils.js';

export interface ErrorCache {
	container: HTMLElement | null;
	text: HTMLElement | null;
	fields: Map<string, { input: HTMLInputElement; error: HTMLElement | null }>;
}

export interface FormView {
	renderFull: (state: any) => void;
	renderErrors: (errors: Record<string, string>, serverError?: string) => void;
	updatePasswordVisibility: (
		showPassword: boolean,
		showPasswordConfirm: boolean,
	) => void;
	getCache: () => ErrorCache | null;
	clear: () => void;
}

/**
 * Создает объект для управления представлением формы
 * @param container - DOM элемент контейнера
 * @param template - Handlebars шаблон формы
 * @returns объект с методами для работы с представлением
 */
export function createFormView(
	container: HTMLElement | null,
	template: HandlebarsTemplateDelegate,
): FormView {
	let errorCache: ErrorCache | null = null;

	/**
	 * Кэширует DOM элементы для отображения ошибок
	 * @returns объект с кэшированными элементами
	 */
	function cacheErrorElements(): ErrorCache | null {
		const form = container?.querySelector('form');
		if (!form) return null;

		const errorContainer = form.querySelector(
			'[data-error-container]',
		) as HTMLElement | null;
		const errorText =
			(errorContainer?.querySelector(
				'[data-error-text]',
			) as HTMLElement | null) || errorContainer;
		const fields = new Map<
			string,
			{ input: HTMLInputElement; error: HTMLElement | null }
		>();
		const inputs = form.querySelectorAll('input[name]');

		inputs.forEach((input) => {
			const element = input as HTMLInputElement;
			const name = element.name;
			const errorEl = form.querySelector(
				`[data-field-error="${name}"]`,
			) as HTMLElement | null;
			fields.set(name, { input: element, error: errorEl });
		});

		return { container: errorContainer, text: errorText, fields };
	}

	/**
	 * Полностью рендерит форму с текущим состоянием
	 * @param state - состояние формы
	 */
	function renderFull(state: any): void {
		if (!container) return;
		const html = template(state);
		render(container, html);
		errorCache = cacheErrorElements();
	}

	/**
	 * Отображает ошибки валидации и серверные ошибки
	 * @param errors - ошибки полей формы
	 * @param serverError - серверная ошибка
	 */
	function renderErrors(
		errors: Record<string, string> = {},
		serverError: string = '',
	): void {
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
			const field = errorCache!.fields.get(fieldName);
			if (field) {
				field.input.classList.add('input--error');
				if (field.error) {
					field.error.textContent = message;
					field.error.style.visibility = 'visible';
				}
			}
		});

		errorCache.fields.forEach((field, fieldName) => {
			if (!errors[fieldName]) {
				field.input.classList.remove('input--error');
				if (field.error) {
					field.error.textContent = '';
					field.error.style.visibility = 'hidden';
				}
			}
		});
	}

	function updatePasswordVisibility(
		showPassword: boolean,
		showPasswordConfirm: boolean,
	): void {
		const passwordInput = container?.querySelector(
			'input[name="password"]',
		) as HTMLInputElement | null;
		if (passwordInput) {
			passwordInput.type = showPassword ? 'text' : 'password';
			const wrapper = passwordInput.closest('.input__wrapper');
			const passwordToggle = wrapper?.querySelector(
				'[data-toggle-password]',
			) as HTMLElement | null;
			if (passwordToggle) {
				const eyeOpen = passwordToggle.querySelector(
					'.input__eyeIcon--open',
				) as HTMLElement | null;
				const eyeClosed = passwordToggle.querySelector(
					'.input__eyeIcon--closed',
				) as HTMLElement | null;
				if (eyeOpen && eyeClosed) {
					eyeOpen.style.display = showPassword ? 'none' : 'block';
					eyeClosed.style.display = showPassword ? 'block' : 'none';
				}
			}
		}

		const confirmInput = container?.querySelector(
			'input[name="passwordConfirm"]',
		) as HTMLInputElement | null;
		if (confirmInput) {
			confirmInput.type = showPasswordConfirm ? 'text' : 'password';
			const wrapper = confirmInput.closest('.input__wrapper');
			const confirmToggle = wrapper?.querySelector(
				'[data-toggle-password]',
			) as HTMLElement | null;
			if (confirmToggle) {
				const eyeOpen = confirmToggle.querySelector(
					'.input__eyeIcon--open',
				) as HTMLElement | null;
				const eyeClosed = confirmToggle.querySelector(
					'.input__eyeIcon--closed',
				) as HTMLElement | null;
				if (eyeOpen && eyeClosed) {
					eyeOpen.style.display = showPasswordConfirm ? 'none' : 'block';
					eyeClosed.style.display = showPasswordConfirm ? 'block' : 'none';
				}
			}
		}
	}

	/**
	 * Возвращает кэш элементов ошибок
	 * @returns кэш элементов
	 */
	function getCache(): ErrorCache | null {
		return errorCache;
	}

	/**
	 * Очищает контейнер и сбрасывает кэш
	 */
	function clear(): void {
		errorCache = null;
		if (container) container.innerHTML = '';
	}

	return {
		renderFull,
		renderErrors,
		updatePasswordVisibility,
		getCache,
		clear,
	};
}
