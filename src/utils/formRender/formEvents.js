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
			const input =
				button.parentElement.querySelector('input[name="password"]') ??
				button.parentElement.querySelector('input[name="passwordConfirm"]');
			const eyeOpen = button.querySelector('.eyeOpen');
			const eyeClosed = button.querySelector('.eyeClosed');

			if (input.type === 'password') {
				input.type = 'text';
				eyeOpen.style.display = 'none';
				eyeClosed.style.display = 'block';
			} else {
				input.type = 'password';
				eyeOpen.style.display = 'block';
				eyeClosed.style.display = 'none';
			}
		};
	}

    function redrawPasswordValidator(input) {
        const validatorContainer = input.parentElement.querySelector('[data-password-validator]');
        const password = input.value;
        const requirements = validatePasswordState(password);

        validatorContainer.innerHTML = `
            <ul class="validation-list">
                ${requirements.map(req => `
                    <li class="requirement">
                        <img src="/icons/${req.isMet ? 'req_yes' : 'req_no'}.svg" class="icon" />
                        
                        ${req.label}
                    </li>
                `).join('')}
            </ul>
        `;
    }

    function handlePasswordValidator(input) {
        // God, please forgive me for writing this function.
        // Exam in an hour, so...
        // const validatorContainer = input.parentElement.querySelector('[data-password-validator]');

        return (e) => redrawPasswordValidator(input);

    }

    function hidePasswordValidator(input) {
        return (e) => {
            const validatorContainer = input.parentElement.querySelector('[data-password-validator]');
            validatorContainer.style.display = "none";
        }
    }

    function showPasswordValidator(input) {
        return (e) => {
            const validatorContainer = input.parentElement.querySelector('[data-password-validator]');
            validatorContainer.style.display = "inline-block";
        }
    }

	/**
	 * Прикрепляет все обработчики событий к форме
	*/
	function attach() {
		const form = container?.querySelector('form');
		const toggleBtns = container?.querySelectorAll('[data-toggle-password]');
        const regPasses = container?.querySelectorAll('[data-registration-password]');
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
            redrawPasswordValidator(input)
            input.addEventListener('focus', showPasswordValidator(input))
            input.addEventListener('blur', hidePasswordValidator(input))
            input.addEventListener('input', handlePasswordValidator(input))
        })

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
