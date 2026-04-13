export interface Formatting {
	bold: boolean;
	italic: boolean;
	underline: boolean;
}

export interface FormattingRange {
	start_pos: number;
	end_pos: number;
	bold: boolean | null;
	italic: boolean | null;
	underline: boolean | null;
}

export const defaultFormatting: Formatting = {
	bold: false,
	italic: false,
	underline: false,
};

interface TargetNode {
	node: Text;
	overlapStart: number;
	overlapEnd: number;
}

export function getSelectionPositionsInElement(
	element: HTMLElement,
	range: Range,
): { start: number; end: number } {
	if (!element || !range) return { start: 0, end: 0 };

	const preSelectionRange = document.createRange();
	preSelectionRange.selectNodeContents(element);
	preSelectionRange.setEnd(range.startContainer, range.startOffset);
	const start = preSelectionRange.toString().length;
	const end = start + range.toString().length;

	return { start, end };
}

export function applyFormattingToRange(
	element: HTMLElement,
	startPos: number,
	endPos: number,
	formatting: Formatting,
): void {
	if (!element || startPos >= endPos) return;

	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
	let currentNode: Text | null = walker.nextNode() as Text | null;
	let currentPos = 0;
	const targetNodes: TargetNode[] = [];

	while (currentNode) {
		const nodeLength = currentNode.textContent?.length || 0;
		const nodeStart = currentPos;
		const nodeEnd = currentPos + nodeLength;

		if (nodeEnd > startPos && nodeStart < endPos) {
			targetNodes.push({
				node: currentNode,
				overlapStart: Math.max(startPos, nodeStart) - nodeStart,
				overlapEnd: Math.min(endPos, nodeEnd) - nodeStart,
			});
		}
		currentPos = nodeEnd;
		currentNode = walker.nextNode() as Text | null;
	}

	targetNodes.forEach(({ node, overlapStart, overlapEnd }) => {
		if (overlapStart === 0 && overlapEnd === (node.textContent?.length || 0)) {
			wrapTextNode(node, formatting);
		} else {
			splitAndWrapTextNode(node, overlapStart, overlapEnd, formatting);
		}
	});
}

function wrapTextNode(textNode: Text, formatting: Formatting): void {
	if (!textNode.parentNode) return;

	const span = document.createElement('span');
	span.className = 'formatted-range';
	applyFormattingStyles(span, formatting);

	textNode.parentNode.replaceChild(span, textNode);
	span.appendChild(textNode);
}

function splitAndWrapTextNode(
	textNode: Text,
	startOffset: number,
	endOffset: number,
	formatting: Formatting,
): void {
	if (!textNode.parentNode) return;

	const text = textNode.textContent || '';
	const before = text.substring(0, startOffset);
	const middle = text.substring(startOffset, endOffset);
	const after = text.substring(endOffset);

	const parent = textNode.parentNode;
	const fragment = document.createDocumentFragment();

	if (before) fragment.appendChild(document.createTextNode(before));

	const span = document.createElement('span');
	span.className = 'formatted-range';
	applyFormattingStyles(span, formatting);
	span.appendChild(document.createTextNode(middle));
	fragment.appendChild(span);

	if (after) fragment.appendChild(document.createTextNode(after));

	parent.replaceChild(fragment, textNode);
}

export function applyFormattingStyles(
	el: HTMLElement,
	formatting: Formatting,
): void {
	if (!formatting) return;
	if (formatting.bold) el.style.fontWeight = 'bold';
	if (formatting.italic) el.style.fontStyle = 'italic';
	if (formatting.underline) el.style.textDecoration = 'underline';
}

export function getFormattingFromElement(el: HTMLElement | null): Formatting {
	if (!el) return { ...defaultFormatting };
	const styles = window.getComputedStyle(el);
	const fontWeight = styles.fontWeight;
	return {
		bold: fontWeight === 'bold' || parseInt(fontWeight, 10) >= 700,
		italic: styles.fontStyle === 'italic',
		underline: (
			styles.textDecorationLine ||
			styles.textDecoration ||
			''
		).includes('underline'),
	};
}

export function extractFormattingRangesFromBlock(
	blockEl: HTMLElement,
): FormattingRange[] {
	const ranges: FormattingRange[] = [];
	const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, null);
	let currentNode: Text | null = walker.nextNode() as Text | null;
	let currentPos = 0;

	while (currentNode) {
		const nodeLength = currentNode.textContent?.length || 0;
		const parent = currentNode.parentNode as HTMLElement | null;

		if (parent?.classList?.contains('formatted-range')) {
			const fmt = getFormattingFromElement(parent);
			ranges.push({
				start_pos: currentPos,
				end_pos: currentPos + nodeLength,
				bold: fmt.bold ?? null,
				italic: fmt.italic ?? null,
				underline: fmt.underline ?? null,
			});
		}
		currentPos += nodeLength;
		currentNode = walker.nextNode() as Text | null;
	}

	return ranges;
}

export function clearFormattingFromBlock(blockEl: HTMLElement | null): void {
	if (!blockEl) return;
	const spans = blockEl.querySelectorAll('.formatted-range');
	spans.forEach((span) => {
		const parent = span.parentNode;
		if (parent) {
			while (span.firstChild) {
				parent.insertBefore(span.firstChild, span);
			}
			parent.removeChild(span);
		}
	});
}
