import Handlebars from 'handlebars';
import NoteBody from '../../components/note/noteBody/noteBody.js';
import NoteHeader from '../../components/note/noteHeader/noteHeader.js';
import AttachPopup from '../../components/popups/attachPopup/attachPopup.js';
import { db } from '../../db.js';
import { noteService } from '../../services/noteService.js';
import { store } from '../../store.js';
import type { ActiveNote, Note } from '../../types.js';
import { CollaborativeCursorsRenderer } from '../../utils/collaborativeCursorsRenderer.js';
import { collabManager } from '../../utils/collaborativeManager.js';
import { handleAuthError } from '../../utils/handleAuthError.js';
import { registerHelpers } from '../../utils/utils.js';
import templateText from './mainPage.hbs?raw';
import './mainPage.scss';

let currentContainer: HTMLElement | null = null;
let unsubscribeFunctions: Array<() => void> = [];
let attachPopupInstance: AttachPopup | null = null;
let noteHeader: NoteHeader | null = null;
let noteBody: NoteBody | null = null;
let refreshNoteBodyHandler: ((e: Event) => void) | null = null;
let cursorsRenderer: CollaborativeCursorsRenderer | null = null;
let currentNoteId: string | number | null = null;

export async function initMainPage(
	container: HTMLElement,
	data?: { query?: Record<string, string> },
): Promise<void> {
	await cleanupMainPage();
	currentContainer = container;
	registerHelpers();

	const template = Handlebars.compile(templateText);
	let notes = store.getNotes();

	if (notes.length === 0) {
		try {
			await noteService.getNotes();
			notes = store.getNotes();
		} catch (error) {
			if (handleAuthError(error)) return;
			console.error('Failed to load notes:', error);
		}
	}
	const sharedNoteId = data?.query?.note;
	let noteIdToOpen: string | number | undefined | null;
	if (sharedNoteId) {
		noteIdToOpen = sharedNoteId;
	} else {
		noteIdToOpen = await db.settingsGet<string>('activeNoteId');
	}

	if (!noteIdToOpen && notes[0]?.ID) {
		noteIdToOpen = notes[0].ID;
	}

	const html = template({});
	container.innerHTML = html;

	const emptyState = container.querySelector('.empty-state') as HTMLElement;
	const noteContainer = container.querySelector(
		'.note-container',
	) as HTMLElement;
	const headerContainer = container.querySelector('.note__header-container');
	const bodyContainer = container.querySelector('.note__body-container');

	if (headerContainer) {
		noteHeader = new NoteHeader();
		noteHeader.renderTo(headerContainer as HTMLElement);
	}
	if (bodyContainer) {
		noteBody = new NoteBody();
		noteBody.renderTo(bodyContainer as HTMLElement);
		noteBody.getElement()?.addEventListener('addBlock', ((e: CustomEvent) => {
			handleAddBlock(e.detail.afterBlockId);
		}) as EventListener);
	}

	function setVisibility(hasNote: boolean): void {
		if (!emptyState || !noteContainer) return;
		emptyState.style.display = hasNote ? 'none' : 'flex';
		noteContainer.style.display = hasNote ? 'block' : 'none';
	}

	const unsubActiveNoteId = store.subscribe(
		'activeNoteId',
		async (noteId: string | number | null) => {
			if (!noteId) return;
			if (noteId === currentNoteId) return;

			currentNoteId = noteId;

			try {
				collabManager.stopCollab();
				cursorsRenderer?.cleanup();
				cursorsRenderer = null;

				await noteService.getNote(noteId);
				const activeNoteData = store.getActiveNote();
				setVisibility(!!activeNoteData);

				if (activeNoteData) {
					const note = store.getNotes().find((n: Note) => n.ID === noteId);
					const isPublic = note?.is_public === true;
					const noteBodyElement = noteBody?.getElement();
					if (noteBodyElement && isPublic) {
						cursorsRenderer = new CollaborativeCursorsRenderer(noteBodyElement);
						await collabManager.startCollab(String(noteId));
					}
				}
			} catch (error) {
				if (handleAuthError(error)) return;
				console.error('Failed to load note:', error);
			}
		},
	);
	unsubscribeFunctions.push(unsubActiveNoteId);

	const unsubActiveNote = store.subscribe(
		'activeNote',
		(activeNoteData: ActiveNote | null) => {
			noteHeader?.updateNote(activeNoteData);
			setVisibility(!!activeNoteData);
		},
	);
	unsubscribeFunctions.push(unsubActiveNote);
	setVisibility(!!store.getActiveNote());
	console.log('noteIdToOpen', noteIdToOpen);
	if (noteIdToOpen) {
		store.setActiveNoteId(noteIdToOpen);
	}
}

async function handleAddBlock(afterBlockId: string): Promise<void> {
	const activeNoteId = store.getActiveNoteId();
	if (!activeNoteId) return;
	if (attachPopupInstance) {
		attachPopupInstance.close();
		attachPopupInstance = null;
	}
	const btn = document.querySelector(
		`.note__block-wrapper[data-block-id="${afterBlockId}"] .note__block-add-btn`,
	) as HTMLElement | null;
	if (btn) {
		attachPopupInstance = new AttachPopup({
			anchorElement: btn,
			afterBlockId,
		});
		attachPopupInstance.open();
		const unsub = store.subscribe('activeNoteId', () => {
			if (attachPopupInstance) {
				attachPopupInstance.close();
				attachPopupInstance = null;
			}
		});
		unsubscribeFunctions.push(unsub);
	}
}

export async function cleanupMainPage(): Promise<void> {
	collabManager.stopCollab();

	cursorsRenderer?.cleanup();
	cursorsRenderer = null;

	unsubscribeFunctions.forEach((fn) => typeof fn === 'function' && fn());
	unsubscribeFunctions = [];
	if (refreshNoteBodyHandler) {
		window.removeEventListener('refreshNoteBody', refreshNoteBodyHandler);
		refreshNoteBodyHandler = null;
	}
	noteBody?.cleanup();
	noteBody = null;
	noteHeader = null;
	if (attachPopupInstance) {
		attachPopupInstance.close();
		attachPopupInstance = null;
	}
	if (currentContainer) {
		currentContainer.innerHTML = '';
		currentContainer = null;
	}
	currentNoteId = null;
}
