import Component from '../../../component.js';
import templateString from './coverBlock.hbs?raw';

interface CoverBlockOptions {
	coverUrl: string | null;
	onRemove: () => void;
	onChange: () => void;
}

export default class CoverBlock extends Component {
	protected templateString = templateString;
	private coverUrl: string | null;

	constructor(private options: CoverBlockOptions) {
		super();
		this.coverUrl = options.coverUrl;
	}

	protected getTemplateData() {
		return {
			coverUrl: this.coverUrl,
		};
	}

	onRender(): void {
		this.bindEvents();
	}

	private bindEvents(): void {
		console.log(this.domElement as HTMLElement);
		const removeBtn = this.domElement?.querySelector(
			'[data-action="removeCover"]',
		);
		const changeBtn = this.domElement?.querySelector(
			'[data-action="changeCover"]',
		);
		removeBtn?.addEventListener('click', () => this.options.onRemove());
		changeBtn?.addEventListener('click', () => this.options.onChange());
	}

	destroy(): void {}
}
