import Handlebars from 'handlebars';
import '../../assets/style/authForm.css';
import { router } from '../../route/router.js';
import { authService } from '../../services/authService.js';
import { createFormRenderer } from '../../utils/formRender/formRenderer.js';
import { registerHelpers, registerPartials } from '../../utils/utils.js';

export async function initSigninPage() {
	const user = await authService.checkAuth();
	if (user) {
		router.replace('/');
		return;
	}

	registerHelpers();
	await registerPartials();
	const response = await fetch('/pages/signin/signinPage.hbs');
	const template = Handlebars.compile(await response.text());

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
			// Yes, this is just to eliminate the text. -Andrew
			// const u = validateUsername(formData.username);
			// const p = validatePassword(formData.password);
			// if (!u.isValid) errors.username = u.error;
			// if (!p.isValid) errors.password = p.error;
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
