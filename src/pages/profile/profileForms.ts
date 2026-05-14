import { handleAuthError } from '../../utils/handleAuthError.js';

interface FormSubmitHandler {
	(formData: Record<string, unknown>): Promise<unknown>;
}

interface SuccessCallback {
	(result?: unknown): void;
}

interface SubmitResult {
	message?: string;
}

/**
 * Настраивает обработчик для обычной формы
 */
export function setupForm(
	formId: string,
	onSubmit: FormSubmitHandler,
	onSuccess?: SuccessCallback,
): void {
	const form = document.getElementById(formId) as HTMLFormElement | null;
	if (!form) return;
	form.addEventListener('submit', async (e: Event) => {
		e.preventDefault();
		await handleSubmit(form, onSubmit, onSuccess);
	});
}

/**
 * Сбор данных формы
 */
function collectFormData(form: HTMLFormElement): Record<string, unknown> {
	const data: Record<string, unknown> = {};
	const inputs = form.querySelectorAll('input[name]');
	inputs.forEach((input) => {
		const el = input as HTMLInputElement;
		if (el.type !== 'file') {
			data[el.name] = el.value;
		}
	});
	return data;
}

/**
 * Управление состоянием кнопки
 */
function setLoading(
	button: HTMLButtonElement | null,
	loading: boolean,
	originalText?: string,
): void {
	if (!button) return;
	button.disabled = loading;
	if (loading) {
		button.dataset.originalText = button.textContent || '';
		button.textContent = 'Загрузка...';
	} else if (originalText || button.dataset.originalText) {
		button.textContent = originalText || button.dataset.originalText || '';
	}
}

/**
 * Показ ошибки в форме
 */
function showFormError(form: HTMLFormElement, message: string): void {
	const errorEl = form.querySelector(
		'[data-field-error]',
	) as HTMLElement | null;
	if (errorEl) {
		errorEl.textContent = message;
		errorEl.style.visibility = 'visible';
	}
	const firstInput = form.querySelector('input') as HTMLInputElement | null;
	firstInput?.classList.add('input--error');
}

/**
 * Очистка ошибок формы
 */
function clearFormErrors(form: HTMLFormElement): void {
	const errorEls = form.querySelectorAll('[data-field-error]');
	errorEls.forEach((el) => {
		const element = el as HTMLElement;
		element.textContent = '';
		element.style.visibility = 'hidden';
	});
	const inputs = form.querySelectorAll('input');
	inputs.forEach((input) => {
		input.classList.remove('input--error');
	});
}

/**
 * Универсальная логика отправки формы
 */
async function handleSubmit(
	form: HTMLFormElement,
	onSubmit: FormSubmitHandler,
	onSuccess?: SuccessCallback,
): Promise<void> {
	const submitBtn = form.querySelector(
		'[type="submit"]',
	) as HTMLButtonElement | null;
	const originalText = submitBtn?.textContent;
	setLoading(submitBtn, true);
	try {
		const formData = collectFormData(form);
		const result = (await onSubmit(formData)) as SubmitResult | undefined;
		if (onSuccess) onSuccess(result);
		clearFormErrors(form);
	} catch (error) {
		if (handleAuthError(error)) return;
		const err = error as { data?: { error?: string }; message?: string };
		showFormError(form, err?.data?.error || err?.message || 'Ошибка');
	} finally {
		setLoading(submitBtn, false, originalText);
	}
}
