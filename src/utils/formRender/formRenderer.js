import { createFormActions } from './formActions.js';
import { createFormEvents } from './formEvents.js';
import { createFormStore } from './formStore.js';
import { createFormView } from './formView.js';

/**
 * Создает рендерер формы с состоянием, экшенами, событиями и представлением
 * @param {Object} config - конфигурация формы
 * @param {string} config.containerSelector - CSS селектор контейнера
 * @param {Function} config.template - Handlebars шаблон формы
 * @param {Object} config.initialState - начальное состояние формы
 * @param {Function} config.validate - функция валидации формы
 * @param {Function} config.onSubmit - функция отправки данных
 * @param {Function} config.onSuccess - колбэк при успешной отправке
 * @param {Function} config.onNavigate - колбэк для навигации
 * @returns {Object} объект для управления формой
*/
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

	/**
	 * Инициализирует форму и все её компоненты
	*/
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

	/**
	 * Уничтожает форму и очищает все подписки и обработчики
	*/
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

	/**
	 * Возвращает текущее состояние формы
	 * @returns {Object} состояние формы
	*/
	function getState() {
		return store?.getState();
	}

	/**
	 * Отправляет действие (для отладки)
	 * @param {string} type - тип действия
	 * @param {*} payload - данные действия
	*/
	function dispatch(type, payload) {
		console.log(`[Dispatch] ${type}`, payload);
	}

	return { init, destroy, getState, dispatch };
}
