import { client } from '../client/client.js';
import { db } from '../db.js';
import { store } from '../store.js';
import type { AttachmentApiResponse, Block } from '../types.js';
import { handleAuthError } from '../utils/handleAuthError';
import { noteService } from './noteService.js';
import { queueService } from './requestQueueService.js';

interface CreateBlockData {
	note_id: string | number;
	block_type_id: number;
	position: number;
	content: string;
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

	async createAudioBlock(
		noteId: string | number,
		file: File,
		afterBlockId: string | null = null,
	): Promise<Block> {
		const isOnline = store.getOnline();
		if (isOnline) {
			return await this._createAudioOnline(noteId, file, afterBlockId);
		} else {
			return await this._createAudioOffline(noteId, file, afterBlockId);
		}
	},

	async createVideoBlock(
		noteId: string | number,
		file: File,
		afterBlockId: string | null = null,
	): Promise<Block> {
		const isOnline = store.getOnline();
		if (isOnline) {
			return await this._createVideoOnline(noteId, file, afterBlockId);
		} else {
			return await this._createVideoOffline(noteId, file, afterBlockId);
		}
	},

	async _prepareInsertPosition(
		noteId: string | number,
		afterBlockId: string | null = null,
	): Promise<{ insertIndex: number; shiftedBlocks: Block[] }> {
		const currentBlocks = store.getActiveBlocks();
		const sortedBlocks = [...currentBlocks].sort(
			(a, b) => a.position - b.position,
		);

		let insertIndex: number;
		if (afterBlockId) {
			const afterIndex = sortedBlocks.findIndex(
				(b) => String(b.id) === afterBlockId,
			);
			insertIndex = afterIndex + 1;
		} else {
			insertIndex = sortedBlocks.length;
		}

		const shiftedBlocks = sortedBlocks.map((block, idx) => {
			if (idx >= insertIndex) {
				return { ...block, position: idx + 1 };
			}
			return { ...block, position: idx };
		});

		return { insertIndex, shiftedBlocks };
	},

	async _saveToCache(
		noteId: string | number,
		blockId: string | number,
		attachmentId: string | number,
		file: File,
		url: string,
		type: 'image' | 'audio' | 'video',
	): Promise<void> {
		const blob = await this._fileToBlob(file);
		const attachmentData = {
			id: attachmentId,
			blockId: blockId,
			noteId: noteId,
			blob: blob,
			filename: file.name,
			mimeType: file.type,
			size: file.size,
			url: url,
			status: 'synced' as const,
			syncedAt: Date.now(),
		};

		if (type === 'image') {
			await db.imagesPut(attachmentData);
		} else if (type === 'audio') {
			await db.audiosPut(attachmentData);
		} else {
			await db.videosPut(attachmentData);
		}
	},

	async _createVideoOnline(
		noteId: string | number,
		file: File,
		afterBlockId: string | null = null,
	): Promise<Block> {
		const { insertIndex, shiftedBlocks } = await this._prepareInsertPosition(
			noteId,
			afterBlockId,
		);
		store.setActiveBlocksSilently(shiftedBlocks);

		const cachedNote = await db.notesGet(noteId);
		if (cachedNote) {
			await db.notesPut({ ...cachedNote, blocks: shiftedBlocks });
		}

		const formData = new FormData();
		formData.append('file', file);
		const attachmentResult = await client.postForm<AttachmentApiResponse>(
			`/notes/${noteId}/attachments`,
			formData,
		);

		await this._saveToCache(
			noteId,
			attachmentResult.block_id,
			attachmentResult.id,
			file,
			attachmentResult.attach_url,
			'video',
		);

		const finalBlock: Block = {
			id: attachmentResult.block_id,
			note_id: noteId,
			block_type_id: 7,
			position: insertIndex,
			content: attachmentResult.id,
			created_at: attachmentResult.created_at,
			updated_at: new Date().toISOString(),
			formatting: { ranges: [] },
		};

		const updatedBlocks = shiftedBlocks.map((block) =>
			block.id === finalBlock.id ? finalBlock : block,
		);
		if (!updatedBlocks.some((b) => b.id === finalBlock.id)) {
			updatedBlocks.push(finalBlock);
		}
		updatedBlocks.sort((a, b) => a.position - b.position);
		store.setActiveBlocks(updatedBlocks);
		await db.notesUpdateBlocks(noteId, updatedBlocks);

		return finalBlock;
	},

