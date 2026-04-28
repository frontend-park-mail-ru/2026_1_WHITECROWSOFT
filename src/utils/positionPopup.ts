export interface Position {
	top: number;
	left: number;
}

export function calculatePopupPosition(
	range: Range,
	popupElement: HTMLElement,
): Position {
	popupElement.style.visibility = 'hidden';
	popupElement.style.display = 'flex';
	popupElement.style.position = 'fixed';
	popupElement.style.opacity = '1';
	popupElement.style.transform = 'none';
	void popupElement.offsetHeight;
	const rect = range.getBoundingClientRect();
	const popupRect = popupElement.getBoundingClientRect();
	let top = rect.top - popupRect.height - 10;
	let left = rect.left + rect.width / 2 - popupRect.width / 2;
	if (top < 10) {
		top = rect.bottom + 10;
	}
	if (top + popupRect.height > window.innerHeight - 10) {
		top = rect.top - popupRect.height - 10;
		if (top < 10) {
			top = 10;
		}
	}
	left = Math.max(10, Math.min(left, window.innerWidth - popupRect.width - 10));
	popupElement.style.visibility = '';
	return { top, left };
}

export function applyPopupPosition(
	popupElement: HTMLElement,
	position: Position,
): void {
	popupElement.style.top = `${position.top}px`;
	popupElement.style.left = `${position.left}px`;
	popupElement.style.position = 'fixed';
	popupElement.style.visibility = 'visible';
	popupElement.style.display = 'flex';
	popupElement.style.opacity = '1';
}

export function positionPopup(range: Range, popupElement: HTMLElement): void {
	if (!range || !popupElement) return;
	const position = calculatePopupPosition(range, popupElement);
	applyPopupPosition(popupElement, position);
}
