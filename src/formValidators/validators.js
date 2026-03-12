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
 * Возвращает состояние валидации имени пользователя
 * @param {string} username - имя пользователя
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
			id: 'chars',
			label: 'Только буквы, цифры и _',
			error: 'В имени могут быть только буквы, цифры и _',
			isMet: /^[a-zA-Zа-яА-Я0-9_]+$/.test(username),
		},
	];
}

/**
 * Проверяет корректность имени пользователя
 * @param {string} username - имя пользователя
 * @returns {ValidationResult} результат валидации
 */
export function validateUsername(username) {
	const requirements = validateUsernameState(username);
	const firstFail = requirements.find((r) => !r.isMet);
	if (firstFail === undefined) {
		return {
			isValid: true,
			error: '',
		};
	}
	return {
		isValid: false,
		error: firstFail.error,
	};
}

/**
 * Возвращает состояние валидации пароля
 * @param {string} password - пароль
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
			error: 'Пароль не должен содержать символы: !@#$%^&*()<>.,!?;:[]]{}',
			isMet: !/[!@#$%^&*()<>.,!?;:\[\]{}]/.test(password),
		},
	];
}

/**
 * Проверяет корректность пароля
 * @param {string} password - пароль
 * @returns {ValidationResult} результат валидации
 */
export function validatePassword(password = '') {
	const requirements = validatePasswordState(password);
	const firstFail = requirements.find((r) => !r.isMet);
	if (firstFail === undefined) {
		return {
			isValid: true,
			error: '',
		};
	}
	return {
		isValid: false,
		error: firstFail.error,
	};
}

/**
 * Проверяет совпадение пароля и подтверждения
 * @param {string} password - пароль
 * @param {string} passwordConfirm - подтверждение пароля
 * @returns {ValidationResult} результат валидации
 */
export function validatePasswordConfirm(password, passwordConfirm) {
	const requirements = [
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

	const firstFail = requirements.find((r) => !r.isMet);
	if (firstFail === undefined) {
		return {
			isValid: true,
			error: '',
		};
	}
	return {
		isValid: false,
		error: firstFail.error,
	};
}
