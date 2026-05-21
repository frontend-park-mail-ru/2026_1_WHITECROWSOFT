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
		const removeBtn = this.domElement?.querySelector(
			'[data-action="removeCover"]',
		);
		const changeBtn = this.domElement?.querySelector(
			'[data-action="changeCover"]',
		);
		removeBtn?.addEventListener('click', () => this.options.onRemove());
		changeBtn?.addEventListener('click', () => this.options.onChange());

		const img = this.domElement?.querySelector(
			'.note__cover-image',
		) as HTMLImageElement | null;
		if (img) {
			if (img.complete && img.naturalWidth > 0) {
				this.adaptButtonContrast(img);
			} else {
				img.addEventListener('load', () => this.adaptButtonContrast(img), {
					once: true,
				});
			}
		}
	}

	private adaptButtonContrast(img: HTMLImageElement): void {
		const buttons = this.domElement?.querySelector(
			'.note__cover-buttons',
		) as HTMLElement | null;
		if (!buttons || !img.naturalWidth || !img.naturalHeight) return;
		try {
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			const regionW = Math.max(1, Math.floor(img.naturalWidth * 0.35));
			const regionH = Math.max(1, Math.floor(img.naturalHeight * 0.4));
			canvas.width = regionW;
			canvas.height = regionH;
			ctx.drawImage(
				img,
				img.naturalWidth - regionW,
				0,
				regionW,
				regionH,
				0,
				0,
				regionW,
				regionH,
			);
			const data = ctx.getImageData(0, 0, regionW, regionH).data;
			let total = 0;
			const pixelCount = data.length / 4;
			for (let i = 0; i < data.length; i += 4) {
				total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
			}
			const avg = total / pixelCount;
			buttons.classList.toggle('note__cover-buttons--dark', avg > 140);
		} catch {
			buttons?.classList.remove('note__cover-buttons--dark');
		}
	}

	destroy(): void {}
}
