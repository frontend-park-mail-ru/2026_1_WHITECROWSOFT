export function isSelectionValid(editorElement: HTMLElement): boolean {
	const selection = window.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
		return false;
	}
	const currentRange = selection.getRangeAt(0);
	return editorElement?.contains(currentRange.commonAncestorContainer) || false;
}

export function getSelectionData(editorElement: HTMLElement): {
	range: Range | null;
	isValid: boolean;
} {
	const selection = window.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
		return { range: null, isValid: false };
	}
	const range = selection.getRangeAt(0);
	const isValid =
		editorElement?.contains(range.commonAncestorContainer) || false;
	return { range, isValid };
}
