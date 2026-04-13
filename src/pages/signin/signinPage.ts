import Handlebars from 'handlebars';
import '../../assets/style/authForm.scss';
import { router } from '../../route/router.js';
import { authService } from '../../services/authService.js';
import type { FormState } from '../../types.js';
import { createFormRenderer } from '../../utils/formRender/formRenderer.js';
import { registerHelpers, registerPartials } from '../../utils/utils.js';
import templateText from './signinPage.hbs?raw';

/**
 * Инициализирует страницу входа в систему
 */
export async function initSigninPage(): Promise<void> {
	registerHelpers();
	registerPartials();
	const template = Handlebars.compile(templateText);

	const app = document.querySelector('#app') as HTMLElement | null;
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

	const initialState: FormState = {
		formData: { username: '', password: '' },
		errors: {},
		serverError: '',
		isSubmitting: false,
		showPassword: false,
	};

	const formRenderer = createFormRenderer({
		containerSelector: '.signinPage',
		template,
		initialState,
		validate: (): Record<string, string> => {
			return {};
		},
		onSubmit: async (formData: Record<string, unknown>) => {
			await authService.signIn({
				username: formData.username as string,
				password: formData.password as string,
			});
		},
		onSuccess: () => {
			router.replace('/');
		},
		onNavigate: (link: string) => {
			if (link === 'signup') router.push('/signup');
		},
	});

	formRenderer.init();
}
