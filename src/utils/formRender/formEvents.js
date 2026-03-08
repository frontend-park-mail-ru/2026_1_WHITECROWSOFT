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

	function attach() {
		const form = container?.querySelector('form');
		if (!form) {
			return;
		}

		cleanup?.();
		form.addEventListener('input', handleInput);
		form.addEventListener('submit', handleSubmit);
		container?.addEventListener('click', handleNavigation);
		cleanup = () => {
			form.removeEventListener('input', handleInput);
			form.removeEventListener('submit', handleSubmit);
			container?.removeEventListener('click', handleNavigation);
		};
	}

	function detach() {
		cleanup?.();
	}

	return { attach, detach };
}
