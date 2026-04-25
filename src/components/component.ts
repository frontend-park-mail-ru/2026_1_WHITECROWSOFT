import Handlebars from "handlebars";

export default abstract class Component {
    protected domElement: HTMLElement | null = null;
    protected template: HandlebarsTemplateDelegate | null = null;
    protected abstract templateString: string;

    render(): string {
        if (!this.template) {
            this.template = Handlebars.compile(this.templateString);
        }
        return this.template(this.gettTemplateData());
    }

    protected gettTemplateData() {
        return {};
    }

    renderTo(container: HTMLElement | null): void {
        if (!container) return;
        this.domElement = document.createElement('div');
        this.domElement.innerHTML = this.render();

        container.appendChild(this.domElement);
        this.onRender();
    }

    protected onRender(): void {}
    
    update(): void {
        if (!this.domElement) return;
        const newContent = this.render();
        this.domElement.innerHTML = newContent;
        this.onRender();
    }

    protected escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}