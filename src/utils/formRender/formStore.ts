import type { FormState } from '@/types';

export interface FormStore {
	getState: () => FormState;
	setState: (newState: Partial<FormState>) => void;
	subscribe: (listener: (state: FormState) => void) => () => void;
	reset: () => void;
}

type Listener = (state: FormState) => void;

/**
 * Создает хранилище для управления состоянием формы
 * @param initialState - начальное состояние формы
 * @returns объект хранилища с методами доступа и подписки
 */
export function createFormStore(initialState: FormState): FormStore {
	let state: FormState = { ...initialState };
	const listeners = new Set<Listener>();

	/**
	 * Возвращает копию текущего состояния
	 * @returns текущее состояние
	 */
	function getState(): FormState {
		return { ...state };
	}

	/**
	 * Обновляет состояние и уведомляет подписанных на него обработчиков
	 * @param newState - новые значения для обновления
	 */
	function setState(newState: Partial<FormState>): void {
		state = { ...state, ...newState };
		listeners.forEach((listener) => listener(state));
	}

	/**
	 * Подписывает обработчик на изменения состояния
	 * @param listener - функция-обработчик
	 * @returns функция для отписки
	 */
	function subscribe(listener: Listener): () => void {
		listeners.add(listener);
		return () => listeners.delete(listener);
	}

	/**
	 * Сбрасывает состояние к начальному
	 */
	function reset(): void {
		state = { ...initialState };
		listeners.forEach((listener) => listener(state));
	}

	return { getState, setState, subscribe, reset };
}
