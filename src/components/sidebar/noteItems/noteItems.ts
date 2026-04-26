import type { Note } from '../../../types.js';
import Component from '../../component.js';
import NoteItem from '../noteItem/noteItem.js';
import templateString from './noteItems.hbs?raw';

interface NoteItemsOptions {
	notes: Note[];
	activeNoteId: string | number | null;
	title?: string;
	emptyMessage?: string;
	onNoteClick: (noteId: string | number) => void;
	onAddSubnote: (noteId: string | number) => void;
	onSettingsClick: (noteId: string | number, anchor: HTMLElement) => void;
	onTitleDoubleClick: (noteId: string | number, element: HTMLElement) => void;
}

export default class NoteItems extends Component {
	protected templateString = templateString;
	private noteComponents: Map<string | number, NoteItem> = new Map();
	private container: HTMLElement | null = null;

	constructor(private options: NoteItemsOptions) {
		super();
	}

	protected getTemplateData() {
		const { notes, title, emptyMessage = 'Нет заметок' } = this.options;
		return {
			title,
			notes,
			emptyMessage,
			hasNotes: notes.length > 0,
		};
	}

	onRender(): void {
		const container = this.domElement?.querySelector(
			'[data-notes-container="true"]',
		);
		this.container = container instanceof HTMLElement ? container : null;
		this.renderNoteItems();
	}

	private renderNoteItems(): void {
		if (!this.container) {
			return;
		}
		const {
			notes,
			activeNoteId,
			onNoteClick,
			onAddSubnote,
			onSettingsClick,
			onTitleDoubleClick,
		} = this.options;
		notes.forEach((note) => {
			const placeholder = this.container?.querySelector(
				`[data-note-container="${note.ID}"]`,
			);
			if (placeholder instanceof HTMLElement) {
				const isActive = String(activeNoteId) === String(note.ID);
				const noteItem = new NoteItem({
					note,
					isActive,
					onNoteClick,
					onAddSubnote,
					onSettingsClick,
					onTitleDoubleClick,
				});
				noteItem.renderTo(placeholder);
				this.noteComponents.set(note.ID, noteItem);
			}
		});
	}

	syncNotes(notes: Note[], activeNoteId: string | number | null): void {
		const newIds = new Set(notes.map((n) => n.ID));
		const currentIds = new Set(this.noteComponents.keys());
		for (const id of currentIds) {
			if (!newIds.has(id)) {
				this.removeNoteItem(id);
			}
		}
		for (const note of notes) {
			if (!this.noteComponents.has(note.ID)) {
				this.addNoteItem(note, String(activeNoteId) === String(note.ID));
			}
		}
		this.reorderNotes(notes);
		this.updateActiveNote(activeNoteId);
		for (const note of notes) {
			const component = this.noteComponents.get(note.ID);
			if (component && component.getTitle() !== note.title) {
				component.updateTitle(note.title);
			}
		}
		this.options.notes = notes;
		this.options.activeNoteId = activeNoteId;
	}

	private addNoteItem(note: Note, isActive: boolean): void {
		if (!this.container) return;
		const { onNoteClick, onAddSubnote, onSettingsClick, onTitleDoubleClick } =
			this.options;
		const noteContainer = document.createElement('div');
		noteContainer.setAttribute('data-note-container', String(note.ID));
		const targetIndex = this.options.notes.findIndex((n) => n.ID === note.ID);
		const nextNoteId = this.options.notes[targetIndex + 1]?.ID;
		const nextContainer = nextNoteId
			? this.container.querySelector(`[data-note-container="${nextNoteId}"]`)
			: null;
		if (nextContainer) {
			this.container.insertBefore(noteContainer, nextContainer);
		} else {
			this.container.appendChild(noteContainer);
		}
		const noteItem = new NoteItem({
			note,
			isActive,
			onNoteClick,
			onAddSubnote,
			onSettingsClick,
			onTitleDoubleClick,
		});
		noteItem.renderTo(noteContainer);
		this.noteComponents.set(note.ID, noteItem);
	}

	private removeNoteItem(noteId: string | number): void {
		const component = this.noteComponents.get(noteId);
		if (component) {
			const noteElement = component.getNoteElement();
			const container = noteElement?.parentElement;
			container?.remove();
			component.destroy();
			this.noteComponents.delete(noteId);
		}
	}

	private reorderNotes(notes: Note[]): void {
		if (!this.container) {
			return;
		}
		const currentOrder = Array.from(this.container.children);
		const correctOrder = notes.map((note) =>
			this.container?.querySelector(`[data-note-container="${note.ID}"]`),
		);
		for (let i = 0; i < correctOrder.length; i++) {
			const currentElement = currentOrder[i];
			const correctElement = correctOrder[i];
			if (currentElement !== correctElement && correctElement) {
				this.container.insertBefore(correctElement, currentElement || null);
			}
		}
	}

	updateActiveNote(noteId: string | number | null): void {
		const oldActiveId = this.options.activeNoteId;
		this.options.activeNoteId = noteId;
		if (oldActiveId && this.noteComponents.has(oldActiveId)) {
			this.noteComponents.get(oldActiveId)?.setActive(false);
		}
		if (noteId && this.noteComponents.has(noteId)) {
			this.noteComponents.get(noteId)?.setActive(true);
		}
	}

	updateNotes(notes: Note[], activeNoteId: string | number | null): void {
		this.options.notes = notes;
		this.options.activeNoteId = activeNoteId;
		this.update();
	}

	getNoteTitleElementById(noteId: string | number): HTMLElement | null {
		const noteItem = this.noteComponents.get(noteId);
		return noteItem?.getTitleElement() || null;
	}

	destroy(): void {
		this.noteComponents.forEach((component) => {
			component.destroy?.();
		});
		this.noteComponents.clear();
	}
}
