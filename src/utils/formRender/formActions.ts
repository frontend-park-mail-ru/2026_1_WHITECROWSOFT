import type { FormStore } from './formStore';

/**
 * Константы типов действий для формы
 */
export const ActionTypes = {
	INPUT_CHANGE: 'INPUT_CHANGE',
	SUBMIT_START: 'SUBMIT_START',
	SUBMIT_END: 'SUBMIT_END',
	SUBMIT_ERROR: 'SUBMIT_ERROR',
	VALIDATION_ERROR: 'VALIDATION_ERROR',
	CLEAR_ERROR: 'CLEAR_ERROR',
	TOGGLE_PASSWORD: 'TOGGLE_PASSWORD',
	TOGGLE_PASSWORD_CONFIRM: 'TOGGLE_PASSWORD_CONFIRM',
} as const;

export type ActionType = (typeof ActionTypes)[keyof typeof ActionTypes];

export interface FormActions {
	inputChange: (fieldName: string, value: string) => void;
	submitStart: () => void;
	submitEnd: () => void;
	submitError: (message: string) => void;
	validationError: (errors: Record<string, string>) => void;
	clearError: (fieldName: string) => void;
	togglePassword: (fieldName: 'password' | 'passwordConfirm') => void;
}

/**
 * Создает набор экшенов для управления формой
 * @param store - хранилище состояния
 * @returns объект с экшенами формы
 */
export function createFormActions(store: FormStore): FormActions {
	return {
		/**
		 * Обновляет значение поля формы
		 * @param fieldName - имя поля
		 * @param value - новое значение
		 */
		inputChange(fieldName: string, value: string): void {
			const state = store.getState();
			let newErrors: Record<string, string>;
			if (state.errors?.[fieldName]) {
				newErrors = { ...state.errors };
				delete newErrors[fieldName];
			} else {
				newErrors = state.errors || {};
			}

			store.setState({
				formData: { ...state.formData, [fieldName]: value },
				errors: newErrors,
			});
		},

		/**
		 * Устанавливает состояние отправки формы
		 */
		submitStart(): void {
			store.setState({
				isSubmitting: true,
				serverError: '',
				errors: {},
			});
		},

		/**
		 * Завершает состояние отправки формы
		 */
		submitEnd(): void {
			store.setState({
				isSubmitting: false,
			});
		},

		/**
		 * Устанавливает ошибку сервера
		 * @param message - сообщение об ошибке
		 */
		submitError(message: string): void {
			store.setState({
				isSubmitting: false,
				serverError: message,
			});
		},

		/**
		 * Устанавливает ошибки валидации
		 * @param errors - объект с ошибками полей
		 */
		validationError(errors: Record<string, string>): void {
			store.setState({
				isSubmitting: false,
				errors,
			});
		},

		/**
		 * Очищает ошибку конкретного поля
		 * @param fieldName - имя поля
		 */
		clearError(fieldName: string): void {
			const state = store.getState();
			if (state.errors?.[fieldName]) {
				const newErrors = { ...state.errors };
				delete newErrors[fieldName];
				store.setState({
					errors: newErrors,
				});
			}
		},

		/**
		 * Переключает видимость пароля
		 */
		togglePassword(fieldName: 'password' | 'passwordConfirm'): void {
			const state = store.getState();
			if (fieldName === 'password') {
				store.setState({
					showPassword: !state.showPassword,
				});
			} else if (fieldName === 'passwordConfirm') {
				store.setState({
					showPasswordConfirm: !state.showPasswordConfirm,
				});
			}
		},
	};
}
