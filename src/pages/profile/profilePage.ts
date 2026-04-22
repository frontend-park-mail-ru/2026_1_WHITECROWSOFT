import Handlebars from 'handlebars';
import '../../assets/style/authForm.scss';
import { db } from '../../db.js';
import { router } from '../../route/router.js';
import { authService } from '../../services/authService.js';
import { store } from '../../store.js';
import type { User } from '../../types.js';
import { registerHelpers, registerPartials } from '../../utils/utils.js';
import '../main/mainPage.scss';
import { setupForm } from './profileForms.js';
import templateText from './profilePage.hbs?raw';
import './profilePage.scss';

export async function initProfilePage(container: HTMLElement): Promise<void> {
	registerHelpers();
	registerPartials();

	const template = Handlebars.compile(templateText);
	const user = store.getUser();
	const html = template({ user });
	container.innerHTML = html;
	setupProfileForms(container);
}

function setupProfileForms(app: HTMLElement): void {
	setupForm('usernameForm', async (formData: Record<string, unknown>) => {
		return await authService.updateProfile({
			username: formData.username as string,
		});
	});

	setupForm('emailForm', async (formData: Record<string, unknown>) => {
		return await authService.updateProfile({ email: formData.email as string });
	});

	setupForm(
		'passwordForm',
		async (formData: Record<string, unknown>) => {
			return await authService.changePassword({
				oldPassword: formData.currentPassword as string,
				newPassword: formData.newPassword as string,
			});
		},
		() => {
			(
				document.getElementById('passwordForm') as HTMLFormElement | null
			)?.reset();
		},
	);

	const avatarTrigger = document.getElementById('avatar-trigger');
	const avatarInput = document.getElementById(
		'avatar-file-input',
	) as HTMLInputElement | null;

	if (avatarTrigger && avatarInput) {
		avatarTrigger.addEventListener('click', () => {
			avatarInput.click();
		});

		avatarInput.addEventListener('change', async (e: Event) => {
			const target = e.target as HTMLInputElement;
			const file = target.files?.[0];
			if (!file) return;

			if (file.size > 1024 * 1024 * 5) {
				alert('Файл слишком большой (макс. 5 МБ)');
				avatarInput.value = '';
				return;
			}

			const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
			if (!allowedTypes.includes(file.type)) {
				alert('Недопустимый формат (разрешены PNG, JPG, WEBP)');
				avatarInput.value = '';
				return;
			}

			const formData = new FormData();
			formData.append('file', file);

			try {
				const result = await authService.updateAvatar(formData);
				if (result && result.AvatarURL) {
					let avatarUrl = result.AvatarURL;
					avatarUrl = avatarUrl.replace('http://minio:9000', '/minio');

					const avatarImg = document.querySelector(
						'[data-avatar-image]',
					) as HTMLElement | null;
					if (avatarImg && avatarImg.tagName === 'IMG') {
						(avatarImg as HTMLImageElement).src = avatarUrl;
					} else if (
						avatarImg &&
						avatarImg.classList.contains('avatar-default')
					) {
						const newImg = document.createElement('img');
						newImg.src = avatarUrl;
						newImg.alt = 'Avatar';
						newImg.className = 'avatar-preview';
						newImg.setAttribute('data-avatar-image', '');
						avatarImg.parentNode?.replaceChild(newImg, avatarImg);
					}

					const currentUser = store.getUser();
					const updatedUser: User = { ...currentUser!, avatar: avatarUrl };
					store.setUser(updatedUser);

					avatarInput.value = '';
				}
			} catch (error) {
				console.error('Upload error:', error);
				const err = error as { error?: string; message?: string };
				alert(err?.error || err?.message || 'Ошибка загрузки');
				avatarInput.value = '';
			}
		});
	}

	const logoutBtn = document.querySelector(
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
		console.error('[ProfilePage] Logout error:', error);
		alert('Ошибка при выходе из аккаунта. Попробуйте еще раз.');
		try {
			await db.settingsSet('user', null);
			store.setUser(null);
			router.replace('/signin');
		} catch (cleanupError) {
			console.error('[ProfilePage] Cleanup error:', cleanupError);
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
	if (
		confirm('Вы уверены, что хотите удалить аккаунт? Это действие необратимо.')
	) {
		console.log('Delete account');
	}
}