	async _createVideoOffline(
		noteId: string | number,
		file: File,
		afterBlockId: string | null = null,
	): Promise<Block> {
		const { insertIndex, shiftedBlocks } = await this._prepareInsertPosition(
			noteId,
			afterBlockId,
		);
		store.setActiveBlocksSilently(shiftedBlocks);

		const cachedNote = await db.notesGet(noteId);
		if (cachedNote) {
			await db.notesPut({ ...cachedNote, blocks: shiftedBlocks });
		}

		const localAttachmentId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		const blockData: CreateBlockData = {
			note_id: noteId,
			block_type_id: 7,
			position: insertIndex,
			content: localAttachmentId,
		};

		const newBlock = await noteService.createBlock(noteId, blockData, true);
		const blob = await this._fileToBlob(file);

		await db.videosPut({
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
			endpoint: `/notes/${noteId}/attachments`,
			type: 'VIDEO_UPLOAD',
			localId: localAttachmentId,
			body: { fileId: localAttachmentId, noteId, blockId: newBlock.id },
		});

		const finalBlock: Block = {
			...newBlock,
			content: localAttachmentId,
		};

		const updatedBlocks = shiftedBlocks.map((block) =>
			block.id === finalBlock.id ? finalBlock : block,
		);
		if (!updatedBlocks.some((b) => b.id === finalBlock.id)) {
			updatedBlocks.push(finalBlock);
		}
		updatedBlocks.sort((a, b) => a.position - b.position);
		store.setActiveBlocks(updatedBlocks);
		await db.notesUpdateBlocks(noteId, updatedBlocks);

		return finalBlock;
	},

	async _createAudioOnline(
		noteId: string | number,
		file: File,
		afterBlockId: string | null = null,
	): Promise<Block> {
		const { insertIndex, shiftedBlocks } = await this._prepareInsertPosition(
			noteId,
			afterBlockId,
		);
		store.setActiveBlocksSilently(shiftedBlocks);

		const cachedNote = await db.notesGet(noteId);
		if (cachedNote) {
			await db.notesPut({ ...cachedNote, blocks: shiftedBlocks });
		}

		const formData = new FormData();
		formData.append('file', file);
		const attachmentResult = await client.postForm<AttachmentApiResponse>(
			`/notes/${noteId}/attachments`,
			formData,
		);

		await this._saveToCache(
			noteId,
			attachmentResult.block_id,
			attachmentResult.id,
			file,
			attachmentResult.attach_url,
			'audio',
		);

		const finalBlock: Block = {
			id: attachmentResult.block_id,
			note_id: noteId,
			block_type_id: 6,
			position: insertIndex,
			content: attachmentResult.id,
			created_at: attachmentResult.created_at,
			updated_at: new Date().toISOString(),
			formatting: { ranges: [] },
		};

		const updatedBlocks = shiftedBlocks.map((block) =>
			block.id === finalBlock.id ? finalBlock : block,
		);
		if (!updatedBlocks.some((b) => b.id === finalBlock.id)) {
			updatedBlocks.push(finalBlock);
		}
		updatedBlocks.sort((a, b) => a.position - b.position);
		store.setActiveBlocks(updatedBlocks);
		await db.notesUpdateBlocks(noteId, updatedBlocks);

		return finalBlock;
	},

