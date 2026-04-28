import Handlebars from 'handlebars';
import NoteBody from '../../components/note/noteBody/noteBody.js';
import NoteHeader from '../../components/note/noteHeader/noteHeader.js';
import AttachPopup from '../../components/popups/attachPopup/attachPopup.js';
import { db } from '../../db.js';
import { noteService } from '../../services/noteService.js';
import { store } from '../../store.js';
import type { ActiveNote, Block } from '../../types.js';
import { handleAuthError } from '../../utils/handleAuthError.js';
import { registerHelpers } from '../../utils/utils.js';
import templateText from './mainPage.hbs?raw';
import './mainPage.scss';

let currentContainer: HTMLElement | null = null;
let unsubscribeFunctions: Array<() => void> = [];
let attachPopupInstance: AttachPopup | null = null;
let noteHeader: NoteHeader | null = null;
let noteBody: NoteBody | null = null;

export async function initMainPage(container: HTMLElement): Promise<void> {
	await cleanupMainPage();
	currentContainer = container;
	registerHelpers();
	const template = Handlebars.compile(templateText);
	let notes = store.getNotes();
	let activeNote = store.getActiveNote();
	if (notes.length === 0) {
		try {
			await noteService.getNotes();
			notes = store.getNotes();
		} catch (error) {
			if (handleAuthError(error)) return;
			console.error('Failed to load notes:', error);
		}
	}
	const savedNoteId = await db.settingsGet<string | number>('activeNoteId');
	if (savedNoteId && !activeNote) {
		try {
			await noteService.getNote(savedNoteId);
			activeNote = store.getActiveNote();
		} catch (error) {
			if (handleAuthError(error)) return;
			console.error('Failed to load saved note:', error);
		}
	}
	if (!activeNote && notes[0]?.ID) {
		try {
			await noteService.getNote(notes[0].ID);
			activeNote = store.getActiveNote();
		} catch (error) {
			if (handleAuthError(error)) return;
			console.error('Failed to load note:', error);
		}
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
		noteBody = new NoteBody((blocks: Block[]) => {
			store.setActiveBlocksSilently(blocks);
		});
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
			if (noteId && noteId !== store.getActiveNote()?.ID) {
				try {
					await noteService.getNote(noteId);
					const activeNoteData = store.getActiveNote();
					noteHeader?.updateNote(activeNoteData);
					const blocks = store.getActiveBlocks();
					await noteBody?.updateBlocks(blocks);
					setVisibility(!!activeNoteData);
				} catch (error) {
					if (handleAuthError(error)) return;
					console.error('Failed to load note:', error);
				}
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
	const unsubActiveBlocks = store.subscribe(
		'activeBlocks',
		async (blocks: Block[]) => {
			noteBody?.updateBlocks(blocks);
		},
	);
	unsubscribeFunctions.push(unsubActiveBlocks);
	setVisibility(!!store.getActiveNote());
	window.addEventListener('beforeunload', async () => {
		await noteBody?.saveAllBlocks();
	});
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') {
			noteBody?.saveAllBlocks();
		}
	});
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
			onBlockCreated: async (block: Block) => {
				const currentBlocks = store.getActiveBlocks();
				await noteBody?.updateBlocks(currentBlocks);
				setTimeout(() => {
					const newWrapper = document.querySelector(
						`.note__block-wrapper[data-block-id="${block.id}"]`,
					) as HTMLElement;
					const blockEl = newWrapper?.querySelector(
						'.note__block',
					) as HTMLElement;
					blockEl?.focus();
				}, 100);
			},
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
	unsubscribeFunctions.forEach((fn) => typeof fn === 'function' && fn());
	unsubscribeFunctions = [];
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
}
