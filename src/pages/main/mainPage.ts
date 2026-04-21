import Handlebars from 'handlebars';
import { AttachPopup } from '../../components/popups/attachPopup/attachPopup.js';
import { FormatPopup } from '../../components/popups/formatPopup/formatPopup.js';
import { db } from '../../db.js';
import { attachmentService } from '../../services/attachmentService.js';
import { noteService } from '../../services/noteService.js';
import { store } from '../../store.js';
import type { ActiveNote, Block } from '../../types.js';
import { rebuildBlockFromRanges } from '../../utils/formattingUtils.js';
import { handleAuthError } from '../../utils/handleAuthError.js';
import { registerHelpers } from '../../utils/utils.js';
import templateText from './mainPage.hbs?raw';
import './mainPage.scss';

let draggedBlockWrapper: HTMLElement | null = null;
let draggedBlockId: string | null = null;
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

async function saveAllBlocksContent(): Promise<void> {
	const noteBody = document.querySelector('.note__body') as HTMLElement | null;
	if (!noteBody) return;

	const blocks = noteBody.querySelectorAll('.note__block');
	const savePromises: Promise<Block | void>[] = [];

	for (const blockEl of blocks) {
		const htmlBlock = blockEl as HTMLElement;

		if (htmlBlock.classList.contains('note__imageBlock')) {
			continue;
		}

		const blockId = htmlBlock.dataset.blockId;
		const activeNoteId = store.getActiveNoteId();

		if (activeNoteId && blockId) {
			const newContent = htmlBlock.innerHTML;
			const oldBlock = store
				.getActiveBlocks()
				.find((b) => String(b.id) === blockId);

			if (oldBlock && oldBlock.content !== newContent) {
				savePromises.push(
					noteService
						.updateBlockContent(activeNoteId, blockId, newContent)
						.catch((error) => {
							console.error('Failed to save block on unload:', error);
							return undefined;
						}),
				);
			}
		}
	}

	if (savePromises.length > 0) {
		await Promise.all(savePromises);
	}
}

async function saveBlockContent(blockEl: HTMLElement): Promise<void> {
	const blockId = blockEl.dataset.blockId;
	const activeNoteId = store.getActiveNoteId();
	if (!activeNoteId || !blockId) return;

	if (blockEl.classList.contains('note__imageBlock')) {
		return;
	}

	if (blockEl.contentEditable !== 'true') {
		return;
	}

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
			store.setActiveBlocksSilently(updatedBlocks);
		} catch (error) {
			if (handleAuthError(error)) return;
			console.error('Failed to save block content:', error);
		}
	}
}

async function deleteBlock(
	blockId: string,
	blockEl: HTMLElement,
): Promise<void> {
	const activeNoteId = store.getActiveNoteId();
	if (!activeNoteId) return;

	const blocks = store.getActiveBlocks();
	const block = blocks.find((b) => String(b.id) === blockId);

	if (block && block.block_type_id === 2 && block.content) {
		try {
			await attachmentService.deleteAttachment(activeNoteId, blockId);
		} catch (error) {
			console.error('Failed to delete attachment:', error);
		}
	}

	if (blocks.length > 1) {
		await noteService.deleteBlock(activeNoteId, blockId);
		const updatedBlocks = blocks.filter((b) => String(b.id) !== blockId);
		store.setActiveBlocksSilently(updatedBlocks);
	}
}

