export const defaultFormatting = {
    bold: false,
    italic: false,
    underline: false
};

/**
 * Собирает форматирование из вычисленных стилей элемента
 * Возвращает объект, идентичный models.Formatting
 */
export function collectFormattingFromElement(el) {
    if (!el) return { ...defaultFormatting };
    
    const styles = window.getComputedStyle(el);
    const fontWeight = styles.fontWeight;
    const bold = fontWeight === 'bold' || parseInt(fontWeight, 10) >= 700;
    const italic = styles.fontStyle === 'italic';
    const textDecoration = styles.textDecorationLine || styles.textDecoration || '';
    const underline = textDecoration.includes('underline');

    return { bold, italic, underline };
}

/**
 * Применяет форматирование к блоку
 */
export function applyFormattingToElement(el, formatting) {
    if (!el) return;
    
    if (!formatting || (!formatting.bold && !formatting.italic && !formatting.underline)) {
        el.style.fontWeight = '';
        el.style.fontStyle = '';
        el.style.textDecorationLine = '';
        return;
    }

    el.style.fontWeight = formatting.bold ? 'bold' : '';
    el.style.fontStyle = formatting.italic ? 'italic' : '';
    el.style.textDecorationLine = formatting.underline ? 'underline' : '';
}