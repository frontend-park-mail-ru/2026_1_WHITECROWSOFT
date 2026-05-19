import Component from '../../../component.js';
import templateString from './iconBlock.hbs?raw';

interface IconBlockOptions {
	iconUrl: string | null;
	onRemove: () => void;
}

export default class IconBlock extends Component {
	protected templateString = templateString;

	constructor(private options: IconBlockOptions) {
		super();
	}

	protected getTemplateData() {
		return {
			iconUrl: this.options.iconUrl,
		};
	}

	onRender(): void {
		this.bindEvents();
	}

	private bindEvents(): void {
		const removeBtn = this.domElement?.querySelector(
			'[data-action="removeIcon"]',
		);
		removeBtn?.addEventListener('click', () => this.options.onRemove());
	}

	updateIcon(iconUrl: string | null): void {
		const img = this.domElement?.querySelector('.note__icon-image');
		if (img && iconUrl) {
			img.setAttribute('src', iconUrl);
		}
	}

	destroy(): void {}
}
