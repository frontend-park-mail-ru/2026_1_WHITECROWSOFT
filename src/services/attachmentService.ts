import { client } from '../client/client.js';
import { db } from '../db.js';
import { store } from '../store.js';
import type { AttachmentApiResponse, Block } from '../types.js';
import { handleAuthError } from '../utils/handleAuthError';
import { noteService } from './noteService.js';
import { queueService } from './requestQueueService.js';

interface CreateBlockResponse {
	id: string | number;
	block_type_id: number;
	content: string;
	position: number;
	created_at?: string;
	updated_at?: string;
}

interface CreateBlockData {
	note_id: string | number;
	block_type_id: number;
	position: number;
	content: string;
}

interface LocalAttachmentResult {
	id: string;
	attach_url: string;
	minio_key: string;
	size: number;
	mime_type: string;
	local: boolean;
}

export const attachmentService = {
	async createImageBlock(
		noteId: string | number,
		file: File,
		afterBlockId: string | null = null,
	): Promise<Block> {
		const isOnline = store.getOnline();
		if (isOnline) {
			return await this._createOnline(noteId, file, afterBlockId);
		} else {
			return await this._createOffline(noteId, file, afterBlockId);
		}
	},

	async _createOnline(
		noteId: string | number,
		file: File,
		afterBlockId: string | null = null,
	): Promise<Block> {
		let newPosition: number;

		if (afterBlockId) {
			const blocks = store.getActiveBlocks();
			const sortedBlocks = [...blocks].sort((a, b) => a.position - b.position);
			const afterBlock = sortedBlocks.find(
				(b) => String(b.id) === afterBlockId,
			);

			if (afterBlock) {
				const afterIndex = sortedBlocks.findIndex(
					(b) => String(b.id) === afterBlockId,
				);
				if (afterIndex === sortedBlocks.length - 1) {
					newPosition = afterBlock.position + 1;
				} else {
					const nextBlock = sortedBlocks[afterIndex + 1];
					newPosition = nextBlock.position;
				}
			} else {
				newPosition =
					sortedBlocks.length > 0
						? sortedBlocks[sortedBlocks.length - 1].position + 1
						: 0;
			}
		} else {
			const sortedBlocks = [...store.getActiveBlocks()].sort(
				(a, b) => a.position - b.position,
			);
			newPosition =
				sortedBlocks.length > 0
					? sortedBlocks[sortedBlocks.length - 1].position + 1
					: 0;
		}

		const blockData: CreateBlockData = {
			note_id: noteId,
			block_type_id: 2,
			position: newPosition,
			content: '',
		};

		const createdBlock = await client.post<CreateBlockResponse>(
			`/notes/${noteId}/blocks`,
			blockData,
		);
		const blockId = createdBlock.id;

		const formData = new FormData();
		formData.append('file', file);
		const attachmentResult = await client.postForm<AttachmentApiResponse>(
			`/notes/${noteId}/blocks/${blockId}/attachments`,
			formData,
		);

		const imageContent = JSON.stringify({
			url: attachmentResult.attach_url,
			filename: attachmentResult.minio_key || file.name,
			size: file.size,
			mimeType: file.type,
			attachmentId: attachmentResult.id,
		});

		await client.put(`/notes/${noteId}/blocks/${blockId}/content`, {
			content: imageContent,
		});

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
			syncedAt: Date.now(),
		});

		const cachedNote = await db.notesGet(noteId);
		if (cachedNote) {
			const finalBlockForCache: Block = {
				id: blockId,
				note_id: noteId,
				block_type_id: 2,
				position: newPosition,
				content: imageContent,
				created_at: createdBlock.created_at,
				updated_at: new Date().toISOString(),
				formatting: { ranges: [] },
			};
			const blocks = [...(cachedNote.blocks || []), finalBlockForCache];
			blocks.sort((a, b) => a.position - b.position);
			await db.notesPut({ ...cachedNote, blocks });
		}

		const finalBlock: Block = {
			id: blockId,
			note_id: noteId,
			block_type_id: 2,
			position: newPosition,
			content: imageContent,
			created_at: createdBlock.created_at,
			updated_at: new Date().toISOString(),
			formatting: { ranges: [] },
		};

		return finalBlock;
	},

	async _createOffline(
		noteId: string | number,
		file: File,
		afterBlockId: string | null = null,
	): Promise<Block> {
		let newPosition: number;

		if (afterBlockId) {
			const blocks = store.getActiveBlocks();
			const sortedBlocks = [...blocks].sort((a, b) => a.position - b.position);
			const afterBlock = sortedBlocks.find(
				(b) => String(b.id) === afterBlockId,
			);

			if (afterBlock) {
				const afterIndex = sortedBlocks.findIndex(
					(b) => String(b.id) === afterBlockId,
				);
				if (afterIndex === sortedBlocks.length - 1) {
					newPosition = afterBlock.position + 1;
				} else {
					const nextBlock = sortedBlocks[afterIndex + 1];
					newPosition = (afterBlock.position + nextBlock.position) / 2;
				}
			} else {
				newPosition =
					sortedBlocks.length > 0
						? sortedBlocks[sortedBlocks.length - 1].position + 1
						: 0;
			}
		} else {
			const sortedBlocks = [...store.getActiveBlocks()].sort(
				(a, b) => a.position - b.position,
			);
			newPosition =
				sortedBlocks.length > 0
					? sortedBlocks[sortedBlocks.length - 1].position + 1
					: 0;
		}

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
			createdAt: Date.now(),
		});

		await db.queueFilePut({
			id: localAttachmentId,
			blockId: localBlockId,
			noteId: noteId,
			blob: blob,
			filename: file.name,
			mimeType: file.type,
			size: file.size,
			queuedAt: Date.now(),
		});

		const imageContent = JSON.stringify({
			url: `local://${localAttachmentId}`,
			filename: file.name,
			size: file.size,
			mimeType: file.type,
			attachmentId: localAttachmentId,
			isLocal: true,
			pendingSync: true,
		});

		const newBlock = await noteService.createBlock(noteId, {
			note_id: noteId,
			block_type_id: 2,
			position: newPosition,
			content: imageContent,
		});

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
			createdAt: Date.now(),
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
			queuedAt: Date.now(),
		});

		await queueService.enqueueRequest({
			method: 'POST',
			endpoint: `/notes/${noteId}/blocks/${newBlock.id}/attachments`,
			type: 'IMAGE_UPLOAD',
			localId: localAttachmentId,
			body: { fileId: localAttachmentId, noteId, blockId: newBlock.id },
		});

		return newBlock;
	},

	async getImageUrl(
		attachmentId: string | number,
		noteId: string | number,
		blockId: string | number,
	): Promise<string | null> {
		const localImage = await db.imagesGet(attachmentId);
		if (localImage?.blob) {
			return URL.createObjectURL(localImage.blob);
		}

		if (store.getOnline()) {
			try {
				const attachData = await client.get<AttachmentApiResponse>(
					`/notes/${noteId}/blocks/${blockId}/attachments`,
				);
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
						syncedAt: Date.now(),
					});
					return URL.createObjectURL(blob);
				}
			} catch (error) {
				console.warn('[attachmentService] Failed to fetch image:', error);
				handleAuthError(error);
			}
		}
		return null;
	},

	async syncPendingAttachment(
		localAttachmentId: string,
		noteId: string | number,
		blockId: string | number,
	): Promise<AttachmentApiResponse> {
		const localImage = await db.imagesGet(localAttachmentId);
		if (!localImage?.blob) throw new Error('Local image not found');

		const file = new File([localImage.blob], localImage.filename, {
			type: localImage.mimeType,
		});
		const formData = new FormData();
		formData.append('file', file);

		const result = await client.postForm<AttachmentApiResponse>(
			`/notes/${noteId}/blocks/${blockId}/attachments`,
			formData,
		);

		const imageUrl = `/minio/attachments/${result.id}`;
		const imageContent = JSON.stringify({
			url: imageUrl,
			filename: result.minio_key || file.name,
			size: file.size,
			mimeType: file.type,
			attachmentId: result.id,
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
			syncedAt: Date.now(),
		});

		const blocks = store.getActiveBlocks();
		const updatedBlocks = blocks.map((b) =>
			b.id === blockId ? { ...b, content: imageContent } : b,
		);
		store.setActiveBlocks(updatedBlocks);

		return result;
	},

	async _saveLocalAndQueueForExistingBlock(
		noteId: string | number,
		blockId: string | number,
		file: File,
	): Promise<LocalAttachmentResult> {
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
			createdAt: Date.now(),
		});

		const imageContent = JSON.stringify({
			url: `local://${localAttachmentId}`,
			filename: file.name,
			size: file.size,
			mimeType: file.type,
			attachmentId: localAttachmentId,
			isLocal: true,
			pendingSync: true,
		});

		await noteService.updateBlockContent(noteId, blockId, imageContent);

		await queueService.enqueueRequest({
			method: 'POST',
			endpoint: `/notes/${noteId}/blocks/${blockId}/attachments`,
			type: 'IMAGE_UPLOAD',
			localId: localAttachmentId,
			body: { fileId: localAttachmentId, noteId, blockId },
		});

		return {
			id: localAttachmentId,
			attach_url: `local://${localAttachmentId}`,
			minio_key: file.name,
			size: file.size,
			mime_type: file.type,
			local: true,
		};
	},

	_fileToBlob(file: File): Promise<Blob> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () =>
				resolve(new Blob([reader.result as ArrayBuffer], { type: file.type }));
			reader.onerror = reject;
			reader.readAsArrayBuffer(file);
		});
	},

	async deleteAttachment(
		noteId: string | number,
		blockId: string | number,
	): Promise<void> {
		const isOnline = store.getOnline();
		const blocks = store.getActiveBlocks();
		const block = blocks.find((b) => b.id === blockId);

		if (block && block.content) {
			try {
				const imageData = JSON.parse(block.content) as {
					attachmentId?: string | number;
				};
				const attachmentId = imageData.attachmentId;
				if (attachmentId) {
					await db.imagesDelete(attachmentId);
				}
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
					type: 'IMAGE_DELETE',
				});
			}
		} else {
			await queueService.enqueueRequest({
				method: 'DELETE',
				endpoint: `/notes/${noteId}/blocks/${blockId}/attachments`,
				type: 'IMAGE_DELETE',
			});
		}
	},
};