function startTitleInlineEdit(
	titleEl: HTMLElement,
	currentTitle: string,
): void {
	const input = document.createElement('input');
	input.type = 'text';
	input.value = currentTitle;
	input.className = 'note__title-input';
	input.style.width = '100%';
	input.style.border = 'none';
	input.style.outline = 'none';
	input.style.background = 'transparent';
	input.style.fontSize = '2rem';
	input.style.fontWeight = '800';
	input.style.fontFamily = 'inherit';
	input.style.color = 'var(--text)';

	titleEl.replaceWith(input);
	input.focus();
	input.select();

	const saveEdit = async (): Promise<void> => {
		const newTitle = input.value.trim();
		const activeNoteId = store.getActiveNoteId();

		if (activeNoteId && newTitle && newTitle !== currentTitle) {
			try {
				await noteService.updateNote(activeNoteId, { title: newTitle });
				const activeNote = store.getActiveNote();
				if (activeNote) {
					const updatedNote = {
						...activeNote,
						title: newTitle,
						breadcrumb: newTitle,
					};
					store.setActiveNote(updatedNote);
				}
			} catch (error) {
				console.error('Error renaming note:', error);
			}
		}

		const newTitleEl = document.createElement('h1');
		newTitleEl.className = 'note__title';
		newTitleEl.textContent = newTitle || currentTitle;
		input.replaceWith(newTitleEl);

		newTitleEl.addEventListener('dblclick', () => {
			startTitleInlineEdit(newTitleEl, newTitleEl.textContent || '');
		});
	};

	const cancelEdit = (): void => {
		const newTitleEl = document.createElement('h1');
		newTitleEl.className = 'note__title';
		newTitleEl.textContent = currentTitle;
		input.replaceWith(newTitleEl);

		newTitleEl.addEventListener('dblclick', () => {
			startTitleInlineEdit(newTitleEl, currentTitle);
		});
	};

	input.addEventListener('blur', saveEdit);
	input.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			saveEdit();
		} else if (e.key === 'Escape') {
			cancelEdit();
		}
	});
}

export async function createBlockWrapperDOM(
	block: Block,
): Promise<HTMLElement> {
	const wrapper = document.createElement('div');
	wrapper.className = 'note__block-wrapper';
	wrapper.dataset.blockId = String(block.id);
	wrapper.setAttribute('tabindex', '-1');

	let blockEl: HTMLElement;

	if (block.block_type_id === 2) {
		blockEl = document.createElement('div');
		blockEl.className = 'note__block note__imageBlock';
		blockEl.dataset.blockId = String(block.id);
		blockEl.setAttribute('tabindex', '0');
		blockEl.style.cursor = 'pointer';
		blockEl.style.outline = 'none';
		blockEl.contentEditable = 'false';

		const updateImage = async () => {
			if (
				block.content &&
				block.content.trim() !== '' &&
				block.content !== '{}'
			) {
				try {
					const imageData = JSON.parse(block.content) as {
						attachmentId: string | number;
					};
					const attachmentId = imageData.attachmentId;
					const noteId = block.note_id || store.getActiveNoteId();
					if (noteId && attachmentId) {
						const imageUrl = await attachmentService.getImageUrl(
							attachmentId,
							noteId,
							block.id,
						);
						if (imageUrl) {
							const img = document.createElement('img');
							img.src = imageUrl;
							img.style.display = 'block';
							img.style.maxWidth = '100%';
							img.style.pointerEvents = 'none';
							blockEl.innerHTML = '';
							blockEl.appendChild(img);
							return;
						}
					}
				} catch (e) {
					console.warn('Failed to parse image content', e);
				}
			}
			const placeholder = document.createElement('div');
			placeholder.textContent = '⏳ Загрузка изображения...';
			placeholder.style.cssText = 'color:#999;font-size:12px;padding:8px';
			blockEl.innerHTML = '';
			blockEl.appendChild(placeholder);
		};

		await updateImage();

		blockEl.addEventListener('focus', () => {
			wrapper.classList.add('note__block-wrapper--focused');
			const actions = wrapper.querySelector(
				'.note__block-actions',
			) as HTMLElement;
			if (actions) {
				actions.style.opacity = '1';
				actions.style.visibility = 'visible';
			}
		});

		blockEl.addEventListener('blur', () => {
			wrapper.classList.remove('note__block-wrapper--focused');
			const actions = wrapper.querySelector(
				'.note__block-actions',
			) as HTMLElement;
			if (actions) {
				actions.style.opacity = '0';
				actions.style.visibility = 'hidden';
			}
		});

		blockEl.addEventListener('click', (e) => {
			e.stopPropagation();
			blockEl.focus();
		});
	} else {
		blockEl = document.createElement('div');
		blockEl.className = 'note__block';
		blockEl.dataset.blockId = String(block.id);
		blockEl.contentEditable = 'true';
		blockEl.innerHTML = block.content || '';

		blockEl.addEventListener('blur', async () => {
			await saveBlockContent(blockEl);
		});
	}

	const actions = document.createElement('div');
	actions.className = 'note__block-actions';
	actions.innerHTML = `
    <button class="note__block-add-btn" data-action="add" title="Добавить новый блок">
      <img src="/icons/block_add.svg" class="icon" />
    </button>
    <button class="note__block-drag-btn" data-action="drag" draggable="true" title="Перетащить блок">
      <img src="/icons/block_drag.svg" class="icon" />
    </button>
  `;

	wrapper.appendChild(blockEl);
	wrapper.appendChild(actions);

	if (block.block_type_id !== 2) {
		const ranges = block.formatting?.ranges || [];
		if (ranges.length > 0) {
			rebuildBlockFromRanges(blockEl, ranges);
		}
	}

	return wrapper;
}

