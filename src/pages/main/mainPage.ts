import Handlebars from 'handlebars';
import { AttachPopup } from '../../components/popups/attachPopup/attachPopup.js';
import { FormatPopup } from '../../components/popups/formatPopup/formatPopup.js';
import { db } from '../../db.js';
import { attachmentService } from '../../services/attachmentService.js';
import { noteService } from '../../services/noteService.js';
import { store } from '../../store.js';
import type { ActiveNote, Block } from '../../types.js';
import {
	applyFormattingToRange,
	clearFormattingFromBlock,
} from '../../utils/formattingUtils.js';
import { handleAuthError } from '../../utils/handleAuthError.js';
import { registerHelpers } from '../../utils/utils.js';
import templateText from './mainPage.hbs?raw';
import './mainPage.scss';

let dragMode = false;
let draggedBlock: HTMLElement | null = null;
let draggedFromIndex: number | null = null;

let formattingPopup: FormatPopup | null = null;
let isDraggingSelection = false;
let selectionTimeout: number | null = null;

let currentContainer: HTMLElement | null = null;
let unsubscribeFunctions: Array<() => void> = [];
let domEventListeners: Map<
	EventTarget,
	Map<string, EventListener[]>
> = new Map();
let attachPopupInstance: AttachPopup | null = null;

