export const ActionTypes = {
	INPUT_CHANGE: 'INPUT_CHANGE',
	SUBMIT_START: 'SUBMIT_START',
	SUBMIT_END: 'SUBMIT_END',
	SUBMIT_ERROR: 'SUBMIT_ERROR',
	VALIDATION_ERROR: 'VALIDATION_ERROR',
	CLEAR_ERROR: 'CLEAR_ERROR',
};

export function createFormActions(store) {
	return {
		inputChange(fieldName, value) {
			const state = store.getState();
			store.setState({
				formData: { ...state.formData, [fieldName]: value },
				errors: state.errors?.[fieldName]
					? { ...state.errors, [fieldName]: null }
					: state.errors,
			});
		},

		submitStart() {
			store.setState({
				isSubmitting: true,
				serverError: '',
				errors: {},
			});
		},

		submitEnd() {
			store.setState({
				isSubmitting: false,
			});
		},

		submitError(message) {
			store.setState({
				isSubmitting: false,
				serverError: message,
			});
		},

		validationError(errors) {
			store.setState({
				isSubmitting: false,
				errors,
			});
		},

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
