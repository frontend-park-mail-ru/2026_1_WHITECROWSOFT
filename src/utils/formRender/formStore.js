export function createFormStore(initialState) {
	let state = { ...initialState };
	const listeners = new Set();

	function getState() {
		return { ...state };
	}

	function setState(newState) {
		state = { ...state, ...newState };
		listeners.forEach((listener) => listener(state));
	}

	function subscribe(listener) {
		listeners.add(listener);
		return () => listeners.delete(listener);
	}

	function reset() {
		state = { ...initialState };
		listeners.forEach((listener) => listener(state));
	}

	return { getState, setState, subscribe, reset };
}
