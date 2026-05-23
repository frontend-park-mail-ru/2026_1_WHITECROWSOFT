import type { SidebarNote } from '../../../types.js';
import Component from '../../component.js';
import templateString from './noteTreeNode.hbs?raw';

interface NoteTreeNodeOptions {
	note: SidebarNote;
	section: 'personal' | 'shared' | 'favorite';
	onNoteClick: (
		noteId: string | number,
		section: 'personal' | 'shared' | 'favorite',
	) => void;
	onToggle: (noteId: string | number) => void;
	onAddSubnote: (noteId: string | number) => void;
	onSettingsClick: (
		noteId: string | number,
		anchor: HTMLElement,
		titleElement: HTMLElement,
	) => void;
	onTitleDoubleClick: (noteId: string | number, element: HTMLElement) => void;
	registerComponent?: (id: string | number, component: NoteTreeNode) => void;
}

export default class NoteTreeNode extends Component {
	protected templateString = templateString;

	private note: SidebarNote;
	private childComponents: Map<string | number, NoteTreeNode> = new Map();
	private titleElement: HTMLElement | null = null;
	private childrenContainer: HTMLElement | null = null;
	private contentElement: HTMLElement | null = null;
	private boundIconChangeHandler?: (e: Event) => void;

	constructor(private options: NoteTreeNodeOptions) {
		super();
		this.note = options.note;
	}

	protected getTemplateData() {
		return {
			id: this.note.id,
			title: this.note.title,
			iconUrl: this.note.iconUrl,
			level: this.note.level * 16,
			hasChildren: this.note.children.length > 0,
			isExpanded: this.note.isExpanded,
			isActive: this.note.isActive,
			children: this.note.children,
		};
	}

	onRender(): void {
		this.cacheElements();
		this.attachEvents();
		this.renderChildren();
	}

	private cacheElements(): void {
		this.titleElement =
			this.domElement?.querySelector('[data-name="noteTitle"]') || null;
		this.childrenContainer =
			this.domElement?.querySelector('[data-children-container]') || null;
		this.contentElement =
			this.domElement?.querySelector('.note-tree-node__content') || null;
	}

	private attachEvents(): void {
		const toggleBtn = this.domElement?.querySelector('[data-action="toggle"]');
		const addBtn = this.domElement?.querySelector('[data-action="addSubnote"]');
		const settingsBtn = this.domElement?.querySelector(
			'[data-action="settings"]',
		);
		this.contentElement?.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			if (!target.closest('[data-action]')) {
				this.options.onNoteClick(this.note.id, this.options.section);
			}
		});
		this.titleElement?.addEventListener('dblclick', (e) => {
			e.stopPropagation();
			this.options.onTitleDoubleClick(this.note.id, this.titleElement!);
		});
		toggleBtn?.addEventListener('click', (e) => {
			e.stopPropagation();
			this.options.onToggle(this.note.id);
		});
		addBtn?.addEventListener('click', (e) => {
			e.stopPropagation();
			this.options.onAddSubnote(this.note.id);
		});
		settingsBtn?.addEventListener('click', (e) => {
			e.stopPropagation();
			this.options.onSettingsClick(
				this.note.id,
				settingsBtn as HTMLElement,
				this.titleElement as HTMLElement,
			);
		});
		this.boundIconChangeHandler = (e: Event) =>
			this.handleIconChange(e as CustomEvent);
		window.addEventListener('noteIconChanged', this.boundIconChangeHandler);
	}

	private handleIconChange(e: CustomEvent): void {
		const { noteId, iconUrl } = e.detail;
		if (String(noteId) === String(this.note.id)) {
			this.note.iconUrl = iconUrl;
			const iconEl = this.domElement?.querySelector(
				'.note-tree-node__icon',
			) as HTMLImageElement;
			if (iconEl) {
				iconEl.src = iconUrl || '/icons/document.svg';
			}
		}
	}

	private renderChildren(): void {
		if (!this.childrenContainer) return;

		this.childrenContainer.innerHTML = '';
		this.childComponents.clear();

		for (const childNote of this.note.children) {
			const container = document.createElement('div');
			container.setAttribute('data-child-node', String(childNote.id));
			this.childrenContainer.appendChild(container);

			const childComponent = new NoteTreeNode({
				note: childNote,
				section: this.options.section,
				onNoteClick: this.options.onNoteClick,
				onToggle: this.options.onToggle,
				onAddSubnote: this.options.onAddSubnote,
				onSettingsClick: this.options.onSettingsClick,
				onTitleDoubleClick: this.options.onTitleDoubleClick,
				registerComponent: this.options.registerComponent,
			});
			childComponent.renderTo(container);
			this.childComponents.set(childNote.id, childComponent);
			if (this.options.registerComponent) {
				this.options.registerComponent(childNote.id, childComponent);
			}
		}
	}

	updateNote(note: SidebarNote): void {
		this.note = note;
		if (this.titleElement) {
			this.titleElement.textContent = note.title;
		}
		const iconEl = this.domElement?.querySelector(
			'.note-tree-node__doc-icon',
		) as HTMLImageElement;
		if (iconEl) {
			iconEl.src = note.iconUrl || '';
		}
		const toggleIcon = this.domElement?.querySelector(
			'.note-tree-node__toggle-icon',
		);
		if (toggleIcon) {
			toggleIcon.classList.toggle(
				'note-tree-node__toggle-icon--rotated',
				note.isExpanded,
			);
		}
		if (this.childrenContainer) {
			this.childrenContainer.style.display = note.isExpanded ? 'block' : 'none';
		}
		if (this.contentElement) {
			this.contentElement.classList.toggle(
				'note-tree-node__content--active',
				note.isActive,
			);
		}
		this.renderChildren();
	}

	updateNoteId(localId: string | number, serverId: string | number): void {
		this.domElement?.setAttribute('data-note-id', String(serverId));
		this.contentElement?.setAttribute('data-note-id', String(serverId));
	}

	getTitleElement(): HTMLElement | null {
		return this.titleElement;
	}

	destroy(): void {
		if (this.boundIconChangeHandler) {
			window.removeEventListener(
				'noteIconChanged',
				this.boundIconChangeHandler,
			);
		}
		this.childComponents.forEach((child) => child.destroy());
		this.childComponents.clear();
	}
}
