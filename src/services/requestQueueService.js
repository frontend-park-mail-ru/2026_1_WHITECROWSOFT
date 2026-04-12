import { client } from '../client/client.js';
import { db } from '../db.js';
import { store } from '../store.js';

const QUEUEABLE_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

export const queueService = {
     _lastCreatedNoteId: null,

    async enqueueRequest(request) {
        if (!QUEUEABLE_METHODS.includes(request.method)) {
            console.warn('[Queue] Method not queueable:', request.method);
            return null;
        }

        const queuedRequest = {
            method: request.method,
            endpoint: request.endpoint,
            body: request.body || null,
            formData: request.formData || null,
            localId: request.localId || null,
            type: request.type || null,
            queuedAt: Date.now(),
            retryCount: 0,
        };

        const id = await db.queueRequest(queuedRequest);
        console.log('[Queue] Enqueued:', request.type || request.method, request.endpoint);
        return id;
    },

    async getQueuedRequests() {
        return await db.getQueuedRequests();
    },

    async flushQueue() {
        if (!store.getOnline()) {
            return [];
        }

        this._lastCreatedNoteId = null;

        let queue = await this.getQueuedRequests();
        if (!queue.length) {
            return [];
        }

        const results = [];
        let i = 0;
        
        while (i < queue.length) {
            const requestItem = queue[i];
            try {
                const response = await this._executeRequest(requestItem);

                if (requestItem.localId && requestItem.method === 'POST') {
                    if (requestItem.endpoint === '/notes') {
                        await this._commitLocalNoteId(requestItem.localId, response);
                        const newNoteId = response.id;
                        this._lastCreatedNoteId = newNoteId;
                        queue = await this._updateQueueArray(queue, requestItem.localId, response.id);
                    } else if (requestItem.endpoint.includes('/blocks') && !requestItem.type) {
                        await this._commitLocalBlockId(requestItem.localId, response);
                        queue = await this._updateQueueArrayForBlock(queue, requestItem.localId, response.id || response.block_id);
                    } else if (requestItem.type === 'IMAGE_UPLOAD') {
                        await this._commitLocalImageId(requestItem.localId, response);
                    }
                }

                await db.deleteQueuedRequest(requestItem.id);
                results.push({ id: requestItem.id, status: 'synced', response });

            } catch (error) {
                if (requestItem.retryCount < 3) {
                    await db._promise('requestQueue', 'readwrite', s => {
                        const req = { ...requestItem, retryCount: requestItem.retryCount + 1 };
                        return s.put(req);
                    });
                    results.push({ id: requestItem.id, status: 'retry', retryCount: requestItem.retryCount + 1 });
                } else {
                    await db.deleteQueuedRequest(requestItem.id);
                    results.push({ id: requestItem.id, status: 'failed', error: error.message });
                }

                if (!navigator.onLine || error?.status >= 500) {
                    break;
                }
            }
            i++;
        }
        return results;
    },

    /**
    * Обновляет массив очереди после синхронизации заметки
    */
    async _updateQueueArray(queue, oldNoteId, newNoteId) {
        const updatedQueue = [];
        for (const req of queue) {
            let newEndpoint = req.endpoint;
            let newBody = req.body;
            let needUpdate = false;
            if (req.endpoint && req.endpoint.includes(oldNoteId)) {
                newEndpoint = req.endpoint.replace(new RegExp(oldNoteId, 'g'), newNoteId);
                needUpdate = true;
            }
            if (req.body) {
                if (req.body.note_id === oldNoteId) {
                    newBody = { ...req.body, note_id: newNoteId };
                    needUpdate = true;
                }
                if (req.body.noteId === oldNoteId) {
                    newBody = { ...req.body, noteId: newNoteId };
                    needUpdate = true;
                }
            }
            if (needUpdate) {
                updatedQueue.push({ ...req, endpoint: newEndpoint, body: newBody });
            } else {
                updatedQueue.push(req);
            }
        }
        return updatedQueue;
    },

    /**
     * Обновляет массив очереди после синхронизации блока
     */
    async _updateQueueArrayForBlock(queue, oldBlockId, newBlockId) {
        const updatedQueue = [];
        for (const req of queue) {
            let newEndpoint = req.endpoint;
            let newBody = req.body;
            let needUpdate = false;
            if (req.endpoint && req.endpoint.includes(oldBlockId)) {
                newEndpoint = req.endpoint.replace(new RegExp(oldBlockId, 'g'), newBlockId);
                needUpdate = true;
            }
            if (req.body) {
                if (req.body.blockId === oldBlockId) {
                    newBody = { ...req.body, blockId: newBlockId };
                    needUpdate = true;
                }
                if (req.body.block_id === oldBlockId) {
                    newBody = { ...req.body, block_id: newBlockId };
                    needUpdate = true;
                }
            }
            if (needUpdate) {
                updatedQueue.push({ ...req, endpoint: newEndpoint, body: newBody });
            } else {
                updatedQueue.push(req);
            }
        }
        return updatedQueue;
    },

    /**
     * Выполняет один запрос из очереди
     */
    async _executeRequest(requestItem) {
        const { method, endpoint, body, formData, type } = requestItem;

        if (type === 'IMAGE_UPLOAD') {
            const fileId = body?.fileId;
            if (!fileId) {
                throw new Error('No fileId for IMAGE_UPLOAD');
            }
            
            const fileData = await db.queueFileGet(fileId);
            if (!fileData || !fileData.blob) {
                throw new Error('File not found in queueFiles: ' + fileId);
            }
            
            const formData = new FormData();
            const file = new File([fileData.blob], fileData.filename, { type: fileData.mimeType });
            formData.append('file', file);
            
            return await client.postForm(endpoint, formData);
        }

        switch (method) {
            case 'PUT':
            case 'PATCH':
                if (endpoint.includes('/formatting')) {
                    const response = await client.put(endpoint, body);
                    const blockId = endpoint.split('/').slice(-2)[0];
                    await db.formattingMarkSynced(blockId);
                    return response;
                }
                return await client[method.toLowerCase()](endpoint, body);

            case 'DELETE':
                return await client.delete(endpoint);

            case 'POST':
                if (formData) {
                    return await client.postForm(endpoint, formData);
                }
                return await client.post(endpoint, body);

            default:
                throw new Error(`Unknown method: ${method}`);
        }
    },

    /**
     * Маппинг локального ID заметки на серверный
     */
    async _commitLocalNoteId(localId, serverData) {
        
        const localNote = await db.notesGet(localId);
        if (!localNote) {
            console.warn('[Queue] Local note not found:', localId);
            return;
        }

        const newNoteId = serverData.id || serverData.ID;

        try {
            const imagesToUpdate = await db.imagesGetByNoteId(localId);
            
            for (const image of imagesToUpdate) {
                await db.imagesDelete(image.id);
                await db.imagesPut({
                    ...image,
                    id: image.id,
                    noteId: newNoteId,
                });
            }
        } catch (error) {
            console.warn('[Queue] Failed to update images for note:', error);
        }

        const newNote = {
            ...localNote,
            ID: newNoteId,
            title: serverData.title ?? localNote.title,
            updatedAt: serverData.updated_at ?? serverData.updatedAt ?? localNote.updatedAt,
        };

        await db.notesDelete(localId);
        await db.notesPut(newNote);

        const notes = store.getNotes().map(note => 
            note.ID === localId ? newNote : note
        );
        store.setNotes(notes);

        if (store.getActiveNoteId() === localId) {
            const activeNote = store.getActiveNote();
            if (activeNote) {
                store.setActiveNote({
                    ...activeNote,
                    ID: newNoteId,
                    title: newNote.title,
                });
            }
            store.setActiveNoteId(newNoteId);
        }
    },

    /**
     * Маппинг локального ID блока на серверный
     */
    async _commitLocalBlockId(localId, serverData) {
        
        const newBlockId = serverData.id || serverData.block_id;
        
        try {
            const imagesToUpdate = await db.imagesGetByBlockId(localId);
            
            for (const image of imagesToUpdate) {
                await db.imagesDelete(image.id);
                await db.imagesPut({
                    ...image,
                    id: image.id,
                    blockId: newBlockId,
                });
            }
        } catch (error) {
            console.warn('[Queue] Failed to update images for block:', error);
        }
        
        try {
            const queueFilesToUpdate = await db.queueFileGetByBlockId(localId);
            
            for (const queueFile of queueFilesToUpdate) {
                await db.queueFileDelete(queueFile.id);
                await db.queueFilePut({
                    ...queueFile,
                    id: queueFile.id,
                    blockId: newBlockId,
                });
            }
        } catch (error) {
            console.warn('[Queue] Failed to update queueFiles for block:', error);
        }
        
        const activeBlocks = store.getActiveBlocks();
        const updatedActiveBlocks = activeBlocks.map(block =>
            block.id === localId ? { ...block, id: newBlockId } : block
        );
        store.setActiveBlocks(updatedActiveBlocks);
        
        let foundNoteId = null;
        
        const activeNoteId = store.getActiveNoteId();
        const activeNote = await db.notesGet(activeNoteId);
        if (activeNote && activeNote.blocks && activeNote.blocks.some(b => b.id === localId)) {
            foundNoteId = activeNoteId;
            const updatedBlocks = activeNote.blocks.map(block =>
                block.id === localId ? { ...block, id: newBlockId } : block
            );
            await db.notesPut({ ...activeNote, blocks: updatedBlocks });
        } else {
            const allNotes = await db.notesGetAll();
            for (const note of allNotes) {
                if (note.blocks && note.blocks.some(b => b.id === localId)) {
                    foundNoteId = note.ID;
                    const updatedBlocks = note.blocks.map(block =>
                        block.id === localId ? { ...block, id: newBlockId } : block
                    );
                    await db.notesPut({ ...note, blocks: updatedBlocks });
                    break;
                }
            }
        }
    },
   
    async _commitLocalImageId(localId, serverData) {
        let image = await db.imagesGet(localId);
        
        if (!image) {
            const imagesByUrl = await db.imagesGetByUrl(`local://${localId}`);
            image = imagesByUrl[0];
        }
        
        const newImageId = serverData.id;
        const newImageUrl = serverData.attach_url;
        
        const updatedImage = {
            ...image,
            id: newImageId,
            url: newImageUrl,
            status: 'synced',
            syncedAt: Date.now(),
        };
        // delete updatedImage.blob;
        
        await db.imagesDelete(localId);
        await db.imagesPut(updatedImage);
        await db.queueFileDelete(localId);
        const newImageContent = JSON.stringify({
            url: newImageUrl,
            filename: serverData.minio_key || image.filename,
            size: image.size,
            mimeType: image.mimeType,
            attachmentId: newImageId
        });
        try {
            const response = await client.put(`/notes/${image.noteId}/blocks/${image.blockId}/content`, {
                content: newImageContent
            });
            console.log('[Queue] Block content updated on server, response:', response);

            const cachedNote = await db.notesGet(image.noteId);
            if (cachedNote && cachedNote.blocks) {
                const updatedBlocks = cachedNote.blocks.map(b =>
                    b.id === image.blockId ? { ...b, content: newImageContent } : b
                );
                await db.notesPut({ ...cachedNote, blocks: updatedBlocks });
            }
            const blocks = store.getActiveBlocks();
            const updatedBlocks = blocks.map(b =>
                b.id === image.blockId ? { ...b, content: newImageContent } : b
            );
            store.setActiveBlocks(updatedBlocks);
            
        } catch (error) {
            console.error('[Queue] Failed to update block content:', error);
            throw error;
        }
    },

    /**
     * Очищает очередь
     */
    async clearQueue() {
        await db.clearQueuedRequests();
    },

    /**
     * Получает статистику очереди
     */
    async getQueueStats() {
        const requests = await this.getQueuedRequests();
        return {
            total: requests.length,
            byType: requests.reduce((acc, r) => {
                const type = r.type || 'unknown';
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {}),
            oldest: requests.length > 0 ? Math.min(...requests.map(r => r.queuedAt)) : null,
        };
    }
};