	async _createAudioOffline(
		noteId: string | number,
		file: File,
		afterBlockId: string | null = null,
	): Promise<Block> {
		const { insertIndex, shiftedBlocks } = await this._prepareInsertPosition(
			noteId,
			afterBlockId,
		);
		store.setActiveBlocksSilently(shiftedBlocks);

		const cachedNote = await db.notesGet(noteId);
		if (cachedNote) {
			await db.notesPut({ ...cachedNote, blocks: shiftedBlocks });
		}

		const localAttachmentId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		const blockData: CreateBlockData = {
			note_id: noteId,
			block_type_id: 6,
			position: insertIndex,
			content: localAttachmentId,
		};

		const newBlock = await noteService.createBlock(noteId, blockData, true);
		const blob = await this._fileToBlob(file);

		await db.audiosPut({
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
			endpoint: `/notes/${noteId}/attachments`,
			type: 'AUDIO_UPLOAD',
			localId: localAttachmentId,
			body: { fileId: localAttachmentId, noteId, blockId: newBlock.id },
		});

		const finalBlock: Block = {
			...newBlock,
			content: localAttachmentId,
		};

		const updatedBlocks = shiftedBlocks.map((block) =>
			block.id === finalBlock.id ? finalBlock : block,
		);
		if (!updatedBlocks.some((b) => b.id === finalBlock.id)) {
			updatedBlocks.push(finalBlock);
		}
		updatedBlocks.sort((a, b) => a.position - b.position);
		store.setActiveBlocks(updatedBlocks);
		await db.notesUpdateBlocks(noteId, updatedBlocks);

		return finalBlock;
	},

	async _createOnline(
		noteId: string | number,
		file: File,
		afterBlockId: string | null = null,
	): Promise<Block> {
		const { insertIndex, shiftedBlocks } = await this._prepareInsertPosition(
			noteId,
			afterBlockId,
		);
		store.setActiveBlocksSilently(shiftedBlocks);

		const cachedNote = await db.notesGet(noteId);
		if (cachedNote) {
			await db.notesPut({ ...cachedNote, blocks: shiftedBlocks });
		}

		const formData = new FormData();
		formData.append('file', file);
		const attachmentResult = await client.postForm<AttachmentApiResponse>(
			`/notes/${noteId}/attachments`,
			formData,
		);

		await this._saveToCache(
			noteId,
			attachmentResult.block_id,
			attachmentResult.id,
			file,
			attachmentResult.attach_url,
			'image',
		);

		const finalBlock: Block = {
			id: attachmentResult.block_id,
			note_id: noteId,
			block_type_id: 2,
			position: insertIndex,
			content: attachmentResult.id,
			created_at: attachmentResult.created_at,
			updated_at: new Date().toISOString(),
		};

		const updatedBlocks = shiftedBlocks.map((block) =>
			block.id === finalBlock.id ? finalBlock : block,
		);
		if (!updatedBlocks.some((b) => b.id === finalBlock.id)) {
			updatedBlocks.push(finalBlock);
		}
		updatedBlocks.sort((a, b) => a.position - b.position);
		store.setActiveBlocks(updatedBlocks);
		await db.notesUpdateBlocks(noteId, updatedBlocks);

		return finalBlock;
	},