export async function insertBlockInDOM(
	block: Block,
	afterBlockId?: string | null,
): Promise<HTMLElement | null> {
	const noteBody = document.querySelector('.note__body') as HTMLElement | null;
	if (!noteBody) return null;

	const existingWrapper = noteBody.querySelector(
		`.note__block-wrapper[data-block-id="${String(block.id)}"]`,
	);
	if (existingWrapper) return null;

	const wrapper = await createBlockWrapperDOM(block);

	if (afterBlockId) {
		const afterWrapper = noteBody.querySelector(
			`.note__block-wrapper[data-block-id="${afterBlockId}"]`,
		);
		if (afterWrapper && afterWrapper.nextSibling) {
			noteBody.insertBefore(wrapper, afterWrapper.nextSibling);
		} else if (afterWrapper) {
			noteBody.appendChild(wrapper);
		} else {
			noteBody.appendChild(wrapper);
		}
	} else {
		noteBody.appendChild(wrapper);
	}

	wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });

	const blockEl = wrapper.querySelector('.note__block') as HTMLElement;
	if (blockEl && block.block_type_id !== 2) {
		blockEl.focus();
	}

	return wrapper;
}

export function removeBlockFromDOM(blockId: string): void {
	const noteBody = document.querySelector('.note__body') as HTMLElement | null;
	if (!noteBody) return;

	const wrapper = noteBody.querySelector(
		`.note__block-wrapper[data-block-id="${blockId}"]`,
	);
	if (wrapper) {
		wrapper.remove();
	}
}

