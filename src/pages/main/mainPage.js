import Handlebars from 'handlebars';
import { noteService } from '../../services/noteService.js';
import { registerHelpers } from '../../utils/utils.js';
import { FormatPopup } from '../../components/popups/formatPopup/formatPopup.js';
import './mainPage.css';
import templateText from './mainPage.hbs?raw';
import { store } from '../../store.js';
import { applyFormattingToElement } from '../../utils/formattingUtils.js';

/**
 * Инициализирует главную страницу с заметками
 * @async
 * @function initMainPage
 * @returns {Promise<void>}
 *
 * @description
 * Загружает список заметок, отображает активную заметку,
 * создает боковую панель и настраивает переключение между заметками
 */
/**
 * Состояние режима перетаскивания
 */
let dragMode = false;
let draggedBlock = null;
let draggedFromIndex = null;

let selectionDebounceTimer = null;
let isSelecting = false;
let formattingPopup = null;

export async function initMainPage(container, data = {}) {
	registerHelpers();
	const template = Handlebars.compile(templateText);

    let notes = store.getNotes();
    let activeNote = store.getActiveNote();
    if (notes.length === 0) {
        await noteService.getNotes();
        notes = store.getNotes();
    }
    if (!activeNote && notes[0]?.ID) {
        await noteService.getNote(notes[0].ID);
        activeNote = store.getActiveNote();
    }

    const state = store.getState();
    const html = template(state);
	container.innerHTML = html;

    store.subscribe('activeNote', (note) => {
        _updateActiveNoteInDOM(note);
    });

    store.subscribe('activeBlocks', (blocks) => {
        _updateBlocksInDOM(blocks);
    });
    
    _updateActiveNoteInDOM(store.getActiveNote());
    _updateBlocksInDOM(store.getActiveBlocks());

    const addBlockBtn = container.querySelector('.addBlock');
    if (addBlockBtn) {
        addBlockBtn.addEventListener('click', async () => {
            const activeNoteId = store.getActiveNoteId();
            if (activeNoteId) {
                await noteService.createBlock(activeNoteId, { note_id: activeNoteId, block_type_id: 1, position: 0, content: '' });
            }
        });
    }

    const dragBlockBtn = container.querySelector('.dragBlock');
    if (dragBlockBtn) {
        dragBlockBtn.addEventListener('click', () => {
            dragMode = !dragMode;
            dragBlockBtn.classList.toggle('active', dragMode);
            const noteBody = container.querySelector('.noteBody');
            if (noteBody) {
                const blocks = noteBody.querySelectorAll('.block');
                blocks.forEach(block => {
                    block.draggable = dragMode;
                    if (dragMode) {
                        block.classList.add('draggable-mode');
                    } else {
                        block.classList.remove('draggable-mode');
                    }
                });
            }
        });
    }

    const noteBody = container.querySelector('.noteBody');
    if (noteBody) {
        noteBody.addEventListener('mousedown', () => {
            isSelecting = true;
            if (formattingPopup) { formattingPopup.close(); formattingPopup = null; }
        });
        
        noteBody.addEventListener('mouseup', () => {
            isSelecting = false;
            // Небольшая задержка, чтобы браузер успел обновить Selection
            setTimeout(() => _handleTextSelection(noteBody), 50);
        });

        // Для клавиатурного выделения (Shift+стрелки)
        document.addEventListener('selectionchange', () => {
            if (!isSelecting) {
                clearTimeout(selectionDebounceTimer);
                selectionDebounceTimer = setTimeout(() => _handleTextSelection(noteBody), 300);
            }
        });

        noteBody.addEventListener('input', _debounce(async (e) => {
            if (e.target.classList.contains('block')) {
                const blockId = e.target.dataset.blockId;
                const content = e.target.textContent;
                const activeNoteId = store.getActiveNoteId();
                if (activeNoteId && blockId) {
                    await noteService.updateBlockContent(activeNoteId, blockId, content);
                }
            }
        }, 500));

        noteBody.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('block') && dragMode) {
                draggedBlock = e.target;
                draggedFromIndex = Array.from(noteBody.querySelectorAll('.block')).indexOf(e.target);
                e.target.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', e.target.innerHTML);
            }
        });

        noteBody.addEventListener('dragover', (e) => {
            if (dragMode && draggedBlock) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                const afterElement = _getDragAfterElement(noteBody, e.clientY);
                if (afterElement == null) {
                    noteBody.appendChild(draggedBlock);
                } else if (afterElement !== draggedBlock) {
                    noteBody.insertBefore(draggedBlock, afterElement);
                }
            }
        });

        noteBody.addEventListener('drop', async (e) => {
            if (dragMode && draggedBlock) {
                e.preventDefault();
                e.stopPropagation();
            }
        });

        noteBody.addEventListener('dragend', async (e) => {
            if (draggedBlock) {
                draggedBlock.classList.remove('dragging');
                
                if (dragMode) {
                    const blocks = noteBody.querySelectorAll('.block');
                    const newIndex = Array.from(blocks).indexOf(draggedBlock);
                    
                    if (draggedFromIndex !== newIndex && newIndex !== -1) {
                        const activeNoteId = store.getActiveNoteId();
                        const blockId = draggedBlock.dataset.blockId;
                        
                        if (activeNoteId && blockId) {
                            try {
                                await noteService.moveBlock(activeNoteId, blockId, newIndex);
                            } catch (error) {
                                console.error('Error moving block:', error);
                                const blocks = noteBody.querySelectorAll('.block');
                                if (draggedFromIndex < blocks.length) {
                                    noteBody.insertBefore(draggedBlock, blocks[draggedFromIndex]);
                                }
                            }
                        }
                    }
                }
                
                draggedBlock = null;
                draggedFromIndex = null;
            }
        });
    }
}

