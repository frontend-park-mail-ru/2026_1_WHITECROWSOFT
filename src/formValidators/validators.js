/**
 * Требование к валидации
 * @typedef {Object} ValidationRequirement
 * @property {string} id - уникальный идентификатор
 * @property {string} label - описание
 * @property {string} error - сообщение ошибки при невыполнении
 * @property {boolean} isMet - выполняется ли требование
 */

/**
 * Результат проверки пароля или имени
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - валиден
 * @property {string} error - ошибка, если таковая присутствует
 */

/**
 * Состояние валидации
 * @typedef {Object} ValidationState
 * @property {ValidationRequirement[]} requirements - статусы требований
 */

/**
 * Создает результат валидации на основе массива требований
 * @private
 * @param {ValidationRequirement[]} requirements - массив требований
 * @returns {ValidationResult} результат валидации
 */
function createValidator(requirements) {
	const firstFail = requirements.find((r) => !r.isMet);
	return {
		isValid: !firstFail,
		error: firstFail?.error ?? '',
	};
}

/**
 * Возвращает состояние валидации имени пользователя
 * @param {string} [username=''] - имя пользователя
 * @returns {ValidationState} состояние валидации
 */
export function validateUsernameState(username = '') {
	return [
		{
			id: 'required',
			label: 'Имя пользователя обязательно',
			error: 'Имя пользователя обязательно',
			isMet: username.length > 0,
		},
		{
			id: 'minLen',
			label: 'Минимальная длина имени',
			error: 'Минимальная длина имени - 4 символа',
			isMet: username.length >= 4,
		},
		{
			id: 'minLen',
			label: 'Максимальная длина имени',
			error: 'Максимальная длина имени- 60 символа',
			isMet: username.length < 60,
		},
		{
			id: 'chars',
			label: 'Только буквы, цифры и .-_',
			error: 'В имени могут быть только буквы, цифры и .-_',
			isMet: /^[a-zA-Zа-яА-Я0-9._-]+$/.test(username),
		},
	];
}

/**
 * Проверяет корректность имени пользователя
 * @param {string} [username=''] - имя пользователя
 * @returns {ValidationResult} результат валидации
 */
export function validateUsername(username = '') {
	return createValidator(validateUsernameState(username));
}

/**
 * Возвращает состояние валидации пароля
 * @param {string} [password=''] - пароль
 * @returns {ValidationState} состояние валидации
 */
export function validatePasswordState(password = '') {
	return [
		{
			id: 'min_length',
			label: 'Минимум 4 символа',
			error: 'Пароль должен быть минимум 4 символа',
			isMet: password.length >= 4,
		},
		{
			id: 'has_digit',
			label: 'Хотя бы одна цифра',
			error: 'Нужна хотя бы одна цифра',
			isMet: /\d/.test(password),
		},
		{
			id: 'has_uppercase',
			label: 'Хотя бы одна заглавная буква',
			error: 'Нужна хотя бы одна заглавная буква',
			isMet: /[A-ZА-Я]/.test(password),
		},
		{
			id: 'no_special',
			label: 'Не содержит спецсимволы',
			error: 'Недопустимы символы: /@;<>',
			isMet: !/[///@;<>]/.test(password),
		},
	];
}

/**
 * Проверяет корректность пароля
 * @param {string} [password=''] - пароль
 * @returns {ValidationResult} результат валидации
 */
export function validatePassword(password = '') {
	return createValidator(validatePasswordState(password));
}

/**
 * Возвращает состояние валидации подтверждения пароля
 * @param {string} password - пароль
 * @param {string} passwordConfirm - подтверждение пароля
 * @returns {ValidationState} состояние валидации
 */
export function validatePasswordConfirmState(password, passwordConfirm) {
	return [
		{
			id: 'exists',
			label: 'Подтверждение пароля',
			error: 'Подтвердите пароль',
			isMet: passwordConfirm.length > 0,
		},
		{
			id: 'match',
			label: 'Пароли совпадают',
			error: 'Пароли не совпадают',
			isMet: password === passwordConfirm,
		},
	];
}

/**
 * Проверяет совпадение пароля и подтверждения
 * @param {string} password - пароль
 * @param {string} passwordConfirm - подтверждение пароля
 * @returns {ValidationResult} результат валидации
 */
export function validatePasswordConfirm(password, passwordConfirm) {
	return createValidator(
		validatePasswordConfirmState(password, passwordConfirm),
	);
}
