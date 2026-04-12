export const defaultFormatting = {
    bold: false,
    italic: false,
    underline: false
};

export function getSelectionPositionsInElement(element, range) {
    if (!element || !range) return { start: 0, end: 0 };
    
    const preSelectionRange = document.createRange();
    preSelectionRange.selectNodeContents(element);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const start = preSelectionRange.toString().length;
    const end = start + range.toString().length;
    
    return { start, end };
}

export function applyFormattingToRange(element, startPos, endPos, formatting) {
    if (!element || startPos >= endPos) return;
    
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    let currentNode = walker.nextNode();
    let currentPos = 0;
    const targetNodes = [];
    
    while (currentNode) {
        const nodeLength = currentNode.textContent.length;
        const nodeStart = currentPos;
        const nodeEnd = currentPos + nodeLength;
        
        if (nodeEnd > startPos && nodeStart < endPos) {
            targetNodes.push({
                node: currentNode,
                overlapStart: Math.max(startPos, nodeStart) - nodeStart,
                overlapEnd: Math.min(endPos, nodeEnd) - nodeStart
            });
        }
        currentPos = nodeEnd;
        currentNode = walker.nextNode();
    }
    
    targetNodes.forEach(({ node, overlapStart, overlapEnd }) => {
        if (overlapStart === 0 && overlapEnd === node.textContent.length) {
            wrapTextNode(node, formatting);
        } else {
            splitAndWrapTextNode(node, overlapStart, overlapEnd, formatting);
        }
    });
}

function wrapTextNode(textNode, formatting) {
    if (!textNode.parentNode) return;
    
    const span = document.createElement('span');
    span.className = 'formatted-range';
    applyFormattingStyles(span, formatting);
    
    textNode.parentNode.replaceChild(span, textNode);
    span.appendChild(textNode);
}

function splitAndWrapTextNode(textNode, startOffset, endOffset, formatting) {
    if (!textNode.parentNode) return;
    
    const text = textNode.textContent;
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

export function applyFormattingStyles(el, formatting) {
    if (!formatting) return;
    if (formatting.bold) el.style.fontWeight = 'bold';
    if (formatting.italic) el.style.fontStyle = 'italic';
    if (formatting.underline) el.style.textDecoration = 'underline';
}

export function getFormattingFromElement(el) {
    if (!el) return { ...defaultFormatting };
    const styles = window.getComputedStyle(el);
    const fontWeight = styles.fontWeight;
    return {
        bold: fontWeight === 'bold' || parseInt(fontWeight, 10) >= 700,
        italic: styles.fontStyle === 'italic',
        underline: (styles.textDecorationLine || styles.textDecoration || '').includes('underline')
    };
}

export function extractFormattingRangesFromBlock(blockEl) {
    const ranges = [];
    const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, null);
    let currentNode = walker.nextNode();
    let currentPos = 0;
    
    while (currentNode) {
        const nodeLength = currentNode.textContent.length;
        const parent = currentNode.parentNode;
        
        if (parent?.classList?.contains('formatted-range')) {
            const fmt = getFormattingFromElement(parent);
            ranges.push({
                start_pos: currentPos,
                end_pos: currentPos + nodeLength,
                bold: fmt.bold ?? null,
                italic: fmt.italic ?? null,
                underline: fmt.underline ?? null
            });
        }
        currentPos += nodeLength;
        currentNode = walker.nextNode();
    }
    
    return ranges;
}

export function clearFormattingFromBlock(blockEl) {
    if (!blockEl) return;
    blockEl.querySelectorAll('.formatted-range').forEach(span => {
        span.replaceWith(...span.childNodes);
    });
}