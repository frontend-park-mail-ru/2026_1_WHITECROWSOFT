import Handlebars from 'handlebars';
import { createElement } from '../../../utils/utils';
import templateText from './supportPopup.hbs?raw';
import './supportPopup.scss';

type TabName = 'new' | 'my';

export class SupportPopup {
	private element: HTMLElement | null = null;
	private isOpen = false;
	private iframe: HTMLIFrameElement | null = null;
	private currentTab: TabName = 'new';

	constructor() {}

	open(): void {
		if (this.isOpen) return;

		if (!this.element) {
			this.render();
		}

		this.element?.classList.add('supportPopup__wrapper--open');
		this.isOpen = true;
		this.bindEvents();
		this.loadIframeContent();
		this.switchTab(this.currentTab);
	}

	close(): void {
		if (!this.isOpen) return;
		this.element?.classList.remove('supportPopup__wrapper--open');
		this.isOpen = false;
	}

	private render(): void {
		const html = Handlebars.compile(templateText)({});
		this.element = createElement('div', 'supportPopup__wrapper');
		this.element.innerHTML = html;
		document.body.appendChild(this.element);
	}

	private bindEvents(): void {
		if (!this.element) return;

		const closeBtn = this.element.querySelector('[data-action="close"]');
		closeBtn?.addEventListener('click', () => this.close());

		const inputs = this.element.querySelectorAll<HTMLInputElement>(
			'.supportPopup__tabs input',
		);

		inputs.forEach((input) => {
			input.addEventListener('change', (e) => {
				const target = e.currentTarget as HTMLInputElement;
				if (target.checked) {
					const tabName = target.dataset.tab;
					if (tabName && this.isValidTabName(tabName)) {
						this.switchTab(tabName);
					}
				}
			});
		});
	}

	private isValidTabName(tabName: string): tabName is TabName {
		return tabName === 'new' || tabName === 'my';
	}

	private switchTab(tabName: TabName): void {
		this.currentTab = tabName;
		if (!this.iframe || !this.iframe.contentWindow) return;
		this.iframe.src = `/support-iframe.html?view=${this.currentTab}`;
		this.iframe.contentWindow.postMessage(
			{
				type: 'support:switchTab',
				view: tabName,
			},
			'*',
		);
	}

	private loadIframeContent(): void {
		this.iframe = this.element?.querySelector('#supportIframe') || null;
		if (!this.iframe || !this.iframe.contentWindow) return;
		this.iframe.src = `/support/iframe?view=${this.currentTab}`;
		window.addEventListener('message', (event) => {
			if (event.data?.type === 'support:ticketCreated') {
				console.log('New ticket created:', event.data.data);
			}
		});
	}

	toggle(): void {
		if (this.isOpen) {
			this.close();
		} else {
			this.open();
		}
	}
}
