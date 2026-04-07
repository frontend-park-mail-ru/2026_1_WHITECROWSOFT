import Handlebars from 'handlebars';
import { Sidebar } from '../../components/sidebar/sidebar.js';
import { router } from '../../route/router.js';
import { authService } from '../../services/authService.js';
import { handleAuthError } from '../../utils/handleAuthError.js';
import { setupForm, setupFileForm } from './profileForms.js';
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

/**
 * Настраивает все формы страницы профиля
 */
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
    
    setupFileForm('avatarForm',
        async (formData) => {
            return await authService.updateAvatar(formData);
        }
    );
    app.querySelector('[data-action="logout"]')?.addEventListener('click', handleLogout);
    app.querySelector('[data-action="deleteAccount"]')?.addEventListener('click', handleDeleteAccount);
}

/**
 * Выход из аккаунта
 */
async function handleLogout() {
    try {
        await authService.logOut();
        router.replace('/signin');
    } catch (error) {
        console.error('[ProfilePage] Logout error:', err);
        router.replace('/signin');        
    }
}

/**
 * Удаление аккаунта
 */
async function handleDeleteAccount() {
}
