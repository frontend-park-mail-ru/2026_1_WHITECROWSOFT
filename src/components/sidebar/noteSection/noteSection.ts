import type { SidebarNote } from '../../../types.js';
import Component from '../../component.js';
import NoteTree from '../noteTree/noteTree.js';
import templateString from './noteSection.hbs?raw';

interface NoteSectionOptions {
	title: string;
	notes: SidebarNote[];
	emptyMessage?: string;
	onNoteClick: (noteId: string | number) => void;
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
		if (this.noteTree) {
			this.noteTree.updateNotes(notes);
		} else if (notes.length > 0) {
			const treeContainer = this.domElement?.querySelector(
				'[data-tree-container]',
			);
			if (treeContainer) {
				this.noteTree = new NoteTree({
					notes,
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

	getNoteTitleElementById(noteId: string | number): HTMLElement | null {
		return this.noteTree?.getNoteTitleElementById(noteId) || null;
	}

	destroy(): void {
		this.noteTree?.destroy();
		this.noteTree = null;
	}
}
