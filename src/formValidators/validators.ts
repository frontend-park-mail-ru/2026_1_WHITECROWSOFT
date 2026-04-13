/**
 * Требование к валидации
 */
export interface ValidationRequirement {
    id: string;
    label: string;
    error: string;
    isMet: boolean;
}

/**
 * Результат проверки пароля или имени
 */
export interface ValidationResult {
    isValid: boolean;
    error: string;
}

/**
 * Состояние валидации (массив требований)
 */
export type ValidationState = ValidationRequirement[];

/**
 * Создает результат валидации на основе массива требований
 * @param requirements - массив требований
 * @returns результат валидации
 */
function createValidator(requirements: ValidationRequirement[]): ValidationResult {
    const firstFail = requirements.find((r) => !r.isMet);
    return {
        isValid: !firstFail,
        error: firstFail?.error ?? '',
    };
}

/**
 * Возвращает состояние валидации имени пользователя
 * @param username - имя пользователя
 * @returns состояние валидации
 */
export function validateUsernameState(username: string = ''): ValidationState {
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
            id: 'maxLen',
            label: 'Максимальная длина имени',
            error: 'Максимальная длина имени - 60 символов',
            isMet: username.length <= 60,
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
 * @param username - имя пользователя
 * @returns результат валидации
 */
export function validateUsername(username: string = ''): ValidationResult {
    return createValidator(validateUsernameState(username));
}

/**
 * Возвращает состояние валидации пароля
 * @param password - пароль
 * @returns состояние валидации
 */
export function validatePasswordState(password: string = ''): ValidationState {
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
            label: 'Не содержит символы: /@;<>',
            error: 'Недопустимы символы: /@;<>',
            isMet: !/[\/@;<>]/.test(password),
        },
    ];
}

/**
 * Проверяет корректность пароля
 * @param password - пароль
 * @returns результат валидации
 */
export function validatePassword(password: string = ''): ValidationResult {
    return createValidator(validatePasswordState(password));
}

/**
 * Возвращает состояние валидации подтверждения пароля
 * @param password - пароль
 * @param passwordConfirm - подтверждение пароля
 * @returns состояние валидации
 */
export function validatePasswordConfirmState(password: string, passwordConfirm: string): ValidationState {
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
 * @param password - пароль
 * @param passwordConfirm - подтверждение пароля
 * @returns результат валидации
 */
export function validatePasswordConfirm(password: string, passwordConfirm: string): ValidationResult {
    return createValidator(validatePasswordConfirmState(password, passwordConfirm));
}
