import { authService } from '../../../services/authService.js';
import { store } from '../../../store.js';
import type { User } from '../../../types.js';
import Component from '../../component.js';
import templateString from './avatar.hbs?raw';
import './avatar.scss';

interface ProfileAvatarOptions {
	user: User | null;
	onAvatarUpdate?: (avatarUrl: string) => void;
}

export default class ProfileAvatar extends Component {
	protected templateString = templateString;

	private user: User | null;
	private onAvatarUpdate?: (avatarUrl: string) => void;
	private fileInput: HTMLInputElement | null = null;
	private static readonly DEFAULT_AVATAR = '/icons/avatarBig.svg';

	constructor(options: ProfileAvatarOptions) {
		super();
		this.user = options.user;
		this.onAvatarUpdate = options.onAvatarUpdate;
	}

	protected getTemplateData() {
		const avatarUrl = this.user?.avatar || ProfileAvatar.DEFAULT_AVATAR;
		return {
			avatarUrl: avatarUrl,
			hasAvatar:
				!!this.user?.avatar &&
				this.user.avatar !== ProfileAvatar.DEFAULT_AVATAR,
		};
	}

	onRender(): void {
		this.bindEvents();
	}

	private bindEvents(): void {
		const triggerBtn = this.domElement?.querySelector(
			'[data-action="upload-avatar"]',
		);
		const deleteBtn = this.domElement?.querySelector(
			'[data-action="delete-avatar"]',
		);
		const fileInput = this.domElement?.querySelector(
			'[data-action="avatar-input"]',
		) as HTMLInputElement;
		if (!triggerBtn || !fileInput) return;
		this.fileInput = fileInput;
		triggerBtn.addEventListener('click', () => {
			fileInput.click();
		});
		fileInput.addEventListener('change', this.handleFileUpload.bind(this));
		if (deleteBtn) {
			deleteBtn.addEventListener('click', this.handleDeleteAvatar.bind(this));
		}
	}

	private async handleFileUpload(e: Event): Promise<void> {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;
		if (file.size > 1024 * 1024 * 5) {
			this.showError('Файл слишком большой (макс. 5 МБ)');
			target.value = '';
			return;
		}
		const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
		if (!allowedTypes.includes(file.type)) {
			this.showError('Недопустимый формат (разрешены PNG, JPG, WEBP)');
			target.value = '';
			return;
		}
		const formData = new FormData();
		formData.append('file', file);
		try {
			const result = await authService.updateAvatar(formData);
			if (result && result.AvatarURL) {
				let avatarUrl = result.AvatarURL;
				avatarUrl = avatarUrl.replace('http://minio:9000', '/minio');
				this.updateAvatarImage(avatarUrl);
				const currentUser = store.getUser();
				if (currentUser) {
					const updatedUser: User = { ...currentUser, avatar: avatarUrl };
					store.setUser(updatedUser);
					this.user = updatedUser;
				}
				this.onAvatarUpdate?.(avatarUrl);
				this.clearError();
				this.updateDeleteButtonVisibility(true);
			}
		} catch (error) {
			console.error('Upload error:', error);
			const err = error as { error?: string; message?: string };
			this.showError(err?.error || err?.message || 'Ошибка загрузки');
		} finally {
			target.value = '';
		}
	}

	private async handleDeleteAvatar(): Promise<void> {
		try {
			await authService.deleteAvatar();
			this.updateAvatarImage(ProfileAvatar.DEFAULT_AVATAR);
			const currentUser = store.getUser();
			if (currentUser) {
				const updatedUser: User = { ...currentUser, avatar: null };
				store.setUser(updatedUser);
				this.user = updatedUser;
			}
			this.onAvatarUpdate?.(ProfileAvatar.DEFAULT_AVATAR);
			this.clearError();
			this.updateDeleteButtonVisibility(false);
		} catch (error) {
			console.error('Delete avatar error:', error);
			const err = error as { error?: string; message?: string };
			this.showError(err?.error || err?.message || 'Ошибка удаления аватара');
		}
	}

	private updateAvatarImage(avatarUrl: string): void {
		const avatarImg = this.domElement?.querySelector(
			'[data-avatar-image]',
		) as HTMLImageElement;
		if (avatarImg) {
			avatarImg.src = avatarUrl;
		}
	}

	private updateDeleteButtonVisibility(hasAvatar: boolean): void {
		const deleteBtn = this.domElement?.querySelector(
			'[data-action="delete-avatar"]',
		) as HTMLButtonElement;
		if (deleteBtn) {
			deleteBtn.style.display = hasAvatar ? 'flex' : 'none';
		}
	}

	private showError(message: string): void {
		const errorEl = this.domElement?.querySelector('[data-error]');
		if (errorEl) {
			errorEl.textContent = message;
			errorEl.classList.add('visible');
		}
	}

	private clearError(): void {
		const errorEl = this.domElement?.querySelector('[data-error]');
		if (errorEl) {
			errorEl.textContent = '';
			errorEl.classList.remove('visible');
		}
	}
}
