import { client } from '../client/client.js';
import { db } from '../db.js';
import { store } from '../store.js';
import type { Note, QueuedRequest } from '../types.js';

const QUEUEABLE_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

interface EnqueueRequestOptions {
	method: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	endpoint: string;
	body?: unknown | null;
	formData?: FormData | null;
	localId?: string | null;
	type?: string | null;
	silent?: boolean;
}

interface AttachmentApiResponse {
	id: string | number;
	attach_url: string;
	minio_key?: string;
}

interface ServerResponseWithId {
	id: string | number;
	block_id?: string | number;
}

export const queueService = {
	async enqueueRequest(request: EnqueueRequestOptions): Promise<number | null> {
		if (!QUEUEABLE_METHODS.includes(request.method)) {
			console.warn('[Queue] Method not queueable:', request.method);
			return null;
		}

		const queuedRequest: Omit<QueuedRequest, 'id'> = {
			method: request.method,
			endpoint: request.endpoint,
			body: request.body || null,
			formData: request.formData || null,
			localId: request.localId || null,
			type: request.type || null,
			silent: request.silent || false,
			queuedAt: Date.now(),
			retryCount: 0,
		};

		const id = await db.queueRequest(queuedRequest);
		return id;
	},

	async getQueuedRequests(): Promise<QueuedRequest[]> {
		return await db.getQueuedRequests();
	},

	async flushQueue(): Promise<
		Array<{
			id: number;
			status: string;
			response?: unknown;
			retryCount?: number;
			error?: string;
		}>
	> {
		if (!store.getOnline()) {
			return [];
		}

		let queue = await this.getQueuedRequests();
		if (!queue.length) {
			return [];
		}

		await this._ensureValidCsrfToken();

		const results: Array<{
			id: number;
			status: string;
			response?: unknown;
			retryCount?: number;
			error?: string;
		}> = [];
		let i = 0;

		while (i < queue.length) {
			const requestItem = queue[i];
			try {
				const response = await this._executeRequest(requestItem);

				if (requestItem.localId && requestItem.method === 'POST') {
					if (requestItem.endpoint === '/notes') {
						const resp = response as {
							id: string | number;
							ID?: string | number;
							title?: string;
							updated_at?: string;
							updatedAt?: string;
						};
						await this._commitLocalNoteId(requestItem.localId, resp);
						queue = await this._updateQueueArray(
							queue,
							requestItem.localId,
							String(resp.id || resp.ID),
						);
					} else if (
						requestItem.endpoint.includes('/blocks') &&
						!requestItem.type
					) {
						const resp = response as {
							id: string | number;
							block_id?: string | number;
						};
						const noteId = (requestItem.body as { note_id?: string | number })?.note_id;
						await this._commitLocalBlockId(requestItem.localId, resp, noteId);
						const newId = resp.id || resp.block_id;
						if (newId) {
							queue = await this._updateQueueArrayForBlock(
								queue,
								requestItem.localId,
								String(newId),
							);
						}
					} else if (requestItem.type === 'IMAGE_UPLOAD') {
						await this._commitLocalImageId(
							requestItem.localId,
							response as AttachmentApiResponse,
						);
					} else if (requestItem.type === 'AUDIO_UPLOAD') {
						await this._commitLocalAudioId(
							requestItem.localId,
							response as AttachmentApiResponse,
						);
					} else if (requestItem.type === 'VIDEO_UPLOAD') {
						await this._commitLocalVideoId(
							requestItem.localId,
							response as AttachmentApiResponse,
						);
					} else if (requestItem.type === 'SUBNOTE_CREATE') {
						const resp = response as {
							id: string | number;
							title?: string;
							updated_at?: string;
						};
						await this._commitLocalSubnoteId(
							requestItem.localId, 
							resp,
						);
						queue = await this._updateQueueArray(
							queue,
							requestItem.localId,
							String(resp.id),
						);
					}
				}

				if (requestItem.id) {
					await db.deleteQueuedRequest(requestItem.id);
				}
				results.push({ id: requestItem.id!, status: 'synced', response });
			} catch (error) {
				const err = error as Error & { status?: number };
				const retryCount = requestItem.retryCount;

				if (retryCount < 3) {
					const updatedRequest = { ...requestItem, retryCount: retryCount + 1 };
					await db.queueRequest(updatedRequest);
					await db.deleteQueuedRequest(requestItem.id!);
					results.push({
						id: requestItem.id!,
						status: 'retry',
						retryCount: retryCount + 1,
					});
				} else {
					if (requestItem.id) {
						await db.deleteQueuedRequest(requestItem.id);
					}
					results.push({
						id: requestItem.id!,
						status: 'failed',
						error: err.message,
					});
				}

				const isOnline = navigator.onLine;
				const isServerError = err.status && err.status >= 500;
				if (!isOnline || isServerError) {
					break;
				}
			}
			i++;
		}
		return results;
	},

	async _updateQueueArray(
		queue: QueuedRequest[],
		oldNoteId: string,
		newNoteId: string,
	): Promise<QueuedRequest[]> {
		const allNotes = await db.notesGetAll();
		for (const note of allNotes) {
			let noteUpdated = false;
			const updatedBlocks = (note.blocks || []).map(block => {
				if (block.block_type_id === 5) {
					let blockUpdated = false;
					const newBlock = { ...block };
					if (block.content === String(oldNoteId)) {
						newBlock.content = String(newNoteId);
						blockUpdated = true;
					}
					if (block.subnote_id === oldNoteId) {
						newBlock.subnote_id = newNoteId;
						blockUpdated = true;
					}
					
					if (blockUpdated) {
						noteUpdated = true;
						return newBlock;
					}
				}
				return block;
			});
			
			if (noteUpdated) {
				const updatedNote = { ...note, blocks: updatedBlocks };
				await db.notesPut(updatedNote);
				const storeNotes = store.getNotes();
				const updatedStoreNotes = storeNotes.map(n =>
					n.ID === note.ID ? updatedNote : n
				);
				store.setNotesSilently(updatedStoreNotes);
				if (store.getActiveNoteId() === note.ID) {
					store.setActiveBlocks(updatedBlocks);
				}
			}
		}
		const updatedQueue: QueuedRequest[] = [];
		for (const req of queue) {
			let newEndpoint = req.endpoint;
			let newBody = req.body;
			let needUpdate = false;
			
			if (req.endpoint && req.endpoint.includes(oldNoteId)) {
				newEndpoint = req.endpoint.replace(
					new RegExp(oldNoteId, 'g'),
					newNoteId,
				);
				needUpdate = true;
			}
			
			if (req.body) {
				const body = req.body as Record<string, unknown>;
				let bodyChanged = false;
				let updatedBody = { ...body };
				
				if (body.note_id === oldNoteId) {
					updatedBody.note_id = newNoteId;
					bodyChanged = true;
				}
				
				if (body.noteId === oldNoteId) {
					updatedBody.noteId = newNoteId;
					bodyChanged = true;
				}
				
				if (body.parent_id === oldNoteId) {
					updatedBody.parent_id = newNoteId;
					bodyChanged = true;
				}
				
				if (body.content === oldNoteId) {
					updatedBody.content = String(newNoteId);
					bodyChanged = true;
				}
				
				if (body.subnote_id === oldNoteId) {
					updatedBody.subnote_id = newNoteId;
					bodyChanged = true;
				}
				
				if (bodyChanged) {
					newBody = updatedBody;
					needUpdate = true;
				}
			}
			
			let newLocalId = req.localId;
			if (req.localId === oldNoteId) {
				newLocalId = newNoteId;
				needUpdate = true;
			}
			
			if (needUpdate) {
				updatedQueue.push({ 
					...req, 
					endpoint: newEndpoint, 
					body: newBody,
					localId: newLocalId
				});
			} else {
				updatedQueue.push(req);
			}
		}
		
		return updatedQueue;
	},

	async _updateQueueArrayForBlock(
		queue: QueuedRequest[],
		oldBlockId: string,
		newBlockId: string,
	): Promise<QueuedRequest[]> {
		const updatedQueue: QueuedRequest[] = [];
		for (const req of queue) {
			let newEndpoint = req.endpoint;
			let newBody = req.body;
			let needUpdate = false;
			if (req.endpoint && req.endpoint.includes(oldBlockId)) {
				newEndpoint = req.endpoint.replace(
					new RegExp(oldBlockId, 'g'),
					newBlockId,
				);
				needUpdate = true;
			}
			if (req.body) {
				const body = req.body as Record<string, unknown>;
				if (body.blockId === oldBlockId) {
					newBody = { ...body, blockId: newBlockId };
					needUpdate = true;
				}
				if (body.block_id === oldBlockId) {
					newBody = { ...body, block_id: newBlockId };
					needUpdate = true;
				}
			}
			if (needUpdate) {
				updatedQueue.push({ ...req, endpoint: newEndpoint, body: newBody });
			} else {
				updatedQueue.push(req);
			}
		}
		console.log(updatedQueue);
		return updatedQueue;
	},

	async _executeRequest(requestItem: QueuedRequest): Promise<unknown> {
		const { method, endpoint, body, formData, type } = requestItem;

		if (type === 'IMAGE_UPLOAD' || type === 'AUDIO_UPLOAD' || type === 'VIDEO_UPLOAD') {
			const fileId = (body as { fileId?: string })?.fileId;
			if (!fileId) {
				throw new Error('No fileId');
			}

			const fileData = await db.queueFileGet(fileId);
			if (!fileData || !fileData.blob) {
				throw new Error('File not found in queueFiles: ' + fileId);
			}

			const formDataObj = new FormData();
			const file = new File([fileData.blob], fileData.filename, {
				type: fileData.mimeType,
			});
			formDataObj.append('file', file);

			return await client.postForm(endpoint, formDataObj);
		}

		switch (method) {
			case 'PUT':
				if (endpoint.includes('/formatting')) {
					const response = await client.put(
						endpoint,
						body as Record<string, unknown>,
					);
					const blockId = endpoint.split('/').slice(-2)[0];
					await db.formattingMarkSynced(blockId);
					return response;
				}
				return await client.put(endpoint, body as Record<string, unknown>);

			case 'PATCH':
				return await client.patch(endpoint, body as Record<string, unknown>);

			case 'DELETE':
				return await client.delete(endpoint);

			case 'POST':
				if (formData) {
					return await client.postForm(endpoint, formData);
				}
				return await client.post(endpoint, body as Record<string, unknown>);

			default:
				throw new Error(`Unknown method: ${method}`);
		}
	},

	async _commitLocalNoteId(
		localId: string,
		serverData: {
			id: string | number;
			ID?: string | number;
			title?: string;
			updated_at?: string;
			updatedAt?: string;
		},
	): Promise<void> {
		const localNote = await db.notesGet(localId);
		if (!localNote) {
			console.warn('[Queue] Local note not found:', localId);
			return;
		}

		const newNoteId = serverData.id || serverData.ID;
		if (!newNoteId) {
			console.warn('[Queue] No new note id provided');
			return;
		}

		const childNotes = await db.notesGetByParentId(localId);
		for (const childNote of childNotes) {
			const updatedChild = { ...childNote, parent_id: newNoteId };
			await db.notesDelete(childNote.ID);
			await db.notesPut(updatedChild);
			const storeNotes = store.getNotes();
			const updatedStoreNotes = storeNotes.map(n =>
				n.ID === childNote.ID ? updatedChild : n
			);
			store.setNotes(updatedStoreNotes);
		}

		const images = await db.imagesGetByNoteId(localId);
		for (const img of images) {
			await db.imagesDelete(img.id);
			await db.imagesPut({
				...img,
				noteId: newNoteId,
			});
		}

		const audios = await db.audiosGetByNoteId(localId);
		for (const audio of audios) {
			await db.audiosDelete(audio.id);
			await db.audiosPut({
				...audio,
				noteId: newNoteId,
			});
		}

		const videos = await db.videosGetByNoteId(localId);
		for (const video of videos) {
			await db.videosDelete(video.id);
			await db.videosPut({
				...video,
				noteId: newNoteId,
			});
		}

		const queueFiles = await db.queueFileGetByNoteId(localId);
		for (const file of queueFiles) {
			await db.queueFileDelete(file.id);
			await db.queueFilePut({
				...file,
				noteId: newNoteId,
			});
		}

		const updatedBlocks = (localNote.blocks || []).map((block) => ({
			...block,
			note_id: newNoteId,
		}));

		const newNote: Note = {
			...localNote,
			ID: newNoteId,
			title: localNote.title,
			updatedAt:
				serverData.updated_at ?? serverData.updatedAt ?? localNote.updatedAt,
			icon: localNote.icon || null,
			blocks: updatedBlocks,
			isLocal: false,
		};

		await db.notesDelete(localId);
		await db.notesPut(newNote);
		await db.settingsSet('activeNoteId', newNoteId);
		const allNotes = store.getNotes();
		const updatedAllNotes = allNotes.map(note => 
			note.ID === localId ? newNote : note
		);
		store.setNotes(updatedAllNotes);

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
			store.setActiveBlocks(updatedBlocks);
		}

		const pendingRequests = await db.getQueuedRequests();
		for (const req of pendingRequests) {
			let needUpdate = false;
			let newEndpoint = req.endpoint;
			let newBody = req.body;

			if (req.endpoint && req.endpoint.includes(String(localId))) {
				newEndpoint = req.endpoint.replace(
					new RegExp(String(localId), 'g'),
					String(newNoteId),
				);
				needUpdate = true;
			}

			if (req.body) {
				const body = req.body as Record<string, unknown>;
				if (body.note_id === localId) {
					newBody = { ...body, note_id: newNoteId };
					needUpdate = true;
				}
				if (body.noteId === localId) {
					newBody = { ...body, noteId: newNoteId };
					needUpdate = true;
				}
			}

			if (needUpdate && req.id) {
				await db.deleteQueuedRequest(req.id);
				await db.queueRequest({
					...req,
					endpoint: newEndpoint,
					body: newBody,
					queuedAt: Date.now(),
				});
			}
		}
	},

	async _commitLocalBlockId(
		localId: string,
		serverData: ServerResponseWithId,
		noteId?: string | number,
	): Promise<void> {
		const newBlockId = serverData.id || serverData.block_id;
		if (!newBlockId) {
			console.warn('[Queue] No new block id provided');
			return;
		}

		try {
			const imagesToUpdate = await db.imagesGetByBlockId(localId);
			for (const image of imagesToUpdate) {
				await db.imagesDelete(image.id);
				await db.imagesPut({ ...image, id: image.id, blockId: newBlockId });
			}
		} catch (error) {
			console.warn('[Queue] Failed to update images for block:', error);
		}

		try {
			const audiosToUpdate = await db.audiosGetByBlockId(localId);
			for (const audio of audiosToUpdate) {
				await db.audiosDelete(audio.id);
				await db.audiosPut({ ...audio, id: audio.id, blockId: newBlockId });
			}
		} catch (error) {
			console.warn('[Queue] Failed to update audios for block:', error);
		}

		try {
			const videosToUpdate = await db.videosGetByBlockId(localId);
			for (const video of videosToUpdate) {
				await db.videosDelete(video.id);
				await db.videosPut({ ...video, id: video.id, blockId: newBlockId });
			}
		} catch (error) {
			console.warn('[Queue] Failed to update videos for block:', error);
		}

		if (noteId) {
			const note = await db.notesGet(noteId);
			if (note && note.blocks) {
				const blockIndex = note.blocks.findIndex(b => String(b.id) === localId);
				if (blockIndex !== -1) {
					const updatedBlocks = [...note.blocks];
					updatedBlocks[blockIndex] = {
						...updatedBlocks[blockIndex],
						id: newBlockId,
						isLocal: false,
					};
					const updatedNote = { ...note, blocks: updatedBlocks };
					await db.notesPut(updatedNote);
					const storeNotes = store.getNotes();
					const updatedStoreNotes = storeNotes.map(n =>
						n.ID === noteId ? updatedNote : n
					);
					store.setNotes(updatedStoreNotes);
					if (store.getActiveNoteId() === noteId) {
						const activeBlocks = store.getActiveBlocks().map(b =>
							String(b.id) === localId ? { ...b, id: newBlockId, isLocal: false } : b
						);
						store.setActiveBlocks(activeBlocks);
					}
				}
			}
		}
	},

	async _commitLocalImageId(
		localId: string,
		serverData: AttachmentApiResponse,
	): Promise<void> {
		let image = await db.imagesGet(localId);
		if (!image) {
			const imagesByUrl = await db.imagesGetByUrl(`local://${localId}`);
			image = imagesByUrl[0];
		}
		if (!image) {
			console.warn('[Queue] Image not found for localId:', localId);
			return;
		}

		const newImageId = serverData.id;
		const newImageUrl = serverData.attach_url.replace(
			'http://minio:9000',
			'/minio',
		);

		const updatedImage = {
			...image,
			id: newImageId,
			url: newImageUrl,
			status: 'synced' as const,
			syncedAt: Date.now(),
		};

		await db.imagesDelete(localId);
		await db.imagesPut(updatedImage);
		await db.queueFileDelete(localId);

		const newImageContent = JSON.stringify({
			url: newImageUrl,
			filename: serverData.minio_key || image.filename,
			size: image.size,
			mimeType: image.mimeType,
			attachmentId: newImageId,
		});

		const noteId = image.noteId;
		const blockId = image.blockId;

		try {
			await client.put(`/notes/${noteId}/blocks/${blockId}/content`, {
				content: newImageContent,
			});

			const cachedNote = await db.notesGet(noteId);
			if (cachedNote && cachedNote.blocks) {
				const updatedBlocks = cachedNote.blocks.map((b) =>
					String(b.id) === String(blockId)
						? { ...b, content: newImageContent }
						: b,
				);
				await db.notesPut({ ...cachedNote, blocks: updatedBlocks });
			}

			const blocks = store.getActiveBlocks();
			const updatedBlocks = blocks.map((b) =>
				String(b.id) === String(blockId)
					? { ...b, content: newImageContent }
					: b,
			);
			store.setActiveBlocksSilently(updatedBlocks);
		} catch (error) {
			console.error('[Queue] Failed to update block content:', error);
			throw error;
		}
	},

	async _commitLocalAudioId(
		localId: string,
		serverData: AttachmentApiResponse,
	): Promise<void> {
		let audio = await db.audiosGet(localId);
		if (!audio) {
			const audiosByUrl = await db.audiosGetByUrl(`local://${localId}`);
			audio = audiosByUrl[0];
		}
		if (!audio) {
			console.warn('[Queue] Audio not found for localId:', localId);
			return;
		}

		const newAudioId = serverData.id;
		const newAudioUrl = serverData.attach_url.replace(
			'http://minio:9000',
			'/minio',
		);

		const updatedAudio = {
			...audio,
			id: newAudioId,
			url: newAudioUrl,
			status: 'synced' as const,
			syncedAt: Date.now(),
		};

		await db.audiosDelete(localId);
		await db.audiosPut(updatedAudio);
		await db.queueFileDelete(localId);

		const newAudioContent = JSON.stringify({
			url: newAudioUrl,
			filename: serverData.minio_key || audio.filename,
			size: audio.size,
			mimeType: audio.mimeType,
			attachmentId: newAudioId,
		});

		const noteId = audio.noteId;
		const blockId = audio.blockId;

		try {
			await client.put(`/notes/${noteId}/blocks/${blockId}/content`, {
				content: newAudioContent,
			});

			const cachedNote = await db.notesGet(noteId);
			if (cachedNote && cachedNote.blocks) {
				const updatedBlocks = cachedNote.blocks.map((b) =>
					String(b.id) === String(blockId)
						? { ...b, content: newAudioContent }
						: b,
				);
				await db.notesPut({ ...cachedNote, blocks: updatedBlocks });
			}

			const blocks = store.getActiveBlocks();
			const updatedBlocks = blocks.map((b) =>
				String(b.id) === String(blockId)
					? { ...b, content: newAudioContent }
					: b,
			);
			store.setActiveBlocksSilently(updatedBlocks);
		} catch (error) {
			console.error('[Queue] Failed to update block content:', error);
			throw error;
		}
	},

	async _commitLocalVideoId(
		localId: string,
		serverData: AttachmentApiResponse,
	): Promise<void> {
		let video = await db.videosGet(localId);
		if (!video) {
			const videosByUrl = await db.videosGetByUrl(`local://${localId}`);
			video = videosByUrl[0];
		}
		if (!video) {
			console.warn('[Queue] Video not found for localId:', localId);
			return;
		}

		const newVideoId = serverData.id;
		const newVideoUrl = serverData.attach_url.replace(
			'http://minio:9000',
			'/minio',
		);

		const updatedVideo = {
			...video,
			id: newVideoId,
			url: newVideoUrl,
			status: 'synced' as const,
			syncedAt: Date.now(),
		};

		await db.videosDelete(localId);
		await db.videosPut(updatedVideo);
		await db.queueFileDelete(localId);

		const newVideoContent = JSON.stringify({
			url: newVideoUrl,
			filename: serverData.minio_key || video.filename,
			size: video.size,
			mimeType: video.mimeType,
			attachmentId: newVideoId,
		});

		const noteId = video.noteId;
		const blockId = video.blockId;

		try {
			await client.put(`/notes/${noteId}/blocks/${blockId}/content`, {
				content: newVideoContent,
			});

			const cachedNote = await db.notesGet(noteId);
			if (cachedNote && cachedNote.blocks) {
				const updatedBlocks = cachedNote.blocks.map((b) =>
					String(b.id) === String(blockId)
						? { ...b, content: newVideoContent }
						: b,
				);
				await db.notesPut({ ...cachedNote, blocks: updatedBlocks });
			}

			const blocks = store.getActiveBlocks();
			const updatedBlocks = blocks.map((b) =>
				String(b.id) === String(blockId)
					? { ...b, content: newVideoContent }
					: b,
			);
			store.setActiveBlocksSilently(updatedBlocks);
		} catch (error) {
			console.error('[Queue] Failed to update block content:', error);
			throw error;
		}
	},

	async _commitLocalSubnoteId(
		localId: string,
		serverData: { id: string | number; title?: string; updated_at?: string },
	): Promise<void> {
		await this._commitLocalNoteId(localId, serverData);
		const newSubnoteId = serverData.id;
		if (!newSubnoteId) return;
		const pendingRequests = await db.getQueuedRequests();
		for (const req of pendingRequests) {
			let needUpdate = false;
			let newBody = req.body;
			if (req.body) {
				const body = req.body as Record<string, unknown>;
				if ((body.content === localId || body.subnote_id === localId) && 
					req.endpoint?.includes('/blocks')) {
					newBody = { ...body, content: String(newSubnoteId), subnote_id: newSubnoteId };
					needUpdate = true;
				}
			}
			if (needUpdate && req.id) {
				await db.deleteQueuedRequest(req.id);
				await db.queueRequest({
					...req,
					body: newBody,
					queuedAt: Date.now(),
				});
			}
		}
	},

	async clearQueue(): Promise<void> {
		await db.clearQueuedRequests();
	},

	async getQueueStats(): Promise<{
		total: number;
		byType: Record<string, number>;
		oldest: number | null;
	}> {
		const requests = await this.getQueuedRequests();
		return {
			total: requests.length,
			byType: requests.reduce((acc: Record<string, number>, r) => {
				const type = r.type || 'unknown';
				acc[type] = (acc[type] || 0) + 1;
				return acc;
			}, {}),
			oldest:
				requests.length > 0
					? Math.min(...requests.map((r) => r.queuedAt))
					: null,
		};
	},

	async _ensureValidCsrfToken(): Promise<void> {
		try {
			await client.fetchCsrfToken();
		} catch (error) {
			console.warn('[Queue] Failed to refresh CSRF token:', error);
		}
	},
};