	async _createOffline(
		noteId: string | number,
		file: File,
		afterBlockId: string | null = null,
	): Promise<Block> {
		const { insertIndex, shiftedBlocks } = await this._prepareInsertPosition(
			noteId,
			afterBlockId,
		);
		store.setActiveBlocksSilently(shiftedBlocks);

		const cachedNote = await db.notesGet(noteId);
		if (cachedNote) {
			await db.notesPut({ ...cachedNote, blocks: shiftedBlocks });
		}

		const localAttachmentId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		const blockData: CreateBlockData = {
			note_id: noteId,
			block_type_id: 2,
			position: insertIndex,
			content: localAttachmentId,
		};

		const newBlock = await noteService.createBlock(noteId, blockData, true);
		const blob = await this._fileToBlob(file);

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
			endpoint: `/notes/${noteId}/attachments`,
			type: 'IMAGE_UPLOAD',
			localId: localAttachmentId,
			body: { fileId: localAttachmentId, noteId, blockId: newBlock.id },
		});

		const finalBlock: Block = {
			...newBlock,
			content: localAttachmentId,
		};

		const updatedBlocks = shiftedBlocks.map((block) =>
			block.id === finalBlock.id ? finalBlock : block,
		);
		if (!updatedBlocks.some((b) => b.id === finalBlock.id)) {
			updatedBlocks.push(finalBlock);
		}
		updatedBlocks.sort((a, b) => a.position - b.position);
		store.setActiveBlocks(updatedBlocks);
		await db.notesUpdateBlocks(noteId, updatedBlocks);

		return finalBlock;
	},

	async getVideoUrl(
		attachmentId: string | number,
		noteId: string | number,
		blockId: string | number,
	): Promise<string | null> {
		const localVideo = await db.videosGet(attachmentId);
		if (localVideo?.blob) {
			return URL.createObjectURL(localVideo.blob);
		}
		if (store.getOnline()) {
			try {
				const attachData = await client.get<AttachmentApiResponse>(
					`/notes/${noteId}/blocks/${blockId}/attachments`,
				);
				let videoUrl = attachData.attach_url;
				videoUrl = videoUrl.replace('http://minio:9000', '/minio');
				const response = await fetch(videoUrl);
				if (response.ok) {
					const blob = await response.blob();
					await db.videosPut({
						id: attachmentId,
						blockId: blockId,
						noteId: noteId,
						blob: blob,
						filename: localVideo?.filename || 'video',
						mimeType: blob.type,
						size: blob.size,
						url: videoUrl,
						status: 'synced',
						syncedAt: Date.now(),
					});
					return URL.createObjectURL(blob);
				}
			} catch (error) {
				console.warn('[attachmentService] Failed to fetch video:', error);
				handleAuthError(error);
			}
		}
		return null;
	},

	async getAudioUrl(
		attachmentId: string | number,
		noteId: string | number,
		blockId: string | number,
	): Promise<string | null> {
		const localAudio = await db.audiosGet(attachmentId);
		if (localAudio?.blob) {
			return URL.createObjectURL(localAudio.blob);
		}
		if (store.getOnline()) {
			try {
				const attachData = await client.get<AttachmentApiResponse>(
					`/notes/${noteId}/blocks/${blockId}/attachments`,
				);
				let audioUrl = attachData.attach_url;
				audioUrl = audioUrl.replace('http://minio:9000', '/minio');
				const response = await fetch(audioUrl);
				if (response.ok) {
					const blob = await response.blob();
					await db.audiosPut({
						id: attachmentId,
						blockId: blockId,
						noteId: noteId,
						blob: blob,
						filename: localAudio?.filename || 'audio',
						mimeType: blob.type,
						size: blob.size,
						url: audioUrl,
						status: 'synced',
						syncedAt: Date.now(),
					});
					return URL.createObjectURL(blob);
				}
			} catch (error) {
				console.warn('[attachmentService] Failed to fetch audio:', error);
				handleAuthError(error);
			}
		}
		return null;
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
		const blocks = store.getActiveBlocks();
		const block = blocks.find((b) => b.id === blockId);
		const blockType = block?.block_type_id;

		if (block && block.content) {
			try {
				const attachmentId = block.content;

				if (attachmentId) {
					if (blockType === 2) {
						await db.imagesDelete(attachmentId);
					} else if (blockType === 6) {
						await db.audiosDelete(attachmentId);
					} else if (blockType === 7) {
						await db.videosDelete(attachmentId);
					}
				}
			} catch (e) {
				console.warn('[attachmentService] Failed to parse block content:', e);
			}
		}
	},
};
