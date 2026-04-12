import { client } from '../client/client.js';
import { db } from '../db.js';
import { store } from '../store.js';
import { queueService } from './requestQueueService.js';
import { noteService } from './noteService.js';

export const attachmentService = {

    async createImageBlock(noteId, file) {
        const isOnline = store.getOnline();
        if (isOnline) {
            return await this._createOnline(noteId, file);
        } else {
            return await this._createOffline(noteId, file);
        }
    },


    async _createOnline(noteId, file) {
        const blockData = {
            note_id: noteId,
            block_type_id: 2,
            position: store.getActiveBlocks().length,
            content: ''
        };
        const createdBlock = await client.post(`/notes/${noteId}/blocks`, blockData);
        const blockId = createdBlock.id;

        const formData = new FormData();
        formData.append('file', file);
        const attachmentResult = await client.postForm(
            `/notes/${noteId}/blocks/${blockId}/attachments`,
            formData
        );

        const imageContent = JSON.stringify({
            url: attachmentResult.attach_url,
            filename: attachmentResult.minio_key || file.name,
            size: file.size,
            mimeType: file.type,
            attachmentId: attachmentResult.id
        });
        await client.put(`/notes/${noteId}/blocks/${blockId}/content`, { content: imageContent });

        const blob = await this._fileToBlob(file);
        await db.imagesPut({
            id: attachmentResult.id,
            blockId: blockId,
            noteId: noteId,
            blob: blob,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            url: attachmentResult.attach_url,
            status: 'synced',
            syncedAt: Date.now()
        });

        const finalBlock = {
            id: blockId,
            note_id: noteId,
            block_type_id: 2,
            position: blockData.position,
            content: imageContent,
            created_at: createdBlock.created_at,
            updated_at: new Date().toISOString(),
            formatting: { ranges: [] }
        };

        const cachedNote = await db.notesGet(noteId);
        if (cachedNote) {
            const blocks = [...(cachedNote.blocks || []), finalBlock];
            await db.notesPut({ ...cachedNote, blocks });
        }

        const currentBlocks = store.getActiveBlocks();
        store.setActiveBlocks([...currentBlocks, finalBlock]);

        return finalBlock;
    },

    /**
     * Оффлайн-создание: сохраняем локально и добавляем в очередь
     */
    async _createOffline(noteId, file) {
        const localAttachmentId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const localBlockId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const blob = await this._fileToBlob(file);
        
        await db.imagesPut({
            id: localAttachmentId,
            blockId: localBlockId,
            noteId: noteId,
            blob: blob,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            status: 'pending',
            isLocal: true,
            createdAt: Date.now()
        });
        
        await db.queueFilePut({
            id: localAttachmentId,
            blockId: localBlockId,
            noteId: noteId,
            blob: blob,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            queuedAt: Date.now()
        });
        
        const imageContent = JSON.stringify({
            url: `local://${localAttachmentId}`,
            filename: file.name,
            size: file.size,
            mimeType: file.type,
            attachmentId: localAttachmentId,
            isLocal: true,
            pendingSync: true
        });
        
        const newBlock = await noteService.createBlock(noteId, {
            note_id: noteId,
            block_type_id: 2,
            position: store.getActiveBlocks().length,
            content: imageContent
        });
        
        console.log('[attachmentService] Updating image blockId from', localBlockId, 'to', newBlock.id);
        await db.imagesDelete(localAttachmentId);
        await db.imagesPut({
            id: localAttachmentId,
            blockId: newBlock.id,
            noteId: noteId,
            blob: blob,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            status: 'pending',
            isLocal: true,
            createdAt: Date.now()
        });
        
        await db.queueFileDelete(localAttachmentId);
        await db.queueFilePut({
            id: localAttachmentId,
            blockId: newBlock.id,
            noteId: noteId,
            blob: blob,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            queuedAt: Date.now()
        });
        
        await queueService.enqueueRequest({
            method: 'POST',
            endpoint: `/notes/${noteId}/blocks/${newBlock.id}/attachments`,
            type: 'IMAGE_UPLOAD',
            localId: localAttachmentId,
            body: { fileId: localAttachmentId, noteId, blockId: newBlock.id }
        });
        
        return newBlock;
    },

    async getImageUrl(attachmentId, noteId, blockId) {
        const localImage = await db.imagesGet(attachmentId);
        if (localImage?.blob) {
            return URL.createObjectURL(localImage.blob);
        }
        if (store.getOnline()) {
            try {
                const attachData = await client.get(`/notes/${noteId}/blocks/${blockId}/attachments`);
                let imageUrl = attachData.attach_url;
                imageUrl = imageUrl.replace('http://minio:9000', '/minio');
                const response = await fetch(imageUrl);
                if (response.ok) {
                    const blob = await response.blob();
                    await db.imagesPut({
                        id: attachmentId,
                        blockId: blockId,
                        noteId: noteId,
                        blob: blob,
                        filename: localImage?.filename || 'image',
                        mimeType: blob.type,
                        size: blob.size,
                        url: imageUrl,
                        status: 'synced',
                        syncedAt: Date.now()
                    });
                    return URL.createObjectURL(blob);
                }
            } catch (error) {
                console.warn('[attachmentService] Failed to fetch image:', error);
            }
        }
        return null;
    },

    async syncPendingAttachment(localAttachmentId, noteId, blockId) {
        const localImage = await db.imagesGet(localAttachmentId);
        if (!localImage?.blob) throw new Error('Local image not found');

        const file = new File([localImage.blob], localImage.filename, { type: localImage.mimeType });
        const formData = new FormData();
        formData.append('file', file);
        const result = await client.postForm(`/notes/${noteId}/blocks/${blockId}/attachments`, formData);

        const imageUrl = `/minio/attachments/${result.id}`;
        const imageContent = JSON.stringify({
            url: imageUrl,
            filename: result.minio_key || file.name,
            size: file.size,
            mimeType: file.type,
            attachmentId: result.id
        });
        await noteService.updateBlockContent(noteId, blockId, imageContent);

        await db.imagesDelete(localAttachmentId);
        await db.imagesPut({
            id: result.id,
            blockId: blockId,
            noteId: noteId,
            blob: localImage.blob,
            filename: result.minio_key || file.name,
            mimeType: file.type,
            size: file.size,
            url: imageUrl,
            status: 'synced',
            syncedAt: Date.now()
        });

        const blocks = store.getActiveBlocks();
        store.setActiveBlocks(blocks.map(b => b.id === blockId ? { ...b, content: imageContent } : b));
        return result;
    },

    async _saveLocalAndQueueForExistingBlock(noteId, blockId, file) {
        const localAttachmentId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const blob = await this._fileToBlob(file);
        await db.imagesPut({
            id: localAttachmentId,
            blockId: blockId,
            noteId: noteId,
            blob: blob,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            status: 'pending',
            isLocal: true,
            createdAt: Date.now()
        });
        const imageContent = JSON.stringify({
            url: `local://${localAttachmentId}`,
            filename: file.name,
            size: file.size,
            mimeType: file.type,
            attachmentId: localAttachmentId,
            isLocal: true,
            pendingSync: true
        });
        await noteService.updateBlockContent(noteId, blockId, imageContent);
        await queueService.enqueueRequest({
            method: 'POST',
            endpoint: `/notes/${noteId}/blocks/${blockId}/attachments`,
            type: 'IMAGE_UPLOAD',
            localId: localAttachmentId,
            body: { fileId: localAttachmentId, noteId, blockId }
        });
        return {
            id: localAttachmentId,
            attach_url: `local://${localAttachmentId}`,
            minio_key: file.name,
            size: file.size,
            mime_type: file.type,
            local: true
        };
    },

    _fileToBlob(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(new Blob([reader.result], { type: file.type }));
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    },
    
    async deleteAttachment(noteId, blockId) {
        const isOnline = store.getOnline();
        const blocks = store.getActiveBlocks();
        const block = blocks.find(b => b.id === blockId);
        
        if (block && block.content) {
            try {
                const imageData = JSON.parse(block.content);
                const attachmentId = imageData.attachmentId;
                await db.imagesDelete(attachmentId);
            } catch (e) {
                console.warn('[attachmentService] Failed to parse block content:', e);
            }
        }
        
        if (isOnline) {
            try {
                await client.delete(`/notes/${noteId}/blocks/${blockId}/attachments`);
            } catch (error) {
                console.warn('[attachmentService] Failed to delete on server:', error);
                await queueService.enqueueRequest({
                    method: 'DELETE',
                    endpoint: `/notes/${noteId}/blocks/${blockId}/attachments`,
                    type: 'IMAGE_DELETE'
                });
            }
        } else {
            await queueService.enqueueRequest({
                method: 'DELETE',
                endpoint: `/notes/${noteId}/blocks/${blockId}/attachments`,
                type: 'IMAGE_DELETE'
            });
        }
    }
};
