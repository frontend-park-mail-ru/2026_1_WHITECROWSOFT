import Handlebars from 'handlebars';
import '../../assets/style/authForm.scss';
import { confirmDialog } from '../../components/popups/confirmDialog/confirmDialog.js';
import ProfileAvatar from '../../components/profile/avatar/avatar.js';
import ProfileForm from '../../components/profile/form/form.js';
import { db } from '../../db.js';
import { router } from '../../route/router.js';
import { authService } from '../../services/authService.js';
import { store } from '../../store.js';
import { registerHelpers, registerPartials } from '../../utils/utils.js';
import '../main/mainPage.scss';
import templateText from './profilePage.hbs?raw';
import './profilePage.scss';

export async function initProfilePage(container: HTMLElement): Promise<void> {
	registerHelpers();
	registerPartials();
	const template = Handlebars.compile(templateText);
	const user = store.getUser();
	const html = template({ user });
	container.innerHTML = html;
	setupProfileComponents(container);
}

function setupProfileComponents(app: HTMLElement): void {
	const user = store.getUser();
	const avatarContainer = app.querySelector('[data-avatar-container]');
	if (avatarContainer && user) {
		const avatar = new ProfileAvatar({ user });
		avatar.renderTo(avatarContainer as HTMLElement);
	}
	const usernameContainer = app.querySelector('[data-username-form]');
	if (usernameContainer) {
		const usernameForm = new ProfileForm({
			formId: 'usernameForm',
			fields: [
				{
					name: 'username',
					label: 'Имя пользователя',
					type: 'text',
					value: user?.username,
					placeholder: 'Введите новое имя',
					autocomplete: 'username',
					required: true,
				},
			],
			buttonText: 'Изменить',
			onSubmit: async (formData) => {
				return await authService.updateProfile({
					username: formData.username as string,
				});
			},
		});
		usernameForm.renderTo(usernameContainer as HTMLElement);
	}
	const emailContainer = app.querySelector('[data-email-form]');
	if (emailContainer) {
		const emailForm = new ProfileForm({
			formId: 'emailForm',
			fields: [
				{
					name: 'email',
					label: 'Email',
					type: 'email',
					value: user?.email || undefined,
					placeholder: 'Ваша почта',
					autocomplete: 'email',
					disabled: true,
				},
			],
			buttonText: 'Сохранить',
			onSubmit: async (formData) => {
				return await authService.updateProfile({
					email: formData.email as string,
				});
			},
		});
		emailForm.renderTo(emailContainer as HTMLElement);
	}
	const passwordContainer = app.querySelector('[data-password-form]');
	if (passwordContainer) {
		const passwordForm = new ProfileForm({
			formId: 'passwordForm',
			fields: [
				{
					name: 'newPassword',
					label: 'Новый пароль',
					type: 'password',
					placeholder: 'Введите новый пароль',
					autocomplete: 'new-password',
					disabled: true,
				},
			],
			buttonText: 'Изменить',
			onSubmit: async (formData) => {
				const currentPassword = prompt('Введите текущий пароль:');
				if (!currentPassword) {
					throw new Error('Текущий пароль обязателен');
				}
				return await authService.changePassword({
					oldPassword: currentPassword,
					newPassword: formData.newPassword as string,
				});
			},
			onSuccess: () => {
				(
					document.getElementById('passwordForm') as HTMLFormElement | null
				)?.reset();
			},
		});
		passwordForm.renderTo(passwordContainer as HTMLElement);
	}
	const logoutBtn = app.querySelector(
		'.logoutButton',
	) as HTMLButtonElement | null;
	if (logoutBtn) {
		logoutBtn.addEventListener('click', handleLogout);
	}
	const deleteAccountBtn = app.querySelector('[data-action="deleteAccount"]');
	if (deleteAccountBtn) {
		deleteAccountBtn.addEventListener('click', handleDeleteAccount);
	}
}

async function handleLogout(): Promise<void> {
	const logoutBtn = document.querySelector(
		'.logoutButton',
	) as HTMLButtonElement | null;
	const originalText = logoutBtn?.textContent;
	if (logoutBtn) {
		logoutBtn.disabled = true;
		logoutBtn.textContent = 'Выход...';
	}
	try {
		await authService.logOut();
		router.replace('/signin');
	} catch (error) {
		try {
			console.log('error:', error);
			await db.settingsSet('user', null);
			store.setUser(null);
			router.replace('/signin');
		} catch (cleanupError) {
			console.error('Error during logout cleanup:', cleanupError);
			window.location.href = '/signin';
		}
	} finally {
		if (logoutBtn && window.location.pathname !== '/signin') {
			logoutBtn.disabled = false;
			logoutBtn.textContent = originalText || 'Выйти';
		}
	}
}

async function handleDeleteAccount(): Promise<void> {
	const confirmed = await confirmDialog({
		title: 'Удаление аккаунта',
		message: 'Вы уверены, что хотите удалить аккаунт? Это действие необратимо.',
		confirmText: 'Удалить',
		danger: true,
	});
	if (confirmed) {
		console.log('Delete account');
	}
}
