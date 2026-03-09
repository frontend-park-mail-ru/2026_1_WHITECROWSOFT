export function createFormEvents(container, actions, handlers) {
	let cleanup = null;

	function handleInput(e) {
		const input = e.target.closest('input');
		if (!input?.name) return;
		actions.inputChange?.(input.name, input.value);
	}

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
		} catch (error) {
			const message = error?.data?.error || error?.message || 'Ошибка';
			actions.submitError(message);
		}

		actions.submitEnd();
		if (handlers.onSuccess) {
			handlers.onSuccess();
		}
	}

	function handleNavigation(e) {
		const link = e.target.closest('[data-link]');
		if (link) {
			e.preventDefault();
			handlers.onNavigate?.(link.dataset.link);
		}
	}

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

	function attach() {
		const form = container?.querySelector('form');
		const toggleBtns = container?.querySelectorAll('[data-toggle-password]');
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
		cleanup = () => {
			form.removeEventListener('input', handleInput);
			form.removeEventListener('submit', handleSubmit);
			container?.removeEventListener('click', handleNavigation);
			toggleBtns?.forEach((btn) => {
				btn.removeEventListener('click', handlePasswordVisibility(btn));
			});
		};
	}

	function detach() {
		cleanup?.();
	}

	return { attach, detach };
}
