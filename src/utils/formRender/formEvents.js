import Handlebars from 'handlebars';
import { validatePasswordState } from '../../formValidators/validators';

/**
 * Создает объект с методами для управления событиями формы
 * @param {HTMLElement} container - DOM элемент контейнера формы
 * @param {Object} actions - экшены для обновления состояния
 * @param {Object} handlers - обработчики формы (валидация, отправка, навигация)
 * @returns {Object} объект с методами attach и detach
 */
export function createFormEvents(container, actions, handlers) {
	let cleanup = null;

	/**
	 * Обрабатывает изменение полей ввода
	 * @param {Event} e - событие input
	 */
	function handleInput(e) {
		const input = e.target.closest('input');
		if (!input?.name) return;
		actions.inputChange?.(input.name, input.value);
	}

	/**
	 * Обрабатывает отправку формы
	 * @param {Event} e - событие submit
	 */
	async function handleSubmit(e) {
		e.preventDefault();
		actions.submitStart();
		const state = handlers.getState();

		const errors = handlers.validate(state.formData);
		if (Object.keys(errors).length > 0) {
			actions.validationError(errors);
			return;
		}

		try {
			await handlers.onSubmit(state.formData);
			actions.submitEnd();
			if (handlers.onSuccess) {
				handlers.onSuccess();
			}
		} catch (error) {
			const message = error?.data?.error || error?.message || 'Ошибка';
			actions.submitError(message);
		}
	}

	/**
	 * Обрабатывает клики по ссылкам навигации
	 * @param {Event} e - событие click
	 */
	function handleNavigation(e) {
		const link = e.target.closest('[data-link]');
		if (link) {
			e.preventDefault();
			handlers.onNavigate?.(link.dataset.link);
		}
	}

	/**
	 * Создает обработчик для кнопки показа/скрытия пароля
	 * @param {HTMLElement} button - кнопка переключения
	 * @returns {Function} обработчик клика
	 */
	function handlePasswordVisibility(button) {
		return (e) => {
			e.preventDefault();
			const input = button.parentElement.querySelector('input[name="password"]') || 
					      button.parentElement.querySelector('input[name="passwordConfirm"]');
			if (input) {
				actions.togglePassword(input.name);
			}
		};
	}

	function redrawPasswordValidator(input) {
		const validatorContainer = input.parentElement.querySelector(
			'[data-password-validator]',
		);
		const password = input.value;
		const requirements = validatePasswordState(password);

		const partial = Handlebars.partials['components/partials/forms/validator'];
		const template =
			typeof partial === 'function' ? partial : Handlebars.compile(partial);
		const context = { requirements: requirements };
		validatorContainer.innerHTML = template(context);
	}

	function handlePasswordValidator(input) {
		return () => redrawPasswordValidator(input);
	}

	function hidePasswordValidator(input) {
		return () => {
			const validatorContainer = input.parentElement.querySelector(
				'[data-password-validator]',
			);
			validatorContainer.style.display = 'none';
		};
	}

	function showPasswordValidator(input) {
		return () => {
			const validatorContainer = input.parentElement.querySelector(
				'[data-password-validator]',
			);
			validatorContainer.style.display = 'block';
		};
	}

	/**
	 * Прикрепляет все обработчики событий к форме
	 */
	function attach() {
		const form = container?.querySelector('form');
		const toggleBtns = container?.querySelectorAll('[data-toggle-password]');
		const regPasses = container?.querySelectorAll(
			'[data-registration-password]',
		);
		if (!form) {
			return;
		}

		cleanup?.();
		form.addEventListener('input', handleInput);
		form.addEventListener('submit', handleSubmit);
		container?.addEventListener('click', handleNavigation);
		toggleBtns?.forEach((btn) => {
			btn.addEventListener('click', handlePasswordVisibility(btn));
		});
		regPasses?.forEach((input) => {
			redrawPasswordValidator(input);
			input.addEventListener('focus', showPasswordValidator(input));
			input.addEventListener('blur', hidePasswordValidator(input));
			input.addEventListener('input', handlePasswordValidator(input));
		});

		cleanup = () => {
			form.removeEventListener('input', handleInput);
			form.removeEventListener('submit', handleSubmit);
			container?.removeEventListener('click', handleNavigation);
			toggleBtns?.forEach((btn) => {
				btn.removeEventListener('click', handlePasswordVisibility(btn));
			});
		};
	}

	/**
	 * Открепляет все обработчики событий
	 */
	function detach() {
		cleanup?.();
	}

	return { attach, detach };
}
