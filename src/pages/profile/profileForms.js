import { handleAuthError } from '../../utils/handleAuthError.js';

/**
 * Настраивает обработчик для обычной формы
 */
export function setupForm(formId, onSubmit, onSuccess) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleSubmit(form, onSubmit, onSuccess);
    });
}

/**
 * Настраивает обработчик для формы с файлом (аватар)
 */
export function setupFileForm(formId, onSubmit, onSuccess) {
    const form = document.getElementById(formId);
    if (!form) return;
    
    const fileInput = form.querySelector('input[type="file"]');
    if (!fileInput) return;
    
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!validateFile(file, form)) {
            fileInput.value = '';
            return;
        }
        
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = form.querySelector('[data-avatar-preview]');
                if (preview) preview.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
        
        await handleFileSubmit(form, fileInput, onSubmit, onSuccess);
    });
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleFileSubmit(form, fileInput, onSubmit, onSuccess);
    });
}

/**
 * Логика отправки формы с файлом
 */
async function handleFileSubmit(form, fileInput, onSubmit, onSuccess) {
    const submitBtn = form.querySelector('[type="submit"]');
    const originalText = submitBtn?.textContent;
    const file = fileInput?.files[0];
    
    if (!file) {
        showFormError(form, 'Выберите файл');
        return;
    }
    
    if (!validateFile(file, form)) {
        fileInput.value = '';
        return;
    }
    
    setLoading(submitBtn, true);
    try {
        const formData = new FormData();
        formData.append('file', file);
        const result = await onSubmit(formData);
        if (onSuccess) onSuccess(result);
        clearFormErrors(form);
        
        if (fileInput) {
            fileInput.value = '';
        }
    } catch (error) {
        if (handleAuthError(error)) return;
        const errorMessage = error?.error || error?.message || 'Ошибка загрузки';
        showFormError(form, errorMessage);
        console.error('[ProfileForms] Upload error:', error);
    } finally {
        setLoading(submitBtn, false, originalText);
    }
}

/**
 * Универсальная логика отправки формы
 */
async function handleSubmit(form, onSubmit, onSuccess) {
    const submitBtn = form.querySelector('[type="submit"]');
    const originalText = submitBtn?.textContent;
    setLoading(submitBtn, true);
    try {
        const formData = collectFormData(form);
        const result = await onSubmit(formData);
        if (result?.message) showSuccess(result.message);
        if (onSuccess) onSuccess(result);
        clearFormErrors(form);
    } catch (error) {
        if (handleAuthError(error)) return;
        showFormError(form, error?.data?.error || error?.message || 'Ошибка');
    } finally {
        setLoading(submitBtn, false, originalText);
    }
}

/**
 * Валидация файла
 */
function validateFile(file, form) {
    const maxSize = 1024 * 1024; // 1 MB
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    
    if (file.size > maxSize) {
        showFormError(form, 'Файл слишком большой (макс. 1 МБ)');
        return false;
    }
    if (!allowedTypes.includes(file.type)) {
        showFormError(form, 'Недопустимый формат (PNG, JPG, GIF, WEBP)');
        return false;
    }
    return true;
}

/**
 * Сбор данных формы
 */
function collectFormData(form) {
    const data = {};
    form.querySelectorAll('input[name]').forEach(input => {
        if (input.type !== 'file') {
            data[input.name] = input.value;
        }
    });
    return data;
}

/**
 * Управление состоянием кнопки
 */
function setLoading(button, loading, originalText) {
    if (!button) return;
    button.disabled = loading;
    if (loading) {
        button.dataset.originalText = button.textContent;
        button.textContent = 'Загрузка...';
    } else if (originalText || button.dataset.originalText) {
        button.textContent = originalText || button.dataset.originalText;
    }
}

/**
 * Показ ошибки в форме
 */
function showFormError(form, message) {
    const errorEl = form.querySelector('[data-field-error]');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.visibility = 'visible';
    }
    form.querySelector('input')?.classList.add('input--error');
}

/**
 * Очистка ошибок формы
 */
function clearFormErrors(form) {
    form.querySelectorAll('[data-field-error]').forEach(el => {
        el.textContent = '';
        el.style.visibility = 'hidden';
    });
    form.querySelectorAll('input').forEach(input => {
        input.classList.remove('input--error');
    });
}
