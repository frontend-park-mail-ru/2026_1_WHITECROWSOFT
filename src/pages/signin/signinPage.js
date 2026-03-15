import Handlebars from 'handlebars';
import '../../assets/style/authForm.scss';
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
			showPassword: false,
		},
		validate: () => {
			// no password validation required for login;
			// either your password fits, or it doesn't.
			return {};
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
