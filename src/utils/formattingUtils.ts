import { FormattingRange } from './../types.js';

export interface Formatting {
	bold: boolean;
	italic: boolean;
	underline: boolean;
}

export const defaultFormatting: Formatting = {
	bold: false,
	italic: false,
	underline: false,
};

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

export function applyFormattingToRanges(
	existingRanges: FormattingRange[],
	newRange: {
		start_pos: number;
		end_pos: number;
		bold?: boolean | null;
		italic?: boolean | null;
		underline?: boolean | null;
	},
): FormattingRange[] {
	const points = new Set<number>();
	for (const r of existingRanges) {
		points.add(r.start_pos);
		points.add(r.end_pos);
	}
	points.add(newRange.start_pos);
	points.add(newRange.end_pos);

	const pointList = Array.from(points).sort((a, b) => a - b);

	const segments: Array<{ start: number; end: number }> = [];
	for (let i = 0; i < pointList.length - 1; i++) {
		if (pointList[i] < pointList[i + 1]) {
			segments.push({ start: pointList[i], end: pointList[i + 1] });
		}
	}

	const result: FormattingRange[] = [];
	for (const seg of segments) {
		let bold = false,
			italic = false,
			underline = false;

		for (const r of existingRanges) {
			if (seg.start >= r.start_pos && seg.end <= r.end_pos) {
				if (r.bold !== null) bold = r.bold;
				if (r.italic !== null) italic = r.italic;
				if (r.underline !== null) underline = r.underline;
			}
		}

		if (seg.start >= newRange.start_pos && seg.end <= newRange.end_pos) {
			if (newRange.bold !== undefined && newRange.bold !== null)
				bold = newRange.bold;
			if (newRange.italic !== undefined && newRange.italic !== null)
				italic = newRange.italic;
			if (newRange.underline !== undefined && newRange.underline !== null)
				underline = newRange.underline;
		}

		if (bold || italic || underline) {
			result.push({
				start_pos: seg.start,
				end_pos: seg.end,
				bold,
				italic,
				underline,
			});
		}
	}

	if (result.length === 0) return [];

	const merged: FormattingRange[] = [result[0]];
	for (let i = 1; i < result.length; i++) {
		const last = merged[merged.length - 1];
		const curr = result[i];

		const same =
			last.bold === curr.bold &&
			last.italic === curr.italic &&
			last.underline === curr.underline;

		if (last.end_pos === curr.start_pos && same) {
			last.end_pos = curr.end_pos;
		} else {
			merged.push(curr);
		}
	}

	return merged;
}

export function rebuildBlockFromRanges(
	element: HTMLElement,
	ranges: FormattingRange[],
): void {
	const text = element.textContent || '';
	if (!text) return;

	const sorted = [...ranges].sort((a, b) => a.start_pos - b.start_pos);
	const fragment = document.createDocumentFragment();
	let lastPos = 0;

	for (const rng of sorted) {
		if (rng.start_pos > lastPos) {
			fragment.appendChild(
				document.createTextNode(text.slice(lastPos, rng.start_pos)),
			);
		}

		const span = document.createElement('span');
		span.className = 'formatted-range';
		span.textContent = text.slice(rng.start_pos, rng.end_pos);
		if (rng.bold) span.style.fontWeight = 'bold';
		if (rng.italic) span.style.fontStyle = 'italic';
		if (rng.underline) span.style.textDecoration = 'underline';
		fragment.appendChild(span);

		lastPos = rng.end_pos;
	}

	if (lastPos < text.length) {
		fragment.appendChild(document.createTextNode(text.slice(lastPos)));
	}

	element.innerHTML = '';
	element.appendChild(fragment);
}

export function applyFormattingToRange(
	element: HTMLElement,
	startPos: number,
	endPos: number,
	formatting: Formatting,
): void {
	if (!element || startPos >= endPos) return;

	const existingRanges = extractFormattingRangesFromBlock(element);
	const newRanges = applyFormattingToRanges(existingRanges, {
		start_pos: startPos,
		end_pos: endPos,
		bold: formatting.bold,
		italic: formatting.italic,
		underline: formatting.underline,
	});

	rebuildBlockFromRanges(element, newRanges);
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
			const styles = window.getComputedStyle(parent);
			const fontWeight = styles.fontWeight;
			ranges.push({
				start_pos: currentPos,
				end_pos: currentPos + nodeLength,
				bold: fontWeight === 'bold' || parseInt(fontWeight, 10) >= 700,
				italic: styles.fontStyle === 'italic',
				underline: (
					styles.textDecorationLine ||
					styles.textDecoration ||
					''
				).includes('underline'),
			});
		}
		currentPos += nodeLength;
		currentNode = walker.nextNode() as Text | null;
	}

	return ranges;
}

export function clearFormattingFromBlock(blockEl: HTMLElement | null): void {
	if (!blockEl) return;
	blockEl.innerHTML = blockEl.textContent || '';
}

export function updateFormattingInRange(
	element: HTMLElement,
	startPos: number,
	endPos: number,
	action: string,
	value: boolean,
): void {
	const existingRanges = extractFormattingRangesFromBlock(element);

	const formattingUpdate: {
		start_pos: number;
		end_pos: number;
		bold?: boolean | null;
		italic?: boolean | null;
		underline?: boolean | null;
	} = {
		start_pos: startPos,
		end_pos: endPos,
	};

	if (action === 'bold') formattingUpdate.bold = value;
	if (action === 'italic') formattingUpdate.italic = value;
	if (action === 'underline') formattingUpdate.underline = value;

	const newRanges = applyFormattingToRanges(existingRanges, formattingUpdate);
	rebuildBlockFromRanges(element, newRanges);
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
