import type { Note } from '../../../types.js';
import Component from '../../component.js';
import templateString from './noteItem.hbs?raw';

interface NoteItemOptions {
	note: Note;
	isActive: boolean;
	onNoteClick: (noteId: string | number) => void;
	onAddSubnote: (noteId: string | number) => void;
	onSettingsClick: (noteId: string | number, anchor: HTMLElement) => void;
	onTitleDoubleClick: (noteId: string | number, element: HTMLElement) => void;
}

export default class NoteItem extends Component {
	protected templateString = templateString;
	private contentZone: HTMLElement | null = null;
	private openSubnoteBtn: HTMLElement | null = null;
	private titleElement: HTMLElement | null = null;
	private addSubnoteBtn: HTMLElement | null = null;
	private settingsBtn: HTMLElement | null = null;

	private boundHandlers: {
		onContentClick?: () => void;
		onTitleDoubleClick?: (e: Event) => void;
		onAddSubnote?: (e: Event) => void;
		onSettings?: (e: Event) => void;
	} = {};

	constructor(private options: NoteItemOptions) {
		super();
	}

	protected getTemplateData() {
		const { note, isActive } = this.options;
		return {
			note: {
				id: note.ID,
				title: note.title,
			},
			isActive,
		};
	}

	onRender(): void {
		this.cacheElements();
		this.attachEvents();
	}

	private cacheElements(): void {
		this.titleElement =
			this.domElement?.querySelector('[data-name="noteItemTitle"]') || null;
		this.openSubnoteBtn =
			this.domElement?.querySelector('[data-action="openSubnote"]') || null;
		this.contentZone = this.titleElement;
		this.addSubnoteBtn =
			this.domElement?.querySelector('[data-action="addSubnote"]') || null;
		this.settingsBtn =
			this.domElement?.querySelector('[data-action="settings"]') || null;
	}

	private attachEvents(): void {
		if (this.contentZone) {
			this.boundHandlers.onContentClick = () => {
				this.options.onNoteClick(this.options.note.ID);
			};
			this.contentZone.addEventListener(
				'click',
				this.boundHandlers.onContentClick,
			);
		}

		if (this.titleElement) {
			this.boundHandlers.onTitleDoubleClick = (e: Event) => {
				e.stopPropagation();
				this.options.onTitleDoubleClick(
					this.options.note.ID,
					this.titleElement as HTMLElement,
				);
			};
			this.titleElement.addEventListener(
				'dblclick',
				this.boundHandlers.onTitleDoubleClick,
			);
		}

		if (this.openSubnoteBtn) {
			this.openSubnoteBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.options.onNoteClick(this.options.note.ID);
			});
		}

		if (this.addSubnoteBtn) {
			this.boundHandlers.onAddSubnote = (e: Event) => {
				e.stopPropagation();
				this.options.onAddSubnote(this.options.note.ID);
			};
			this.addSubnoteBtn.addEventListener(
				'click',
				this.boundHandlers.onAddSubnote,
			);
		}

		if (this.settingsBtn) {
			this.boundHandlers.onSettings = (e: Event) => {
				e.stopPropagation();
				this.options.onSettingsClick(
					this.options.note.ID,
					this.settingsBtn as HTMLElement,
				);
			};
			this.settingsBtn.addEventListener('click', this.boundHandlers.onSettings);
		}
	}

	private detachEvents(): void {
		if (this.contentZone && this.boundHandlers.onContentClick) {
			this.contentZone.removeEventListener(
				'click',
				this.boundHandlers.onContentClick,
			);
		}
		if (this.titleElement && this.boundHandlers.onTitleDoubleClick) {
			this.titleElement.removeEventListener(
				'dblclick',
				this.boundHandlers.onTitleDoubleClick,
			);
		}
		if (this.addSubnoteBtn && this.boundHandlers.onAddSubnote) {
			this.addSubnoteBtn.removeEventListener(
				'click',
				this.boundHandlers.onAddSubnote,
			);
		}
		if (this.settingsBtn && this.boundHandlers.onSettings) {
			this.settingsBtn.removeEventListener(
				'click',
				this.boundHandlers.onSettings,
			);
		}
	}

	setActive(isActive: boolean): void {
		if (this.domElement) {
			this.domElement.classList.toggle('sidebar__noteItem--active', isActive);
		}
	}

	updateTitle(title: string): void {
		if (this.titleElement) {
			this.titleElement.textContent = title;
			this.options.note.title = title;
		}
	}

	getNoteId(): string | number {
		return this.options.note.ID;
	}

	getNoteElement(): HTMLElement | null {
		return this.domElement;
	}

	getTitle(): string {
		return this.options.note.title;
	}

	getTitleElement(): HTMLElement | null {
		return this.titleElement;
	}

	destroy(): void {
		this.detachEvents();
		this.contentZone = null;
		this.titleElement = null;
		this.addSubnoteBtn = null;
		this.settingsBtn = null;
		this.boundHandlers = {};
	}
}
