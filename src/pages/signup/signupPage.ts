import Handlebars from 'handlebars';
import '../../assets/style/authForm.scss';
import {
	validatePassword,
	validatePasswordConfirm,
	validateUsername,
} from '../../formValidators/validators.js';
import { router } from '../../route/router.js';
import { authService } from '../../services/authService.js';
import type { FormState } from '../../types.js';
import { createFormRenderer } from '../../utils/formRender/formRenderer.js';
import { registerHelpers, registerPartials } from '../../utils/utils.js';
import templateText from './signupPage.hbs?raw';

/**
 * Инициализирует страницу регистрации
 */
export async function initSignupPage(): Promise<void> {
	registerHelpers();
	registerPartials();

	const template = Handlebars.compile(templateText);

	const app = document.querySelector('#app') as HTMLElement | null;
	if (!app) {
		console.error('#app not found');
		return;
	}

	app.innerHTML = template({
		formData: { username: '', password: '', passwordConfirm: '' },
		errors: {},
		serverError: '',
		isSubmitting: false,
		showPassword: false,
		showPasswordConfirm: false,
	});

	const initialState: FormState = {
		formData: { username: '', password: '', passwordConfirm: '' },
		errors: {},
		serverError: '',
		isSubmitting: false,
		showPassword: false,
		showPasswordConfirm: false,
	};

	const formRenderer = createFormRenderer({
		containerSelector: '.signupPage',
		template,
		initialState,
		validate: (formData: Record<string, unknown>) => {
			const errors: Record<string, string> = {};
			const u = validateUsername(formData.username as string);
			const p = validatePassword(formData.password as string);
			const pc = validatePasswordConfirm(
				formData.password as string,
				formData.passwordConfirm as string,
			);
			if (!u.isValid) errors.username = u.error;
			if (!p.isValid) errors.password = p.error;
			if (!pc.isValid) errors.passwordConfirm = pc.error;
			return errors;
		},
		onSubmit: async (formData: Record<string, unknown>) => {
			await authService.signUp({
				username: formData.username as string,
				password: formData.password as string,
			});
		},
		onSuccess: () => {
			router.replace('/');
		},
		onNavigate: (link: string) => {
			if (link === 'signin') router.push('/signin');
		},
	});

	formRenderer.init();
}
