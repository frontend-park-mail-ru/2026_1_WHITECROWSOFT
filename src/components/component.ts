import Handlebars from 'handlebars';

export default abstract class Component {
	protected domElement: HTMLElement | null = null;
	protected template: HandlebarsTemplateDelegate | null = null;
	protected abstract templateString: string;

	render(): string {
		if (!this.template) {
			this.template = Handlebars.compile(this.templateString);
		}
		return this.template(this.getTemplateData());
	}

	protected getTemplateData() {
		return {};
	}

	renderTo(container: HTMLElement | null): void {
		if (!container) return;
		const temp = document.createElement('div');
		temp.innerHTML = this.render();
		while (temp.firstChild) {
			const child = temp.firstChild;
			container.appendChild(child);
			if (!this.domElement) {
				this.domElement = child as HTMLElement;
			}
		}

		this.onRender();
	}

	update(): void {
		if (!this.domElement) return;
		const newHtml = this.render();
		this.domElement.innerHTML = newHtml;
		this.onRender();
	}

	protected onRender(): void {}

	protected escapeHtml(str: string): string {
		const div = document.createElement('div');
		div.textContent = str;
		return div.innerHTML;
	}
}
