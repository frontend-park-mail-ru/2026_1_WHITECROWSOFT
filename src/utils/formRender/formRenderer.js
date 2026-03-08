import { createFormActions } from './formActions.js';
import { createFormEvents } from './formEvents.js';
import { createFormStore } from './formStore.js';
import { createFormView } from './formView.js';

export function createFormRenderer(config) {
	const {
		containerSelector,
		template,
		initialState,
		validate,
		onSubmit,
		onSuccess,
		onNavigate,
	} = config;

	let container = null;
	let store = null;
	let actions = null;
	let view = null;
	let events = null;
	let unsubscribe = null;

	function init() {
		container = document.querySelector(containerSelector);
		if (!container) {
			return;
		}

		store = createFormStore(initialState);
		actions = createFormActions(store);
		view = createFormView(container, template);
		events = createFormEvents(container, actions, {
			getState: () => store.getState(),
			validate,
			onSubmit,
			onSuccess,
			onNavigate,
		});

		view.renderFull(store.getState());
		events.attach();

		unsubscribe = store.subscribe((state) => {
			view.renderErrors(state.errors, state.serverError);
			if (state.isSubmitting) {
				view.renderFull(state);
				events.attach();
			}
		});
	}

	function destroy() {
		unsubscribe?.();
		events?.detach();
		view?.clear();
		store = null;
		actions = null;
		view = null;
		events = null;
		unsubscribe = null;
	}

	function getState() {
		return store?.getState();
	}

	function dispatch(type, payload) {
		console.log(`[Dispatch] ${type}`, payload);
	}

	return { init, destroy, getState, dispatch };
}