async function saveBlockContent(blockEl: HTMLElement): Promise<void> {
	const blockId = blockEl.dataset.blockId;
	const activeNoteId = store.getActiveNoteId();
	if (!activeNoteId || !blockId) return;

	const newContent = blockEl.innerHTML;
	const oldBlock = store
		.getActiveBlocks()
		.find((b) => String(b.id) === blockId);

	if (oldBlock && oldBlock.content !== newContent) {
		try {
			await noteService.updateBlockContent(activeNoteId, blockId, newContent);
			const blocks = store.getActiveBlocks();
			const updatedBlocks = blocks.map((b) =>
				String(b.id) === blockId ? { ...b, content: newContent } : b,
			);
			store.setActiveBlocks(updatedBlocks);
		} catch (error) {
			if (handleAuthError(error)) return;
			console.error('Failed to save block content:', error);
		}
	}
}

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

	const state = store.getState();
	const html = template(state);
	container.innerHTML = html;

	const emptyState = container.querySelector(
		'.emptyState',
	) as HTMLElement | null;
	const notePath = container.querySelector(
		'.note__breadcrumb',
	) as HTMLElement | null;
	const noteContent = container.querySelector(
		'.note__content',
	) as HTMLElement | null;
	const noteActions = container.querySelector(
		'.note__actions',
	) as HTMLElement | null;
	const titleEl = container.querySelector('.note__title') as HTMLElement | null;
	const breadcrumbEl = container.querySelector(
		'.note__breadcrumbItem--current',
	) as HTMLElement | null;

	function setVisibility(hasNote: boolean): void {
		if (!emptyState || !notePath || !noteContent || !noteActions) return;
		emptyState.style.display = hasNote ? 'none' : 'flex';
		notePath.style.display = hasNote ? 'flex' : 'none';
		noteContent.style.display = hasNote ? 'block' : 'none';
		noteActions.style.display = hasNote ? 'flex' : 'none';
	}

	const unsubActiveNote = store.subscribe(
		'activeNote',
		(activeNoteData: ActiveNote | null) => {
			if (titleEl) titleEl.textContent = activeNoteData?.title || '';
			if (breadcrumbEl)
				breadcrumbEl.textContent = activeNoteData?.breadcrumb || '';
			setVisibility(!!activeNoteData);
		},
	);
	unsubscribeFunctions.push(unsubActiveNote);

	const unsubActiveBlocks = store.subscribe(
		'activeBlocks',
		(blocks: Block[]) => {
			const noteBody = document.querySelector('.note__body');
			if (!noteBody) return;
			const currentBlocks = noteBody.querySelectorAll('.note__block');
			if (currentBlocks.length !== blocks.length) {
				_updateBlocksInDOM(blocks);
			} else {
				blocks.forEach((block, index) => {
					const blockEl = noteBody.querySelector(
						`.note__block[data-block-id="${block.id}"]`,
					) as HTMLElement;
					if (blockEl && blockEl.parentNode) {
						const currentIndex = Array.from(
							blockEl.parentNode.children,
						).indexOf(blockEl);
						if (currentIndex !== index) {
							const addBlockBtn = noteBody.querySelector('.note__addBlockBtn');
							if (addBlockBtn) {
								if (index >= currentIndex) {
									noteBody.insertBefore(blockEl, addBlockBtn);
								} else {
									noteBody.insertBefore(blockEl, addBlockBtn);
								}
							}
						}
					}
				});
			}
		},
	);
	unsubscribeFunctions.push(unsubActiveBlocks);

	const unsubActiveNoteId = store.subscribe(
		'activeNoteId',
		async (noteId: string | number | null) => {
			if (noteId && noteId !== store.getActiveNote()?.ID) {
				try {
					await noteService.getNote(noteId);
				} catch (error) {
					if (handleAuthError(error)) return;
					console.error('Failed to load note:', error);
				}
			}
		},
	);
	unsubscribeFunctions.push(unsubActiveNoteId);

	setVisibility(!!store.getActiveNote());
	_updateActiveNoteInDOM(store.getActiveNote());
	_updateBlocksInDOM(store.getActiveBlocks());

	const addBlockBtn = container.querySelector(
		'.note__addBlockBtn',
	) as HTMLElement | null;
	if (addBlockBtn) {
		const addBlockHandler = (e: Event) => {
			e.stopPropagation();

			const activeNoteId = store.getActiveNoteId();
			if (!activeNoteId) {
				console.warn('No active note to add block');
				return;
			}

			if (attachPopupInstance) {
				attachPopupInstance.close();
				attachPopupInstance = null;
			} else {
				attachPopupInstance = new AttachPopup(addBlockBtn);
				attachPopupInstance.open();

				const closeOnNoteChange = () => {
					if (attachPopupInstance) {
						attachPopupInstance.close();
						attachPopupInstance = null;
					}
				};

				const unsub = store.subscribe('activeNoteId', closeOnNoteChange);
				unsubscribeFunctions.push(unsub);
			}
		};

		addBlockBtn.addEventListener('click', addBlockHandler);
		_addEventListener(addBlockBtn, 'click', addBlockHandler);
	}

	const dragBlockBtn = container.querySelector(
		'.note__dragBlock',
	) as HTMLElement | null;
	if (dragBlockBtn) {
		const dragBlockHandler = () => {
			const activeNoteId = store.getActiveNoteId();
			if (!activeNoteId) {
				console.warn('No active note to drag blocks');
				return;
			}

			dragMode = !dragMode;
			dragBlockBtn.classList.toggle('note__dragBlock--active', dragMode);
			const noteBody = container.querySelector(
				'.note__body',
			) as HTMLElement | null;
			if (noteBody) {
				const blocks = noteBody.querySelectorAll('.note__block');
				blocks.forEach((block) => {
					(block as HTMLElement).draggable = dragMode;
					if (dragMode) {
						block.classList.add('note__block--draggable');
					} else {
						block.classList.remove('note__block--draggable');
					}
				});
			}
		};

		dragBlockBtn.addEventListener('click', dragBlockHandler);
		_addEventListener(dragBlockBtn, 'click', dragBlockHandler);
	}

	const noteBody = container.querySelector('.note__body') as HTMLElement | null;
	if (noteBody) {
		const createHandler = (event: string, handler: (e: Event) => void) => {
			const wrappedHandler = handler.bind(noteBody);
			noteBody.addEventListener(event, wrappedHandler);
			_addEventListener(noteBody, event, wrappedHandler);
			return wrappedHandler;
		};

		createHandler('contextmenu', (e: Event) => {
			e.preventDefault();
		});

		createHandler('mousedown', (e: Event) => {
			const target = e.target as HTMLElement;
			if (target.closest('.formattingPopup')) return;

			if (formattingPopup) {
				formattingPopup.close();
				formattingPopup = null;
			}
			isDraggingSelection = true;
		});

		createHandler('mouseup', () => {
			if (!isDraggingSelection) return;
			isDraggingSelection = false;

			if (selectionTimeout) clearTimeout(selectionTimeout);
			selectionTimeout = window.setTimeout(() => {
				const selection = window.getSelection();
				if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
					const range = selection.getRangeAt(0);
					if (noteBody.contains(range.commonAncestorContainer)) {
						if (formattingPopup) {
							formattingPopup.close();
						}
						formattingPopup = new FormatPopup(range.cloneRange(), noteBody);
						formattingPopup.open();
					}
				}
			}, 10);
		});

		createHandler('click', (e: Event) => {
			const target = e.target as HTMLElement;
			if (target.closest('.formattingPopup')) return;

			const selection = window.getSelection();
			if (selection && selection.isCollapsed && formattingPopup) {
				formattingPopup.close();
				formattingPopup = null;
			}
		});

		createHandler('scroll', () => {
			if (formattingPopup) {
				formattingPopup.close();
				formattingPopup = null;
			}
		});

		createHandler('dragstart', (e: Event) => {
			const dragEvent = e as DragEvent;
			const target = dragEvent.target as HTMLElement;
			if (target.classList.contains('note__block') && dragMode) {
				draggedBlock = target;
				const blocks = noteBody.querySelectorAll('.note__block');
				draggedFromIndex = Array.from(blocks).indexOf(target);
				target.classList.add('note__block--dragging');
				if (dragEvent.dataTransfer) {
					dragEvent.dataTransfer.effectAllowed = 'move';
					dragEvent.dataTransfer.setData('text/html', target.innerHTML);
				}
			}
		});

		createHandler('dragover', (e: Event) => {
			const dragEvent = e as DragEvent;
			if (dragMode && draggedBlock) {
				dragEvent.preventDefault();
				if (dragEvent.dataTransfer) {
					dragEvent.dataTransfer.dropEffect = 'move';
				}

				const afterElement = _getDragAfterElement(noteBody, dragEvent.clientY);
				if (afterElement == null) {
					noteBody.appendChild(draggedBlock);
				} else if (afterElement !== draggedBlock) {
					noteBody.insertBefore(draggedBlock, afterElement);
				}
			}
		});

		createHandler('drop', async (e: Event) => {
			const dragEvent = e as DragEvent;
			if (dragMode && draggedBlock) {
				dragEvent.preventDefault();
				dragEvent.stopPropagation();
			}
		});

		noteBody.addEventListener('dragend', async () => {
			if (draggedBlock) {
				draggedBlock.classList.remove('note__block--dragging');

				if (dragMode) {
					const blocks = noteBody.querySelectorAll('.note__block');
					const newIndex = Array.from(blocks).indexOf(draggedBlock);

					if (draggedFromIndex !== newIndex && newIndex !== -1) {
						const activeNoteId = store.getActiveNoteId();
						const blockId = draggedBlock.dataset.blockId;

						if (activeNoteId && blockId) {
							try {
								await noteService.moveBlock(activeNoteId, blockId, newIndex);
							} catch (error) {
								if (handleAuthError(error)) return;
								console.error('Error moving block:', error);
							}
						}
					}
				}

				draggedBlock = null;
				draggedFromIndex = null;
			}
		});
	}

	const globalKeydownHandler = (e: KeyboardEvent) => {
		if (e.key === 'Escape' && formattingPopup) {
			formattingPopup.close();
			formattingPopup = null;
		}
	};
	document.addEventListener('keydown', globalKeydownHandler as EventListener);
	_addEventListener(document, 'keydown', globalKeydownHandler as EventListener);
}

