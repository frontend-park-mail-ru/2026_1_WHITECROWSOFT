/**
 * Константы типов действий для формы
 * @enum {string}
 */
export const ActionTypes = {
	INPUT_CHANGE: 'INPUT_CHANGE',
	SUBMIT_START: 'SUBMIT_START',
	SUBMIT_END: 'SUBMIT_END',
	SUBMIT_ERROR: 'SUBMIT_ERROR',
	VALIDATION_ERROR: 'VALIDATION_ERROR',
	CLEAR_ERROR: 'CLEAR_ERROR',
};

/**
 * Создает набор экшенов для управления формой
 * @param {Object} store - хранилище состояния
 * @returns {Object} объект с экшенами формы
 */
export function createFormActions(store) {
	return {
		/**
		 * Обновляет значение поля формы
		 * @param {string} fieldName - имя поля
		 * @param {*} value - новое значение
		 */
		inputChange(fieldName, value) {
			const state = store.getState();
			store.setState({
				formData: { ...state.formData, [fieldName]: value },
				errors: state.errors?.[fieldName]
					? { ...state.errors, [fieldName]: null }
					: state.errors,
			});
		},

		/**
		 * Устанавливает состояние отправки формы
		 */
		submitStart() {
			store.setState({
				isSubmitting: true,
				serverError: '',
				errors: {},
			});
		},

		/**
		 * Завершает состояние отправки формы
		 */
		submitEnd() {
			store.setState({
				isSubmitting: false,
			});
		},

		/**
		 * Устанавливает ошибку сервера
		 * @param {string} message - сообщение об ошибке
		 */
		submitError(message) {
			store.setState({
				isSubmitting: false,
				serverError: message,
			});
		},

		/**
		 * Устанавливает ошибки валидации
		 * @param {Object} errors - объект с ошибками полей
		 */
		validationError(errors) {
			store.setState({
				isSubmitting: false,
				errors,
			});
		},

		/**
		 * Очищает ошибку конкретного поля
		 * @param {string} fieldName - имя поля
		 */
		clearError(fieldName) {
			const state = store.getState();
			if (state.errors?.[fieldName]) {
				const newErrors = { ...state.errors };
				delete newErrors[fieldName];
				store.setState({
					errors: newErrors,
				});
			}
		},
	};
}
