import type { FormState } from '@/types.js';
import { createFormActions } from './formActions.js';
import { createFormEvents } from './formEvents.js';
import { createFormStore, type FormStore } from './formStore.js';
import { createFormView, type FormView } from './formView.js';

export interface FormRendererConfig {
	containerSelector: string;
	template: HandlebarsTemplateDelegate;
	initialState: FormState;
	validate: (formData: Record<string, unknown>) => Record<string, string>;
	onSubmit: (formData: Record<string, unknown>) => Promise<void>;
	onSuccess?: () => void;
	onNavigate?: (path: string) => void;
}

export interface FormRenderer {
	init: () => void;
	destroy: () => void;
	getState: () => FormState | undefined;
	dispatch: (type: string, payload?: unknown) => void;
}

/**
 * Создает рендерер формы с состоянием, экшенами, событиями и представлением
 * @param config - конфигурация формы
 * @returns объект для управления формой
 */
export function createFormRenderer(config: FormRendererConfig): FormRenderer {
	const {
		containerSelector,
		template,
		initialState,
		validate,
		onSubmit,
		onSuccess,
		onNavigate,
	} = config;

	let container: HTMLElement | null = null;
	let store: FormStore | null = null;
	let actions: ReturnType<typeof createFormActions> | null = null;
	let view: FormView | null = null;
	let events: ReturnType<typeof createFormEvents> | null = null;
	let unsubscribe: (() => void) | null = null;

	/**
	 * Инициализирует форму и все её компоненты
	 */
	function init(): void {
		container = document.querySelector(containerSelector);
		if (!container) return;

		store = createFormStore(initialState);
		actions = createFormActions(store);
		view = createFormView(container, template);
		events = createFormEvents(container, actions, {
			getState: () => store!.getState(),
			validate,
			onSubmit,
			onSuccess,
			onNavigate,
		});

		view.renderFull(store.getState());
		events.attach();

		unsubscribe = store.subscribe((state: FormState) => {
			view!.renderErrors(state.errors, state.serverError);
			view!.updatePasswordVisibility(
				state.showPassword ?? false,
				state.showPasswordConfirm ?? false,
			);
			if (state.isSubmitting) {
				view!.renderFull(state);
				events!.attach();
			}
		});
	}

	/**
	 * Уничтожает форму и очищает все подписки и обработчики
	 */
	function destroy(): void {
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
	 * @returns состояние формы
	 */
	function getState(): FormState | undefined {
		return store?.getState();
	}

	/**
	 * Отправляет действие (для отладки)
	 * @param type - тип действия
	 * @param payload - данные действия
	 */
	function dispatch(type: string, payload?: unknown): void {
		console.log(`[Dispatch] ${type}`, payload);
	}

	return { init, destroy, getState, dispatch };
}