function _addEventListener(
	element: EventTarget,
	event: string,
	handler: EventListener,
): void {
	if (!domEventListeners.has(element)) {
		domEventListeners.set(element, new Map());
	}
	const elementListeners = domEventListeners.get(element)!;
	if (!elementListeners.has(event)) {
		elementListeners.set(event, []);
	}
	elementListeners.get(event)!.push(handler);
}

export async function cleanupMainPage(): Promise<void> {
	unsubscribeFunctions.forEach((unsubscribe) => {
		if (typeof unsubscribe === 'function') {
			unsubscribe();
		}
	});
	unsubscribeFunctions = [];

	for (const [element, events] of domEventListeners.entries()) {
		if (element && 'removeEventListener' in element) {
			for (const [event, handlers] of events.entries()) {
				handlers.forEach((handler) => {
					element.removeEventListener(event, handler);
				});
			}
		}
	}
	domEventListeners.clear();

	if (formattingPopup) {
		formattingPopup.close();
		formattingPopup = null;
	}

	if (attachPopupInstance) {
		attachPopupInstance.close();
		attachPopupInstance = null;
	}

	if (selectionTimeout) {
		clearTimeout(selectionTimeout);
		selectionTimeout = null;
	}

	dragMode = false;
	draggedBlock = null;
	draggedFromIndex = null;
	isDraggingSelection = false;

	if (currentContainer) {
		currentContainer.innerHTML = '';
		currentContainer = null;
	}
}

