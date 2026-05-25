import type { SidebarNote } from '../../../types.js';
import Component from '../../component.js';
import NoteTree from '../noteTree/noteTree.js';
import templateString from './noteSection.hbs?raw';

interface NoteSectionOptions {
	title: string;
	notes: SidebarNote[];
	emptyMessage?: string;
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

export default class NoteSection extends Component {
	protected templateString = templateString;
	private noteTree: NoteTree | null = null;

	constructor(private options: NoteSectionOptions) {
		super();
	}

	protected getTemplateData() {
		return {
			title: this.options.title,
			hasNotes: this.options.notes.length > 0,
			emptyMessage: this.options.emptyMessage || 'Нет заметок',
		};
	}

	onRender(): void {
		const treeContainer = this.domElement?.querySelector(
			'[data-tree-container]',
		);
		if (treeContainer && this.options.notes.length > 0) {
			this.noteTree = new NoteTree({
				notes: this.options.notes,
				section: this.options.section,
				onNoteClick: this.options.onNoteClick,
				onToggle: this.options.onToggle,
				onAddSubnote: this.options.onAddSubnote,
				onSettingsClick: this.options.onSettingsClick,
				onTitleDoubleClick: this.options.onTitleDoubleClick,
			});
			this.noteTree.renderTo(treeContainer as HTMLElement);
		}
	}

	updateNotes(notes: SidebarNote[]): void {
		this.options.notes = notes;
		console.log('render sidebar:', notes);
		if (this.noteTree) {
			this.noteTree.updateNotes(notes);
		} else if (notes.length > 0) {
			const treeContainer = this.domElement?.querySelector(
				'[data-tree-container]',
			);
			if (treeContainer) {
				this.noteTree = new NoteTree({
					notes,
					section: this.options.section,
					onNoteClick: this.options.onNoteClick,
					onToggle: this.options.onToggle,
					onAddSubnote: this.options.onAddSubnote,
					onSettingsClick: this.options.onSettingsClick,
					onTitleDoubleClick: this.options.onTitleDoubleClick,
				});
				this.noteTree.renderTo(treeContainer as HTMLElement);
			}
		}
		const emptyEl = this.domElement?.querySelector('.note-section__empty');
		const treeEl = this.domElement?.querySelector('.note-section__tree');
		if (emptyEl && treeEl) {
			emptyEl.classList.toggle('hidden', notes.length > 0);
			treeEl.classList.toggle('hidden', notes.length === 0);
		}
	}

	updateActiveNote(noteId: string | number | null): void {
		this.noteTree?.updateActiveNote(noteId);
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
		this.noteTree?.updateNoteId(localId, serverId);
	}

	getNoteTitleElementById(noteId: string | number): HTMLElement | null {
		return this.noteTree?.getNoteTitleElementById(noteId) || null;
	}

	destroy(): void {
		this.noteTree?.destroy();
		this.noteTree = null;
	}
}
