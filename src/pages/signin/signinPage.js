import Handlebars from 'handlebars';
import '../../assets/style/authForm.css';
import {
	validatePassword,
	validateUsername,
} from '../../formValidators/validators.js';
import { router } from '../../route/router.js';
import { authService } from '../../services/authService.js';
import { createFormRenderer } from '../../utils/formRender/formRenderer.js';
import { registerHelpers, registerPartials } from '../../utils/utils.js';
import templateText from './signinPage.hbs?raw';


/**
 * Инициализирует страницу входа в систему
 * @async
 * @function initSigninPage
 * @returns {Promise<void>}
 * 
 * @description
 * Отображает форму входа, обрабатывает валидацию полей,
 * отправку данных на сервер и перенаправление после успешного входа
*/
export async function initSigninPage() {
	registerHelpers();
	registerPartials();
	const template = Handlebars.compile(templateText);

	const app = document.querySelector('#app');
	if (!app) {
		console.error('#app not found');
		return;
	}

	app.innerHTML = template({
		formData: { username: '', password: '' },
		errors: {},
		serverError: '',
		isSubmitting: false,
	});

	const formRenderer = createFormRenderer({
		containerSelector: '.signinPage',
		template,
		initialState: {
			formData: { username: '', password: '' },
			errors: {},
			serverError: '',
			isSubmitting: false,
		},
		validate: (formData) => {
			// NOTE: If you're signing in,
			// your pass and username fits or it doesn't.
			// If we'll have a "Forgot password?" prompt,
			// we might have to eliminate this. -Andrew
			const errors = {};
			const u = validateUsername(formData.username);
			const p = validatePassword(formData.password);
			if (!u.isValid) errors.username = u.error;
			if (!p.isValid) errors.password = p.error;
			return errors;
		},
		onSubmit: async (formData) => {
			await authService.signIn({
				login: formData.username,
				password: formData.password,
			});
		},
		onSuccess: () => {
			router.replace('/');
		},
		onNavigate: (link) => {
			if (link === 'signup') router.push('/signup');
		},
	});

	formRenderer.init();
}
