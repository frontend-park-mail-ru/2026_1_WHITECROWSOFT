import Handlebars from 'handlebars';
import { router } from '../../route/router.js';
import { authService } from '../../services/authService.js';
import { setupForm } from './profileForms.js';
import { registerHelpers, registerPartials } from '../../utils/utils.js';
import templateText from './profilePage.hbs?raw';
import { store } from '../../store.js';
import './profilePage.css';

export async function initProfilePage(container, data = {}) {
    registerHelpers();
    registerPartials();
    
    const template = Handlebars.compile(templateText);
    const user = store.getUser();
    const html = template({ user });
    container.innerHTML = html;
    setupProfileForms(container);
}

function setupProfileForms(app) {
    setupForm('usernameForm', 
        async (formData) => {
            return await authService.updateProfile({ Username: formData.username });
        }
    );
    
    setupForm('emailForm',
        async (formData) => {
            return await authService.updateProfile({ email: formData.email });
        }
    );
    
    setupForm('passwordForm',
        async (formData) => {
            return await authService.changePassword({
                currentPassword: formData.currentPassword,
                newPassword: formData.newPassword
            });
        },
        () => {
            document.getElementById('passwordForm')?.reset();
        }
    );
    
    const avatarTrigger = document.getElementById('avatar-trigger');
    const avatarInput = document.getElementById('avatar-file-input');
    const fileNameSpan = document.getElementById('avatar-file-name');
    
    if (avatarTrigger && avatarInput) {
        avatarTrigger.addEventListener('click', () => {
            avatarInput.click();
        });
        
        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            if (fileNameSpan) {
                fileNameSpan.textContent = file.name;
            }
            
            if (file.size > 1024 * 1024) {
                alert('Файл слишком большой (макс. 1 МБ)');
                avatarInput.value = '';
                if (fileNameSpan) fileNameSpan.textContent = 'Файл не выбран';
                return;
            }
            
            const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
            if (!allowedTypes.includes(file.type)) {
                alert('Недопустимый формат (PNG, JPG, GIF, WEBP)');
                avatarInput.value = '';
                if (fileNameSpan) fileNameSpan.textContent = 'Файл не выбран';
                return;
            }
            
            const formData = new FormData();
            formData.append('file', file);
            
            try {
                const result = await authService.updateAvatar(formData);
                if (result && result.AvatarURL) {
                    let avatarUrl = result.AvatarURL;
                    avatarUrl = avatarUrl.replace('http://minio:9000', '/minio');
                    
                    const avatarImg = document.querySelector('[data-avatar-image]');
                    if (avatarImg && avatarImg.tagName === 'IMG') {
                        avatarImg.src = avatarUrl;
                    } else if (avatarImg && avatarImg.classList.contains('avatar-default')) {
                        const newImg = document.createElement('img');
                        newImg.src = avatarUrl;
                        newImg.alt = 'Avatar';
                        newImg.className = 'avatar-preview';
                        newImg.setAttribute('data-avatar-image', '');
                        avatarImg.parentNode?.replaceChild(newImg, avatarImg);
                    }
                    
                    const currentUser = store.getUser();
                    const updatedUser = { ...currentUser, avatar: avatarUrl };
                    store.setUser(updatedUser);
                    
                    avatarInput.value = '';
                    if (fileNameSpan) fileNameSpan.textContent = 'Файл не выбран';
                }
            } catch (error) {
                console.error('Upload error:', error);
                alert(error?.error || error?.message || 'Ошибка загрузки');
                avatarInput.value = '';
                if (fileNameSpan) fileNameSpan.textContent = 'Файл не выбран';
            }
        });
    }
    
    app.querySelector('[data-action="logout"]')?.addEventListener('click', handleLogout);
    app.querySelector('[data-action="deleteAccount"]')?.addEventListener('click', handleDeleteAccount);
}

async function handleLogout() {
    try {
        await authService.logOut();
        router.replace('/signin');
    } catch (err) {
        console.error('[ProfilePage] Logout error:', err);
        router.replace('/signin');        
    }
}

async function handleDeleteAccount() {
    if (confirm('Вы уверены, что хотите удалить аккаунт? Это действие необратимо.')) {
        // TODO: реализовать удаление аккаунта
        console.log('Delete account');
    }
}