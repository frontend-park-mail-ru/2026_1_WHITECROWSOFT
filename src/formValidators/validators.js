export function validateUsername(username) {
	if (!username) {
		return {
			isValid: false,
			error: 'Имя пользователя обязательно',
		};
	}

	if (!/^[a-zA-Zа-яА-Я0-9_]+$/.test(username)) {
		return {
			isValid: false,
			error: 'Имя польхователя может содержать только буквы, цифры и _',
		};
	}

	return {
		isValid: true,
		error: '',
	};
}

export function validatePassword(password) {
	if (!password) {
		return {
			isValid: false,
			error: 'Пароль обязателен',
		};
	}

	if (password.length < 4) {
		return {
			isValid: false,
			error: 'Пароль должен быть минимум 4 символа',
		};
	}

	if (!/\d/.test(password)) {
		return {
			isValid: false,
			error: 'Нужна хотя бы одна заглавная буква и цифра',
		};
	}

	if (!/[A-ZА-Я]/.test(password)) {
		return {
			isValid: false,
			error: 'Нужна хотя бы одна заглавная буква и цифра',
		};
	}

	return {
		isValid: true,
		error: '',
	};
}

export function validatePasswordConfirm(password, passwordConfirm) {
	if (!passwordConfirm) {
		return {
			isValid: false,
			error: 'Подтвердите пароль',
		};
	}
	if (password !== passwordConfirm) {
		return {
			isValid: false,
			error: 'Пароли не совпадают',
		};
	}
	return {
		isValid: true,
		error: '',
	};
}
