import { router } from '../../route/router.js';
import { noteService } from '../../services/noteService.js';
import { store } from '../../store.js';

export function bindNavigationEvents(container: HTMLElement): void {
	container.addEventListener('click', (e: MouseEvent) => {
		const target = e.target as HTMLElement;

		if (target.closest('[data-action="profile"]')) {
			e.preventDefault();
			router.push('/profile');
			return;
		}

		if (target.closest('[data-action="home"]')) {
			e.preventDefault();
			router.push('/');
			return;
		}

		const noteItem = target.closest('.sidebar__noteItem') as HTMLElement | null;
		if (noteItem && !target.closest('.sidebar__noteItemActions')) {
			e.preventDefault();
			const noteId = noteItem.dataset.noteId;
			if (noteId) {
				store.setActiveNoteId(noteId);
				updateActiveNote(container, noteId);
				router.push('/');
			}
			return;
		}

		const settingsBtn = target.closest(
			'[data-action="settings"]',
		) as HTMLElement | null;
		if (settingsBtn) {
			e.preventDefault();
			e.stopPropagation();
			const noteId = settingsBtn.dataset.noteId;
			if (noteId) {
				container.dispatchEvent(
					new CustomEvent('sidebar:openPopup', {
						detail: { noteId, anchor: settingsBtn },
					}),
				);
			}
			return;
		}

		const addSubnoteBtn = target.closest(
			'[data-action="addSubnote"]',
		) as HTMLElement | null;
		if (addSubnoteBtn) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}

		const createNoteBtn = target.closest(
			'[data-action="newNote"]',
		) as HTMLElement | null;
		if (createNoteBtn) {
			e.preventDefault();
			e.stopPropagation();
			if (!createNoteBtn.dataset.pending) {
				createNoteBtn.dataset.pending = 'true';
				noteService.createNote({ title: 'Новая заметка' }).finally(() => {
					delete createNoteBtn.dataset.pending;
				});
			}
			return;
		}
	});

	container.addEventListener('dblclick', (e: MouseEvent) => {
		const target = e.target as HTMLElement;
		const noteItemTitle = target.closest(
			'.sidebar__noteItemTitle',
		) as HTMLElement | null;
		if (noteItemTitle) {
			e.preventDefault();
			e.stopPropagation();
			const noteItem = noteItemTitle.closest(
				'.sidebar__noteItem',
			) as HTMLElement | null;
			const noteId = noteItem?.dataset.noteId;
			if (noteId) {
				startInlineEdit(noteItemTitle, noteId);
			}
		}
	});
}

export function startInlineEdit(
	noteItemTitle: HTMLElement,
	noteId: string | number,
): void {
	const currentTitle = noteItemTitle.textContent?.trim() || '';
	const input = document.createElement('input');
	input.type = 'text';
	input.value = currentTitle;
	input.className = 'sidebar__titleInput';
	input.style.width = '100%';
	input.style.border = 'none';
	input.style.outline = 'none';
	input.style.background = 'transparent';
	input.style.fontSize = 'inherit';
	input.style.fontFamily = 'inherit';

	noteItemTitle.replaceWith(input);
	input.focus();
	input.select();

	const saveEdit = async (): Promise<void> => {
		const newTitle = input.value.trim();
		if (newTitle && newTitle !== currentTitle) {
			try {
				await noteService.updateNote(noteId, { title: newTitle });
			} catch (error) {
				console.error('Error renaming note:', error);
			}
		}
		input.replaceWith(noteItemTitle);
	};

	const cancelEdit = (): void => {
		input.replaceWith(noteItemTitle);
	};

	input.addEventListener('blur', saveEdit);
	input.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			saveEdit();
		} else if (e.key === 'Escape') {
			cancelEdit();
		}
	});
}

export function updateActiveNote(
	container: HTMLElement,
	noteId: string | number | null,
): void {
	const noteItems = container.querySelectorAll('.sidebar__noteItem');
	noteItems.forEach((element) => {
		const el = element as HTMLElement;
		const isActive = el.dataset.noteId === String(noteId);
		el.classList.toggle('sidebar__noteItem--active', isActive);
	});
}
