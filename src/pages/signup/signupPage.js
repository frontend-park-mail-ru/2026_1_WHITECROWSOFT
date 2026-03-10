import Handlebars from 'handlebars';
import '../../assets/style/authForm.css';
import {
	validatePassword,
	validatePasswordConfirm,
	validateUsername,
} from '../../formValidators/validators.js';
import { router } from '../../route/router.js';
import { authService } from '../../services/authService.js';
import { createFormRenderer } from '../../utils/formRender/formRenderer.js';
import { registerHelpers, registerPartials } from '../../utils/utils.js';
import templateText from './signupPage.hbs?raw';


/**
 * Инициализирует страницу регистрации
 * @async
 * @function initSignupPage
 * @returns {Promise<void>}
 * 
 * @description
 * Отображает форму входа, обрабатывает валидацию полей,
 * отправку данных на сервер и перенаправление после успешной регистрации
*/
export async function initSignupPage() {
	registerHelpers();
	registerPartials();

	const template = Handlebars.compile(templateText);

	const app = document.querySelector('#app');
	if (!app) {
		console.error('#app not found');
		return;
	}

	app.innerHTML = template({
		formData: { username: '', password: '', passwordConfirm: '' },
		errors: {},
		serverError: '',
		isSubmitting: false,
	});

	const formRenderer = createFormRenderer({
		containerSelector: '.signupPage',
		template,
		initialState: {
			formData: { username: '', password: '', passwordConfirm: '' },
			errors: {},
			serverError: '',
			isSubmitting: false,
		},
		validate: (formData) => {
			const errors = {};
			const u = validateUsername(formData.username);
			const p = validatePassword(formData.password);
			const pc = validatePasswordConfirm(
				formData.password,
				formData.passwordConfirm,
			);
			if (!u.isValid) errors.username = u.error;
			if (!p.isValid) errors.password = p.error;
			if (!pc.isValid) errors.passwordConfirm = pc.error;
			return errors;
		},
		onSubmit: async (formData) => {
			await authService.signUp({
				login: formData.username,
				password: formData.password,
			});
			router.replace('/');
		},
		onSuccess: () => {
			router.replace('/');
		},
		onNavigate: (link) => {
			if (link === 'signin') router.push('/signin');
		},
	});

	formRenderer.init();
}
