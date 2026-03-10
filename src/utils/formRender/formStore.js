/**
 * Создает хранилище для управления состоянием формы
 * @param {Object} initialState - начальное состояние формы
 * @returns {Object} объект хранилища с методами доступа и подписки
*/
export function createFormStore(initialState) {
	let state = { ...initialState };
	const listeners = new Set();

	/**
	 * Возвращает копию текущего состояния
	 * @returns {Object} текущее состояние
	*/
	function getState() {
		return { ...state };
	}

	/**
	 * Обновляет состояние и уведомляет подписанных на него обработчиков
	 * @param {Object} newState - новые значения для обновления
	*/
	function setState(newState) {
		state = { ...state, ...newState };
		listeners.forEach((listener) => listener(state));
	}

	/**
	 * Подписывает обработчик на изменения состояния
	 * @param {Function} listener - функция-обработчик
	 * @returns {Function} функция для отписки
	*/
	function subscribe(listener) {
		listeners.add(listener);
		return () => listeners.delete(listener);
	}

	/**
	 * Сбрасывает состояние к начальному
	*/
	function reset() {
		state = { ...initialState };
		listeners.forEach((listener) => listener(state));
	}

	return { getState, setState, subscribe, reset };
}
