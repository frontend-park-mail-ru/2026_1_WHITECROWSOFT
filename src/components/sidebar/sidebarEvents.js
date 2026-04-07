import { router } from "../../route/router";
import { noteService } from "../../services/noteService";
import { store } from "../../store";

export function bindNavigationEvents(container, onNoteClick) {
	container.addEventListener('click', (e) => {
		if (e.target.closest('[data-action="profile"]')) {
			e.preventDefault();
			router.push('/profile');
			return;
		}

		if (e.target.closest('[data-action="home"]')) {
			e.preventDefault();
			router.push('/');
			return;
		}

		const noteItem = e.target.closest('.noteItem');
		if (noteItem && !e.target.closest('.noteItemActions')) {
			e.preventDefault();
			const noteId = noteItem.dataset.noteId;
			if (noteId) {
				store.setActiveNoteId(noteId);
				updateActiveNote(container, noteId);
				router.push('/');
				onNoteClick?.(noteId);
			}
			return;
		}

		const settingsBtn = e.target.closest('[data-action="settings"]');
		if (settingsBtn) {
			e.preventDefault();
			e.stopPropagation();
			const noteId = settingsBtn.dataset.noteId;
			if (noteId) {
				container.dispatchEvent(new CustomEvent('sidebar:openPopup', {
					detail: { noteId, anchor: settingsBtn }
				}));
			}
			return;
		}

		const addSubnoteBtn = e.target.closest('[data-action="addSubnote"]');
		if (addSubnoteBtn) {
			e.preventDefault();
			e.stopPropagation();
			onNoteClick?.(addSubnoteBtn.dataset.noteId, { action: 'addSubnote' });
			return;
		}

		const createNoteBtn = e.target.closest('[data-action="newNote"]');
		if (createNoteBtn) {
			e.preventDefault();
			e.stopPropagation();
			if (!createNoteBtn.dataset.pending) {
				createNoteBtn.dataset.pending = 'true';
				noteService.createNote({ title: 'Новая заметка' })
					.finally(() => {
						delete createNoteBtn.dataset.pending;
					});
			}
			return;
		}
	});

	container.addEventListener('dblclick', (e) => {
		const noteItemTitle = e.target.closest('.noteItemTitle');
		if (noteItemTitle) {
			e.preventDefault();
			e.stopPropagation();
			const noteItem = noteItemTitle.closest('.noteItem');
			const noteId = noteItem?.dataset.noteId;
			if (noteId) {
				startInlineEdit(noteItemTitle, noteId);
			}
		}
	});
}

export function startInlineEdit(noteItemTitle, noteId) {
	const currentTitle = noteItemTitle.textContent.trim();
	const input = document.createElement('input');
	input.type = 'text';
	input.value = currentTitle;
	input.className = 'noteTitleInput';
	input.style.width = '100%';
	input.style.border = 'none';
	input.style.outline = 'none';
	input.style.background = 'transparent';
	input.style.fontSize = 'inherit';
	input.style.fontFamily = 'inherit';

	noteItemTitle.replaceWith(input);
	input.focus();
	input.select();

	const saveEdit = async () => {
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

	const cancelEdit = () => {
		input.replaceWith(noteItemTitle);
	};

	input.addEventListener('blur', saveEdit);
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			saveEdit();
		} else if (e.key === 'Escape') {
			cancelEdit();
		}
	});
}

export function updateActiveNote(container, noteId) {
	container.querySelectorAll('.noteItem').forEach(element => {
		element.classList.toggle('active', element.dataset.noteId === noteId);
	});
}