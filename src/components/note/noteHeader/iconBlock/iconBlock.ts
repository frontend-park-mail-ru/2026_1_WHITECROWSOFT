import Component from '../../../component.js';
import templateString from './iconBlock.hbs?raw';

interface IconBlockOptions {
	iconUrl: string | null;
	onIcon: () => void;
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
		const icon = this.domElement?.querySelector('.note__icon');
		icon?.addEventListener('click', (e) => {
			e.stopPropagation();
			this.options.onIcon();
		});
	}

	updateIcon(iconUrl: string | null): void {
		const img = this.domElement?.querySelector('.note__icon-image');
		if (img && iconUrl) {
			img.setAttribute('src', iconUrl);
		}
	}

	destroy(): void {}
}