async function _fullRenderBlocks(blocks: Block[]): Promise<void> {
	const noteBody = document.querySelector('.note__body') as HTMLElement | null;
	if (!noteBody) return;

	noteBody.innerHTML = '';

	if (blocks.length === 0) {
		const activeNoteId = store.getActiveNoteId();
		if (!activeNoteId) return;

		// Автоматически создаём первый блок
		try {
			const newBlock = await noteService.createBlock(activeNoteId, {
				note_id: activeNoteId,
				block_type_id: 1,
				position: 0,
				content: '',
			});

			if (newBlock) {
				// Обновляем blocks в store
				const updatedBlocks = [newBlock];
				store.setActiveBlocksSilently(updatedBlocks);

				// Рендерим блок
				const wrapper = await createBlockWrapperDOM(newBlock);
				noteBody.appendChild(wrapper);

				// Фокусируемся на блоке для начала ввода
				const blockEl = wrapper.querySelector('.note__block') as HTMLElement;
				if (blockEl && newBlock.block_type_id !== 2) {
					blockEl.focus();
				}
			}
		} catch (error) {
			console.error('Failed to create first block:', error);

			// Если не удалось создать блок, показываем кнопку как fallback
			const emptyState = document.createElement('div');
			emptyState.className = 'note__empty-state';
			emptyState.innerHTML = `
        <div class="note__empty-state-content">
          <p>Не удалось создать блок</p>
          <button class="note__empty-state-btn" data-action="create-first-block">Попробовать снова</button>
        </div>
      `;

			const createBtn = emptyState.querySelector(
				'[data-action="create-first-block"]',
			);
			if (createBtn) {
				createBtn.addEventListener('click', async () => {
					const activeNoteId = store.getActiveNoteId();
					if (activeNoteId) {
						const newBlock = await noteService.createBlock(activeNoteId, {
							note_id: activeNoteId,
							block_type_id: 1,
							position: 0,
							content: '',
						});
						if (newBlock) {
							store.setActiveBlocks([newBlock]);
						}
					}
				});
			}

			noteBody.appendChild(emptyState);
		}
		return;
	}

	// Рендерим существующие блоки
	for (const block of blocks) {
		const wrapper = await createBlockWrapperDOM(block);
		noteBody.appendChild(wrapper);
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
	const titleEl = container.querySelector('.note__title') as HTMLElement | null;
	const breadcrumbEl = container.querySelector(
		'.note__breadcrumbItem--current',
	) as HTMLElement | null;

	if (titleEl) {
		titleEl.addEventListener('dblclick', (e) => {
			e.stopPropagation();
			const currentTitle = titleEl?.textContent || '';
			startTitleInlineEdit(titleEl!, currentTitle);
		});
	}

	function setVisibility(hasNote: boolean): void {
		if (!emptyState || !notePath || !noteContent) return;
		emptyState.style.display = hasNote ? 'none' : 'flex';
		notePath.style.display = hasNote ? 'flex' : 'none';
		noteContent.style.display = hasNote ? 'flex' : 'none';
	}

	const unsubActiveNote = store.subscribe(
		'activeNote',
		(activeNoteData: ActiveNote | null) => {
			const currentTitleEl = document.querySelector(
				'.note__title',
			) as HTMLElement | null;
			if (currentTitleEl) {
				currentTitleEl.textContent = activeNoteData?.title || '';
			}
			if (breadcrumbEl)
				breadcrumbEl.textContent = activeNoteData?.breadcrumb || '';
			setVisibility(!!activeNoteData);
		},
	);
	unsubscribeFunctions.push(unsubActiveNote);

	const unsubActiveBlocks = store.subscribe(
		'activeBlocks',
		async (blocks: Block[]) => {
			await _fullRenderBlocks(blocks);
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

	await _fullRenderBlocks(store.getActiveBlocks());

	window.addEventListener('beforeunload', async (e) => {
		await saveAllBlocksContent();
	});

	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') {
			saveAllBlocksContent();
		}
	});

	const noteBody = container.querySelector('.note__body') as HTMLElement | null;
	if (noteBody) {
		noteBody.addEventListener('contextmenu', (e) => e.preventDefault());

		noteBody.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			const addBtn = target.closest(
				'[data-action="add"]',
			) as HTMLElement | null;
			if (addBtn) {
				e.stopPropagation();
				const wrapper = addBtn.closest(
					'.note__block-wrapper',
				) as HTMLElement | null;
				if (wrapper) _handleAddBlock(wrapper.dataset.blockId!);
				return;
			}

			if (target.closest('.formattingPopup')) return;
			const selection = window.getSelection();
			if (selection?.isCollapsed && formattingPopup) {
				formattingPopup.close();
				formattingPopup = null;
			}
		});

		noteBody.addEventListener('mousedown', (e) => {
			if ((e.target as HTMLElement).closest('.formattingPopup')) return;
			if (formattingPopup) {
				formattingPopup.close();
				formattingPopup = null;
			}
			isDraggingSelection = true;
		});

		noteBody.addEventListener('mouseup', () => {
			if (!isDraggingSelection) return;
			isDraggingSelection = false;
			if (selectionTimeout) clearTimeout(selectionTimeout);
			selectionTimeout = window.setTimeout(() => {
				const selection = window.getSelection();
				if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
					const range = selection.getRangeAt(0);
					if (noteBody.contains(range.commonAncestorContainer)) {
						if (formattingPopup) formattingPopup.close();
						formattingPopup = new FormatPopup(range.cloneRange(), noteBody);
						formattingPopup.open();
					}
				}
			}, 10);
		});

		noteBody.addEventListener('scroll', () => {
			if (formattingPopup) {
				formattingPopup.close();
				formattingPopup = null;
			}
		});

		noteBody.addEventListener('dragstart', (e) => {
			const dragEvent = e as DragEvent;
			const dragBtn = (dragEvent.target as HTMLElement).closest(
				'[data-action="drag"]',
			) as HTMLElement | null;
			if (!dragBtn) {
				dragEvent.preventDefault();
				return;
			}

			const wrapper = dragBtn.closest('.note__block-wrapper') as HTMLElement;
			draggedBlockWrapper = wrapper;
			draggedBlockId = wrapper.dataset.blockId || null;

			wrapper.classList.add('note__block-wrapper--dragging');
			if (dragEvent.dataTransfer) {
				dragEvent.dataTransfer.effectAllowed = 'move';
				dragEvent.dataTransfer.setData('text/plain', draggedBlockId || '');
			}
		});

		noteBody.addEventListener('dragover', (e) => {
			const dragEvent = e as DragEvent;
			dragEvent.preventDefault();
			if (!draggedBlockWrapper || !dragEvent.dataTransfer) return;

			const afterElement = _getDragAfterWrapperElement(
				noteBody,
				dragEvent.clientY,
			);
			if (afterElement) {
				noteBody.insertBefore(draggedBlockWrapper, afterElement);
			} else {
				noteBody.appendChild(draggedBlockWrapper);
			}
		});

		noteBody.addEventListener('drop', async (e) => {
			const dragEvent = e as DragEvent;
			dragEvent.preventDefault();
			dragEvent.stopPropagation();
			if (!draggedBlockId) return;

			const blocks = Array.from(
				noteBody.querySelectorAll('.note__block-wrapper'),
			) as HTMLElement[];
			const newIndex = blocks.indexOf(draggedBlockWrapper!);
			const activeNoteId = store.getActiveNoteId();

			if (activeNoteId && newIndex !== -1) {
				try {
					await noteService.moveBlock(activeNoteId, draggedBlockId, newIndex);
					const updatedBlocks = store
						.getActiveBlocks()
						.map((b, idx) => ({ ...b, position: idx }));
					store.setActiveBlocksSilently(updatedBlocks);
				} catch (error) {
					if (!handleAuthError(error))
						console.error('Error moving block:', error);
				}
			}
		});

		noteBody.addEventListener('dragend', () => {
			if (draggedBlockWrapper) {
				draggedBlockWrapper.classList.remove('note__block-wrapper--dragging');
			}
			draggedBlockWrapper = null;
			draggedBlockId = null;
		});

		noteBody.addEventListener('keydown', async (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			const blockEl = target.closest('.note__block') as HTMLElement;

			if (!blockEl) return;

			const isDelete = e.key === 'Delete';
			const isBackspace = e.key === 'Backspace';

			if (!isDelete && !isBackspace) return;

			const wrapper = blockEl.closest('.note__block-wrapper') as HTMLElement;
			if (!wrapper) return;

			const blockId = wrapper.dataset.blockId;
			if (!blockId) return;

			const isTextBlock = blockEl.contentEditable === 'true';
			const isEmpty = isTextBlock && blockEl.innerText.trim() === '';
			const isLastChar =
				isBackspace && isTextBlock && blockEl.innerText.length === 0;
			const isImageBlock = blockEl.classList.contains('note__imageBlock');

			if (isImageBlock || isEmpty || isLastChar) {
				e.preventDefault();
				const blocks = store.getActiveBlocks();
				if (blocks.length > 1) {
					await deleteBlock(blockId, blockEl);
					removeBlockFromDOM(blockId);
				}
			}
		});
	}

	const globalKeydownHandler = (e: Event) => {
		const keyboardEvent = e as KeyboardEvent;
		if (keyboardEvent.key === 'Escape' && formattingPopup) {
			formattingPopup.close();
			formattingPopup = null;
		}
	};
	document.addEventListener('keydown', globalKeydownHandler);
}

async function _handleAddBlock(afterBlockId: string): Promise<void> {
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
		attachPopupInstance = new AttachPopup(btn, afterBlockId);
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
	for (const [element, events] of domEventListeners.entries()) {
		if (element && 'removeEventListener' in element) {
			for (const [event, handlers] of events.entries()) {
				handlers.forEach((h) => element.removeEventListener(event, h));
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

function _getDragAfterWrapperElement(
	container: HTMLElement,
	y: number,
): HTMLElement | undefined {
	const wrappers = [
		...container.querySelectorAll(
			'.note__block-wrapper:not(.note__block-wrapper--dragging)',
		),
	] as HTMLElement[];
	return (
		wrappers.reduce<{ offset: number; element: HTMLElement | null }>(
			(closest, child) => {
				const rect = child.getBoundingClientRect();
				if (rect.height === 0 || rect.width === 0 || !child.offsetParent)
					return closest;
				const offset = y - rect.top - rect.height / 2;
				return offset < 0 && offset > closest.offset
					? { offset, element: child }
					: closest;
			},
			{ offset: Number.NEGATIVE_INFINITY, element: null },
		).element || undefined
	);
}