function _updateActiveNoteInDOM(activeNote: ActiveNote | null): void {
	const titleEl = document.querySelector('.note__title') as HTMLElement | null;
	const breadcrumbEl = document.querySelector(
		'.note__breadcrumbItem--current',
	) as HTMLElement | null;

	if (!activeNote) {
		if (titleEl) titleEl.textContent = '';
		if (breadcrumbEl) breadcrumbEl.textContent = '';
		return;
	}

	if (titleEl) titleEl.textContent = activeNote.title;
	if (breadcrumbEl) breadcrumbEl.textContent = activeNote.breadcrumb;
}

async function _updateBlocksInDOM(blocks: Block[]): Promise<void> {
	const noteBody = document.querySelector('.note__body') as HTMLElement | null;
	if (!noteBody) return;

	const currentDragMode = dragMode;

	const existingBlocks = noteBody.querySelectorAll('.note__block');
	existingBlocks.forEach((b) => b.remove());

	for (const block of blocks) {
		let blockEl: HTMLElement;

		if (block.block_type_id === 2 && block.content) {
			try {
				const imageData = JSON.parse(block.content) as {
					attachmentId: string | number;
				};
				const attachmentId = imageData.attachmentId;
				const activeNoteId = store.getActiveNoteId();
				const noteId = block.note_id || activeNoteId;
				if (!noteId) {
					blockEl = document.createElement('div');
					blockEl.className = 'note__block';
					blockEl.dataset.blockId = String(block.id);
					blockEl.contentEditable = 'true';
					blockEl.innerHTML = block.content;
				} else {
					const imageUrl = await attachmentService.getImageUrl(
						attachmentId,
						noteId,
						block.id,
					);

					blockEl = document.createElement('div');
					blockEl.className = 'note__block note__imageblock';
					blockEl.dataset.blockId = String(block.id);

					const img = document.createElement('img');
					img.src = imageUrl || '';

					img.onerror = () => {
						console.error('Failed to load image:', imageUrl);
						img.style.display = 'none';
						const errorText = document.createElement('div');
						errorText.textContent = '⚠️ Не удалось загрузить изображение';
						errorText.style.color = '#999';
						errorText.style.fontSize = '12px';
						errorText.style.padding = '8px';
						blockEl.appendChild(errorText);
					};

					blockEl.appendChild(img);
				}
			} catch (e) {
				console.error('Error updating image block:', e);
				blockEl = document.createElement('div');
				blockEl.className = 'note__block';
				blockEl.dataset.blockId = String(block.id);
				blockEl.contentEditable = 'true';
				blockEl.innerHTML = block.content;
			}
		} else {
			blockEl = document.createElement('div');
			blockEl.className = 'note__block';
			blockEl.dataset.blockId = String(block.id);
			blockEl.contentEditable = 'true';
			blockEl.innerHTML = block.content;
		}

		blockEl.addEventListener('blur', () => {
			saveBlockContent(blockEl);
		});

		blockEl.draggable = currentDragMode;
		if (currentDragMode) {
			blockEl.classList.add('note__block--draggable');
		}

		const addBlockBtn = noteBody.querySelector('.note__addBlockBtn');
		if (addBlockBtn) {
			noteBody.insertBefore(blockEl, addBlockBtn);
		} else {
			noteBody.appendChild(blockEl);
		}

		if (block.block_type_id !== 2) {
			clearFormattingFromBlock(blockEl);
			const ranges = block.formatting?.ranges || [];
			ranges.forEach((rng) => {
				applyFormattingToRange(blockEl, rng.start_pos, rng.end_pos, {
					bold: rng.bold || false,
					italic: rng.italic || false,
					underline: rng.underline || false,
				});
			});
		}
	}
}

function _getDragAfterElement(
	container: HTMLElement,
	y: number,
): HTMLElement | undefined {
	const draggableElements = [
		...container.querySelectorAll('.note__block:not(.dragging)'),
	] as HTMLElement[];

	const result = draggableElements.reduce<{
		offset: number;
		element: HTMLElement | null;
	}>(
		(closest, child) => {
			const rect = child.getBoundingClientRect();
			if (rect.height === 0 || rect.width === 0 || !child.offsetParent) {
				return closest;
			}
			const offset = y - rect.top - rect.height / 2;

			if (offset < 0 && offset > closest.offset) {
				return { offset: offset, element: child };
			} else {
				return closest;
			}
		},
		{ offset: Number.NEGATIVE_INFINITY, element: null },
	);

	return result.element || undefined;
}
