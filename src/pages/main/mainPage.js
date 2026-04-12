import Handlebars from 'handlebars';
import { noteService } from '../../services/noteService.js';
import { attachmentService } from '../../services/attachmentService.js';
import { registerHelpers } from '../../utils/utils.js';
import { FormatPopup } from '../../components/popups/formatPopup/formatPopup.js';
import { AttachPopup } from '../../components/popups/attachPopup/attachPopup.js';
import './mainPage.css';
import templateText from './mainPage.hbs?raw';
import { store } from '../../store.js';
import { applyFormattingToRange } from '../../utils/formattingUtils.js';
import { handleAuthError } from '../../utils/handleAuthError.js';
import { db } from '../../db.js';

let dragMode = false;
let draggedBlock = null;
let draggedFromIndex = null;

let formattingPopup = null;
let isDraggingSelection = false;
let selectionTimeout = null;

let currentContainer = null;
let unsubscribeFunctions = [];
let domEventListeners = new Map();
let attachPopupInstance = null;

export async function initMainPage(container) {
    await cleanupMainPage();
    currentContainer = container;
    registerHelpers();
    const template = Handlebars.compile(templateText);

    let notes = store.getNotes();
    let activeNote = store.getActiveNote();
    if (notes.length === 0) {
        try {
            await noteService.getNotes();
            notes = store.getNotes();
        } catch (error) {
            if (handleAuthError(error)) return;
            console.error('Failed to load notes:', error);
        }
    }

    const savedNoteId = await db.settingsGet('activeNoteId');
    if (savedNoteId && !activeNote) {
        try {
            await noteService.getNote(savedNoteId);
            activeNote = store.getActiveNote();
        } catch (error) {
            console.error('Failed to load saved note:', error);
        }
    }

    if (!activeNote && notes[0]?.ID) {
        try {
            await noteService.getNote(notes[0].ID);
            activeNote = store.getActiveNote();
        } catch (error) {
            if (handleAuthError(error)) return;
            console.error('Failed to load note:', error);
        }
    }

    const state = store.getState();
    const html = template(state);
    container.innerHTML = html;

    const emptyState = container.querySelector('.emptyState');
    const notePath = container.querySelector('.notePath');
    const noteContent = container.querySelector('.noteContent');
    const noteActions = container.querySelector('.noteActions');
    const titleEl = container.querySelector('.noteTitle');
    const breadcrumbEl = container.querySelector('.currentItem');

    function setVisibility(hasNote) {
        if (!emptyState || !notePath || !noteContent || !noteActions) return;
        emptyState.style.display = hasNote ? 'none' : 'flex';
        notePath.style.display = hasNote ? 'flex' : 'none';
        noteContent.style.display = hasNote ? 'block' : 'none';
        noteActions.style.display = hasNote ? 'flex' : 'none';
    }

    const unsubActiveNote = store.subscribe('activeNote', (note) => {
        if (titleEl) titleEl.textContent = note?.title || '';
        if (breadcrumbEl) breadcrumbEl.textContent = note?.breadcrumb || '';
        setVisibility(!!note);
    });
    unsubscribeFunctions.push(unsubActiveNote);

    const unsubActiveBlocks = store.subscribe('activeBlocks', (blocks) => {
        _updateBlocksInDOM(blocks);
    });
    unsubscribeFunctions.push(unsubActiveBlocks);

    const unsubActiveNoteId = store.subscribe('activeNoteId', async (noteId) => {
        if (noteId && noteId !== store.getActiveNote()?.ID) {
            try {
                await noteService.getNote(noteId);
            } catch (error) {
                if (handleAuthError(error)) return;
                console.error('Failed to load note:', error);
            }
        }
    });
    unsubscribeFunctions.push(unsubActiveNoteId);

    setVisibility(!!store.getActiveNote());
    _updateActiveNoteInDOM(store.getActiveNote());
    _updateBlocksInDOM(store.getActiveBlocks());

    const addBlockBtn = container.querySelector('.addBlock');
    if (addBlockBtn) {
        const addBlockHandler = (e) => {
            e.stopPropagation();
            
            const activeNoteId = store.getActiveNoteId();
            if (!activeNoteId) {
                console.warn('No active note to add block');
                return;
            }
            
            if (attachPopupInstance) {
                attachPopupInstance.close();
                attachPopupInstance = null;
            } else {
                attachPopupInstance = new AttachPopup(addBlockBtn);
                attachPopupInstance.open();
                
                const closeOnNoteChange = () => {
                    if (attachPopupInstance) {
                        attachPopupInstance.close();
                        attachPopupInstance = null;
                    }
                };
                
                const unsub = store.subscribe('activeNoteId', closeOnNoteChange);
                unsubscribeFunctions.push(unsub);
            }
        };
        
        addBlockBtn.addEventListener('click', addBlockHandler);
        _addEventListener(addBlockBtn, 'click', addBlockHandler);
    }

    const dragBlockBtn = container.querySelector('.dragBlock');
    if (dragBlockBtn) {
        const dragBlockHandler = () => {
            const activeNoteId = store.getActiveNoteId();
            if (!activeNoteId) {
                console.warn('No active note to drag blocks');
                return;
            }
            
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
        };
        
        dragBlockBtn.addEventListener('click', dragBlockHandler);
        _addEventListener(dragBlockBtn, 'click', dragBlockHandler);
    }

    const noteBody = container.querySelector('.noteBody');
    if (noteBody) {
        const createHandler = (event, handler) => {
            const wrappedHandler = handler.bind(noteBody);
            noteBody.addEventListener(event, wrappedHandler);
            _addEventListener(noteBody, event, wrappedHandler);
            return wrappedHandler;
        };
        
        createHandler('contextmenu', (e) => {
            e.preventDefault();
        });
        
        createHandler('mousedown', (e) => {
            if (e.target.closest('.formattingPopup')) return;
            
            if (formattingPopup) {
                formattingPopup.close();
                formattingPopup = null;
            }
            isDraggingSelection = true;
        });
        
        createHandler('mouseup', () => {
            if (!isDraggingSelection) return;
            isDraggingSelection = false;
            
            clearTimeout(selectionTimeout);
            selectionTimeout = setTimeout(() => {
                const selection = window.getSelection();
                if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    if (noteBody.contains(range.commonAncestorContainer)) {
                        if (formattingPopup) {
                            formattingPopup.close();
                        }
                        formattingPopup = new FormatPopup(range.cloneRange(), noteBody);
                        formattingPopup.open();
                    }
                }
            }, 10);
        });
        
        createHandler('click', (e) => {
            if (e.target.closest('.formattingPopup')) return;
            
            const selection = window.getSelection();
            if (selection && selection.isCollapsed && formattingPopup) {
                formattingPopup.close();
                formattingPopup = null;
            }
        });
        
        createHandler('scroll', () => {
            if (formattingPopup) {
                formattingPopup.close();
                formattingPopup = null;
            }
        }, { passive: true });
        
        const debouncedInput = _debounce(async (e) => {
            if (e.target.classList.contains('block')) {
                if (formattingPopup) {
                    formattingPopup.close();
                    formattingPopup = null;
                }
                
                const blockId = e.target.dataset.blockId;
                const content = e.target.textContent;
                const activeNoteId = store.getActiveNoteId();
                if (activeNoteId && blockId) {
                    try {
                        await noteService.updateBlockContent(activeNoteId, blockId, content);
                    } catch (error) {
                        if (handleAuthError(error)) return;
                        console.error('Failed to update block content:', error);
                    }
                }
            }
        }, 500);
        
        noteBody.addEventListener('input', debouncedInput);
        _addEventListener(noteBody, 'input', debouncedInput);
        
        createHandler('dragstart', (e) => {
            if (e.target.classList.contains('block') && dragMode) {
                draggedBlock = e.target;
                draggedFromIndex = Array.from(noteBody.querySelectorAll('.block')).indexOf(e.target);
                e.target.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', e.target.innerHTML);
            }
        });
        
        createHandler('dragover', (e) => {
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
        
        createHandler('drop', async (e) => {
            if (dragMode && draggedBlock) {
                e.preventDefault();
                e.stopPropagation();
            }
        });

        noteBody.addEventListener('dragend', async () => {
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
                                if (handleAuthError(error)) return;
                                console.error('Error moving block:', error);
                            }
                        }
                    }
                }
                
                draggedBlock = null;
                draggedFromIndex = null;
            }
        });
    }
    
    const globalKeydownHandler = (e) => {
        if (e.key === 'Escape' && formattingPopup) {
            formattingPopup.close();
            formattingPopup = null;
        }
    };
    document.addEventListener('keydown', globalKeydownHandler);
    _addEventListener(document, 'keydown', globalKeydownHandler);
}

