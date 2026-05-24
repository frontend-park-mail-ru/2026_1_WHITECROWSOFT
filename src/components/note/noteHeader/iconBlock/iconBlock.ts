import Component from '../../../component.js';
import templateString from './iconBlock.hbs?raw';

interface IconBlockOptions {
	icon: string | null;
	onIcon: () => void;
}

export default class IconBlock extends Component {
	protected templateString = templateString;

	constructor(private options: IconBlockOptions) {
		super();
	}

	protected getTemplateData() {
		return {
			icon: this.options.icon,
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

	updateIcon(icon: string | null): void {
		const img = this.domElement?.querySelector('.note__icon-image');
		if (img && icon) {
			img.setAttribute('src', icon);
		}
	}

	getIcon(): string | null {
		return this.options.icon;
	}

	destroy(): void {}
}