function _updateActiveNoteInDOM(note) {
    const titleEl = document.querySelector('.noteTitle');
    const breadcrumbEl = document.querySelector('.currentItem');
    
    if (!note) {
        if (titleEl) titleEl.textContent = '';
        if (breadcrumbEl) breadcrumbEl.textContent = '';
        return;
    }
    
    if (titleEl) titleEl.textContent = note.title;
    if (breadcrumbEl) breadcrumbEl.textContent = note.breadcrumb;
}

function _updateBlocksInDOM(blocks) {
    const noteBody = document.querySelector('.noteBody');
    if (!noteBody) return;

    const existingBlocks = noteBody.querySelectorAll('.block');
    existingBlocks.forEach(block => block.remove());

    blocks.forEach(block => {
        const blockEl = document.createElement('div');
        blockEl.className = 'block';
        blockEl.dataset.blockId = block.id;
        blockEl.contentEditable = 'true';
        blockEl.textContent = block.content;
        blockEl.draggable = dragMode;
        if (dragMode) {
            blockEl.classList.add('draggable-mode');
        }
        applyFormattingToElement(blockEl, block.formatting);
        noteBody.insertBefore(blockEl, noteBody.querySelector('.addBlock') || noteBody.lastChild);
    });


}

function _debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Определяет элемент, после которого должен быть вставлен перетаскиваемый элемент
 * @param {HTMLElement} container - контейнер с блоками
 * @param {number} y - Y координата курсора
 * @returns {HTMLElement|null} элемент, после которого будет вставлен блок
 */
function _getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.block:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const rect = child.getBoundingClientRect();
        if (rect.height === 0 || rect.width === 0 || !child.offsetParent) {
            return closest;
        }
        const offset = y - rect.top - rect.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}


function _handleTextSelection(editor) {
    const selection = window.getSelection();
    
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        if (formattingPopup) {
            formattingPopup.close();
            formattingPopup = null;
        }
        return;
    }

    const range = selection.getRangeAt(0);
    
    if (editor.contains(range.commonAncestorContainer)) {
        if (formattingPopup) {
            formattingPopup.close();
        }
        formattingPopup = new FormatPopup(range.cloneRange(), editor);
        formattingPopup.open();
    } else if (formattingPopup) {
        formattingPopup.close();
        formattingPopup = null;
    }
}