function _addEventListener(element, event, handler) {
    if (!domEventListeners.has(element)) {
        domEventListeners.set(element, new Map());
    }
    const elementListeners = domEventListeners.get(element);
    if (!elementListeners.has(event)) {
        elementListeners.set(event, []);
    }
    elementListeners.get(event).push(handler);
}

export async function cleanupMainPage() {
    unsubscribeFunctions.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });
    unsubscribeFunctions = [];
    
    for (const [element, events] of domEventListeners.entries()) {
        if (element && element.removeEventListener) {
            for (const [event, handlers] of events.entries()) {
                handlers.forEach(handler => {
                    element.removeEventListener(event, handler);
                });
            }
        }
    }
    domEventListeners.clear();
    
    if (formattingPopup) {
        formattingPopup.close();
        formattingPopup = null;
    }
    
    if (attachPopupInstance) {
        attachPopupInstance.close();
        attachPopupInstance = null;
    }
    
    if (selectionTimeout) {
        clearTimeout(selectionTimeout);
        selectionTimeout = null;
    }
    
    dragMode = false;
    draggedBlock = null;
    draggedFromIndex = null;
    isDraggingSelection = false;
    
    if (currentContainer) {
        currentContainer.innerHTML = '';
        currentContainer = null;
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

async function _updateBlocksInDOM(blocks) {
    const noteBody = document.querySelector('.noteBody');
    if (!noteBody) return;
    
    const currentDragMode = dragMode;
    
    noteBody.querySelectorAll('.block').forEach(b => b.remove());
    
    for (const block of blocks) {
        let blockEl;
        
        if (block.block_type_id === 2 && block.content) {
            try {
                const imageData = JSON.parse(block.content);
                const attachmentId = imageData.attachmentId;
                const imageUrl = await attachmentService.getImageUrl(
                    attachmentId, 
                    block.note_id || store.getActiveNoteId(), 
                    block.id
                );
                
                blockEl = document.createElement('div');
                blockEl.className = 'block image-block';
                blockEl.dataset.blockId = block.id;
                
                const img = document.createElement('img');
                img.src = imageUrl;
                
                img.onerror = () => {
                    console.error('Failed to load image:', imageUrl);
                    img.style.display = 'none';
                    const errorText = document.createElement('div');
                    errorText.textContent = '⚠️ Не удалось загрузить изображение';
                    errorText.style.color = '#999';
                    errorText.style.fontSize = '12px';
                    errorText.style.padding = '8px';
                    blockEl.appendChild(errorText);
                };
                
                blockEl.appendChild(img);
            } catch (e) {
                console.error('Error updating image block:', e)
                blockEl = document.createElement('div');
                blockEl.className = 'block';
                blockEl.dataset.blockId = block.id;
                blockEl.contentEditable = 'true';
                blockEl.textContent = block.content;
            }
        } else {
            blockEl = document.createElement('div');
            blockEl.className = 'block';
            blockEl.dataset.blockId = block.id;
            blockEl.contentEditable = 'true';
            blockEl.textContent = block.content;
        }
        
        blockEl.draggable = currentDragMode;
        if (currentDragMode) {
            blockEl.classList.add('draggable-mode');
        }

        const addBlockBtn = noteBody.querySelector('.addBlock');
        if (addBlockBtn) {
            noteBody.insertBefore(blockEl, addBlockBtn);
        } else {
            noteBody.appendChild(blockEl);
        }
        
        if (block.block_type_id !== 2) {
            const ranges = block.formatting?.ranges || [];
            ranges.forEach(rng => {
                applyFormattingToRange(blockEl, rng.start_pos, rng.end_pos, {
                    bold: rng.bold,
                    italic: rng.italic,
                    underline: rng.underline
                });
            });
        }
    }
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
