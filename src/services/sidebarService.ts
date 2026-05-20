import { db } from '../db.js';
import { store } from '../store.js';
import type { Note, SidebarNote } from '../types.js';

export const sidebarService = {
	expandedState: new Map<string | number, boolean>(),

	getPersonalTreeFromStore(): SidebarNote[] {
		const notes = store.getNotes().filter((note) => note.is_public !== true);
		const tree = this.buildTree(notes, this.expandedState, 'personal');
		return tree;
	},

	getPublicTreeFromStore(): SidebarNote[] {
		const notes = store.getNotes().filter((note) => note.is_public === true);
		const tree = this.buildTree(notes, this.expandedState, 'shared');
		return tree;
	},

	getfavoriteTreeFromStore(): SidebarNote[] {
		const notes = store.getNotes().filter((note) => note.is_favorite === true);
		console.log(notes, store.getNotes());
		const tree = this.buildTree(notes, this.expandedState, 'favorite');
		return tree;
	},

	async getTreeFromDb(): Promise<Note[]> {
		return await db.notesGetAllWithChildren();
	},

	buildTree(
		notes: Note[],
		expandedState: Map<string | number, boolean>,
		section: 'personal' | 'shared' | 'favorite',
	): SidebarNote[] {
		const noteMap = new Map<string | number | null, SidebarNote>();
		const roots: SidebarNote[] = [];
		const activeNoteId = store.getActiveNoteId();
		const activeNoteSection = store.getActiveNote()?.section;
		for (const note of notes) {
			const isActive =
				note.ID === activeNoteId && activeNoteSection === section;
			noteMap.set(note.ID, {
				id: note.ID,
				title: note.title,
				parentId: note.parent_id || null,
				children: [],
				isExpanded: expandedState.get(note.ID) ?? false,
				isActive: isActive,
				level: 0,
				iconUrl: note.iconUrl,
			});
		}
		for (const note of noteMap.values()) {
			if (note.parentId) {
				const hasAsString = noteMap.has(String(note.parentId));
				const hasAsNumber = noteMap.has(Number(note.parentId));
				if (hasAsString) {
					const parent = noteMap.get(String(note.parentId))!;
					parent.children.push(note);
				} else if (hasAsNumber) {
					const parent = noteMap.get(Number(note.parentId))!;
					parent.children.push(note);
				} else {
					roots.push(note);
				}
			} else {
				roots.push(note);
			}
		}
		const sortChildren = (items: SidebarNote[]) => {
			items.sort((a, b) => a.title.localeCompare(b.title));
			for (const item of items) {
				if (item.children.length > 0) {
					sortChildren(item.children);
				}
			}
		};
		sortChildren(roots);
		const setLevels = (items: SidebarNote[], level: number) => {
			for (const item of items) {
				item.level = level;
				if (item.children.length > 0) {
					setLevels(item.children, level + 1);
				}
			}
		};
		setLevels(roots, 0);
		return roots;
	},

	toggleExpanded(noteId: string | number): void {
		const current = this.expandedState.get(noteId) ?? false;
		this.expandedState.set(noteId, !current);
	},

	setExpanded(noteId: string | number, expanded: boolean): void {
		this.expandedState.set(noteId, expanded);
	},

	isExpanded(noteId: string | number): boolean {
		return this.expandedState.get(noteId) ?? false;
	},

	expandAll(): void {
		const notes = store.getNotes();
		for (const note of notes) {
			if (note.parent_id !== undefined) {
				this.expandedState.set(note.ID, true);
			}
		}
	},

	collapseAll(): void {
		this.expandedState.clear();
	},

	findNoteInTree(
		notes: SidebarNote[],
		noteId: string | number,
	): SidebarNote | null {
		for (const note of notes) {
			if (String(note.id) === String(noteId)) {
				return note;
			}
			if (note.children.length > 0) {
				const found = this.findNoteInTree(note.children, noteId);
				if (found) return found;
			}
		}
		return null;
	},

	async getSubnotes(noteId: string | number): Promise<Note[]> {
		return await db.notesGetByParentId(noteId);
	},

	async getSubnoteTree(noteId: string | number): Promise<Note[]> {
		return await db.notesGetTree(noteId);
	},

	getBreadcrumb(noteId: string | number | undefined): string {
		const allNotes = store.getNotes();
		const notesMap = new Map(allNotes.map((n) => [n.ID, n]));
		const path: Note[] = [];
		let currentId: string | number | null | undefined = noteId;
		while (currentId) {
			const note = notesMap.get(currentId);
			if (note) {
				path.unshift(note);
				currentId = note.parent_id;
			} else {
				break;
			}
		}
		const pathNames = path.map((n) => n.title);
		return `Библиотека / ${pathNames.join(' / ')}`;
	},

	hasChildren(noteId: string | number): boolean {
		const allNotes = store.getNotes();
		return allNotes.some((note) => note.parent_id === noteId);
	},

	getChildrenCount(noteId: string | number): number {
		const allNotes = store.getNotes();
		return allNotes.filter((note) => note.parent_id === noteId).length;
	},
};
