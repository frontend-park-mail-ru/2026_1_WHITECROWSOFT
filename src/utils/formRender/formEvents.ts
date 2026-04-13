import Handlebars from 'handlebars';
import { validatePasswordState } from '../../formValidators/validators.js';
import type { FormActions } from './formActions.js';
import type { FormState } from '@/types.js';

interface FormHandlers {
    getState: () => FormState;
    validate: (formData: Record<string, unknown>) => Record<string, string>;
    onSubmit: (formData: Record<string, unknown>) => Promise<void>;
    onSuccess?: () => void;
    onNavigate?: (path: string) => void;
}

interface FormEvents {
    attach: () => void;
    detach: () => void;
}

type CleanupFunction = () => void;

/**
 * Создает объект с методами для управления событиями формы
 * @param container - DOM элемент контейнера формы
 * @param actions - экшены для обновления состояния
 * @param handlers - обработчики формы (валидация, отправка, навигация)
 * @returns объект с методами attach и detach
 */
export function createFormEvents(
    container: HTMLElement | null,
    actions: FormActions,
    handlers: FormHandlers
): FormEvents {
    let cleanup: CleanupFunction | null = null;

    /**
     * Обрабатывает изменение полей ввода
     * @param e - событие input
     */
    function handleInput(e: Event): void {
        const target = e.target as HTMLElement;
        const input = target.closest('input') as HTMLInputElement | null;
        if (!input?.name) return;
        actions.inputChange?.(input.name, input.value);
    }

    /**
     * Обрабатывает отправку формы
     * @param e - событие submit
     */
    async function handleSubmit(e: Event): Promise<void> {
        e.preventDefault();
        actions.submitStart();
        const state = handlers.getState();

        const errors = handlers.validate(state.formData);
        if (Object.keys(errors).length > 0) {
            actions.validationError(errors);
            return;
        }

        try {
            await handlers.onSubmit(state.formData);
            actions.submitEnd();
            handlers.onSuccess?.();
        } catch (error) {
            const err = error as { data?: { error?: string }; message?: string };
            const message = err?.data?.error || err?.message || 'Ошибка';
            actions.submitError(message);
        }
    }

    /**
     * Обрабатывает клики по ссылкам навигации
     * @param e - событие click
     */
    function handleNavigation(e: Event): void {
        const target = e.target as HTMLElement;
        const link = target.closest('[data-link]') as HTMLElement | null;
        if (link) {
            e.preventDefault();
            const path = link.dataset.link;
            if (path) {
                handlers.onNavigate?.(path);
            }
        }
    }

    /**
     * Создает обработчик для кнопки показа/скрытия пароля
     * @param button - кнопка переключения
     * @returns обработчик клика
     */
    function handlePasswordVisibility(button: HTMLElement): (e: Event) => void {
        return (e: Event): void => {
            e.preventDefault();
            const wrapper = button.parentElement;
            const input = wrapper?.querySelector('input[name="password"]') as HTMLInputElement | null;
            const confirmInput = wrapper?.querySelector('input[name="passwordConfirm"]') as HTMLInputElement | null;
            const targetInput = input || confirmInput;
            if (targetInput) {
                actions.togglePassword(targetInput.name as 'password' | 'passwordConfirm');
            }
        };
    }

    /**
     * Обновляет отображение валидатора пароля на основе текущего значения поля
     * @param input - Поле ввода пароля
     */
    function redrawPasswordValidator(input: HTMLInputElement): void {
        const validatorContainer = input.parentElement?.querySelector('[data-password-validator]') as HTMLElement | null;
        if (!validatorContainer) return;
        
        const password = input.value;
        const requirements = validatePasswordState(password);

        const partial = Handlebars.partials['components/partials/forms/validator'];
        const template = typeof partial === 'function' ? partial : Handlebars.compile(partial as string);
        const context = { requirements };
        validatorContainer.innerHTML = template(context);
    }

    /**
     * Создает функцию-обработчик для обновления валидатора пароля
     * @param input - Поле ввода пароля
     * @returns Функция, вызывающая redrawPasswordValidator с переданным input
     */
    function handlePasswordValidator(input: HTMLInputElement): () => void {
        return () => redrawPasswordValidator(input);
    }

    /**
     * Создает функцию для скрытия валидатора пароля
     * @param input - Поле ввода пароля
     * @returns Функция, скрывающая валидатор
     */
    function hidePasswordValidator(input: HTMLInputElement): () => void {
        return () => {
            const validatorContainer = input.parentElement?.querySelector('[data-password-validator]') as HTMLElement | null;
            if (validatorContainer) {
                validatorContainer.style.display = 'none';
            }
        };
    }

    /**
     * Создает функцию для отображения валидатора пароля
     * @param input - Поле ввода пароля
     * @returns Функция, показывающая валидатор
     */
    function showPasswordValidator(input: HTMLInputElement): () => void {
        return () => {
            const validatorContainer = input.parentElement?.querySelector('[data-password-validator]') as HTMLElement | null;
            if (validatorContainer) {
                validatorContainer.style.display = 'block';
            }
        };
    }

    /**
     * Прикрепляет все обработчики событий к форме
     */
    function attach(): void {
        const form = container?.querySelector('form');
        const toggleBtns = container?.querySelectorAll('[data-toggle-password]');
        const regPasses = container?.querySelectorAll('[data-registration-password]');
        
        if (!form) return;

        cleanup?.();
        
        form.addEventListener('input', handleInput);
        form.addEventListener('submit', handleSubmit);
        container?.addEventListener('click', handleNavigation);
        
        toggleBtns?.forEach((btn) => {
            const button = btn as HTMLElement;
            button.addEventListener('click', handlePasswordVisibility(button));
        });
        
        regPasses?.forEach((input) => {
            const passwordInput = input as HTMLInputElement;
            redrawPasswordValidator(passwordInput);
            passwordInput.addEventListener('focus', showPasswordValidator(passwordInput));
            passwordInput.addEventListener('blur', hidePasswordValidator(passwordInput));
            passwordInput.addEventListener('input', handlePasswordValidator(passwordInput));
        });

        cleanup = () => {
            form.removeEventListener('input', handleInput);
            form.removeEventListener('submit', handleSubmit);
            container?.removeEventListener('click', handleNavigation);
            toggleBtns?.forEach((btn) => {
                const button = btn as HTMLElement;
                button.removeEventListener('click', handlePasswordVisibility(button));
            });
        };
    }

    /**
     * Открепляет все обработчики событий
     */
    function detach(): void {
        cleanup?.();
    }

    return { attach, detach };
}