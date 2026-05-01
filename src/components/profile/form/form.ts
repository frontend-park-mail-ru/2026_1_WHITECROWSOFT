import { handleAuthError } from '../../../utils/handleAuthError.js';
import Component from '../../component.js';
import templateString from './form.hbs?raw';
import './form.scss';

interface FormField {
	name: string;
	label: string;
	type: string;
	value?: string;
	placeholder?: string;
	disabled?: boolean;
	required?: boolean;
	autocomplete?: string;
}

interface ProfileFormOptions {
	formId: string;
	fields: FormField[];
	buttonText: string;
	onSubmit: (formData: Record<string, unknown>) => Promise<unknown>;
	onSuccess?: (result?: unknown) => void;
}

export default class ProfileForm extends Component {
	protected templateString = templateString;

	private options: ProfileFormOptions;
	private isLoading: boolean = false;
	private originalValues: Map<string, string> = new Map();

	constructor(options: ProfileFormOptions) {
		super();
		this.options = options;
		this.options.fields.forEach((field) => {
			if (field.name && field.value !== undefined) {
				this.originalValues.set(field.name, field.value);
			}
		});
	}

	protected getTemplateData() {
		return {
			formId: this.options.formId,
			fields: this.options.fields,
			buttonText: this.options.buttonText,
			isLoading: this.isLoading,
		};
	}

	onRender(): void {
		this.bindEvents();
		this.saveOriginalValues();
	}

	private bindEvents(): void {
		const form = this.domElement;
		if (!form) return;
		form.addEventListener('submit', this.handleSubmit.bind(this));
	}

	private saveOriginalValues(): void {
		const inputs = this.domElement?.querySelectorAll('input[name]');
		if (!inputs) return;
		inputs.forEach((input) => {
			const el = input as HTMLInputElement;
			if (el.name) {
				this.originalValues.set(el.name, el.value);
			}
		});
	}

	private hasChanges(): boolean {
		const inputs = this.domElement?.querySelectorAll('input[name]');
		if (!inputs) return false;
		let hasChanges = false;
		inputs.forEach((input) => {
			const el = input as HTMLInputElement;
			const originalValue = this.originalValues.get(el.name) || '';
			if (el.value !== originalValue && !el.disabled) {
				hasChanges = true;
			}
		});
		return hasChanges;
	}

	private async handleSubmit(e: Event): Promise<void> {
		e.preventDefault();
		e.stopPropagation();
		if (this.isLoading) return;
		if (!this.hasChanges()) return;
		const form = e.target as HTMLFormElement;
		const formData = this.collectFormData(form);
		this.isLoading = true;
		this.updateUI();
		try {
			const result = await this.options.onSubmit(formData);
			this.options.onSuccess?.(result);
			this.saveOriginalValues();
			this.clearErrors(form);
		} catch (error) {
			if (handleAuthError(error)) return;
			const err = error as { data?: { error?: string }; message?: string };
			this.showError(form, err?.data?.error || err?.message || 'Ошибка');
		} finally {
			this.isLoading = false;
			this.updateUI();
		}
	}

	private collectFormData(form: HTMLFormElement): Record<string, unknown> {
		const data: Record<string, unknown> = {};
		const inputs = form.querySelectorAll('input[name]');
		inputs.forEach((input) => {
			const el = input as HTMLInputElement;
			if (!el.disabled) {
				data[el.name] = el.value;
			}
		});
		return data;
	}

	private showError(form: HTMLFormElement, message: string): void {
		const errorEl = form.querySelector('[data-field-error]') as HTMLElement;
		if (errorEl) {
			errorEl.textContent = message;
			errorEl.style.visibility = 'visible';
		}
		const firstInput = form.querySelector('input') as HTMLInputElement;
		firstInput?.classList.add('input--error');
	}

	private clearErrors(form: HTMLFormElement): void {
		const errorEls = form.querySelectorAll('[data-field-error]');
		errorEls.forEach((el) => {
			const element = el as HTMLElement;
			element.textContent = '';
			element.style.visibility = 'hidden';
		});
		const inputs = form.querySelectorAll('input');
		inputs.forEach((input) => {
			input.classList.remove('input--error');
		});
	}

	private updateUI(): void {
		const button = this.domElement?.querySelector(
			'button[type="submit"]',
		) as HTMLButtonElement;
		if (button) {
			button.disabled = this.isLoading;
			button.textContent = this.isLoading
				? 'Загрузка...'
				: this.options.buttonText;
		}
	}
}
