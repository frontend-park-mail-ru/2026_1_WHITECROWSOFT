import { noteService } from '../services/noteService.js';

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
