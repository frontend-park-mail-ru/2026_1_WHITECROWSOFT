import type { SidebarNote } from '../../../types.js';
import Component from '../../component.js';
import NoteTreeNode from '../noteTreeNode/noteTreeNode.js';
import templateString from './noteTree.hbs?raw';
interface NoteTreeOptions {
	notes: SidebarNote[];
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
}

export default class NoteTree extends Component {
	protected templateString = templateString;
	private nodeComponents: Map<string | number, NoteTreeNode> = new Map();
	private container: HTMLElement | null = null;

	constructor(private options: NoteTreeOptions) {
		super();
	}

	protected getTemplateData() {
		return {
			notes: this.options.notes,
			hasNotes: this.options.notes.length > 0,
		};
	}

	onRender(): void {
		this.container =
			this.domElement?.querySelector('[data-tree-container]') || null;
		this.renderNodes();
	}

	private renderNodes(): void {
		if (!this.container) return;
		this.container.innerHTML = '';
		this.nodeComponents.clear();

		const registerComponent = (
			id: string | number,
			component: NoteTreeNode,
		) => {
			this.nodeComponents.set(id, component);
		};

		for (const note of this.options.notes) {
			const container = document.createElement('div');
			container.setAttribute('data-tree-node', String(note.id));
			this.container.appendChild(container);
			const nodeComponent = new NoteTreeNode({
				note,
				section: this.options.section,
				onNoteClick: this.options.onNoteClick,
				onToggle: this.options.onToggle,
				onAddSubnote: this.options.onAddSubnote,
				onSettingsClick: this.options.onSettingsClick,
				onTitleDoubleClick: this.options.onTitleDoubleClick,
				registerComponent,
			});
			nodeComponent.renderTo(container);
			this.nodeComponents.set(note.id, nodeComponent);
		}
	}

	updateNotes(notes: SidebarNote[]): void {
		this.options.notes = notes;
		this.renderNodes();
	}

	updateActiveNote(
		noteId: string | number | null,
		section?: 'personal' | 'shared' | 'favorite',
	): void {
		if (section && this.options.section !== section) {
			return;
		}
		const updateRecursive = (notes: SidebarNote[]): void => {
			for (const note of notes) {
				const isActive = String(note.id) === String(noteId);
				if (noteId) {
					note.isActive = isActive;
				} else {
					note.isActive = false;
				}
				const component = this.nodeComponents.get(note.id);
				if (component) {
					component.updateNote(note);
				}
				updateRecursive(note.children);
			}
		};
		updateRecursive(this.options.notes);
	}

	updateNoteId(localId: string | number, serverId: string | number): void {
		const updateInArray = (notes: SidebarNote[]): void => {
			for (const note of notes) {
				if (String(note.id) === String(localId)) {
					note.id = serverId;
					return;
				}
				updateInArray(note.children);
			}
		};
		updateInArray(this.options.notes);
		this.nodeComponents.get(localId)?.updateNoteId(localId, serverId);
		const component = this.nodeComponents.get(localId);
		if (component) {
			component.updateNoteId(localId, serverId);
			this.nodeComponents.set(serverId, component);
			this.nodeComponents.delete(localId);
		}
	}

	getNoteTitleElementById(noteId: string | number): HTMLElement | null {
		const component = this.nodeComponents.get(noteId);
		return component?.getTitleElement() || null;
	}

	destroy(): void {
		this.nodeComponents.forEach((component) => component.destroy());
		this.nodeComponents.clear();
	}
}
