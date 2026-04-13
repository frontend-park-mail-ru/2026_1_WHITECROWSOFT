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
			queuedAt: Date.now(),
			retryCount: 0,
		};

		const id = await db.queueRequest(queuedRequest);
		console.log(
			'[Queue] Enqueued:',
			request.type || request.method,
			request.endpoint,
		);
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
						await this._commitLocalBlockId(requestItem.localId, resp);
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
					// Обновляем retryCount в базе
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
				if (body.note_id === oldNoteId) {
					newBody = { ...body, note_id: newNoteId };
					needUpdate = true;
				}
				if (body.noteId === oldNoteId) {
					newBody = { ...body, noteId: newNoteId };
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
		return updatedQueue;
	},

	async _executeRequest(requestItem: QueuedRequest): Promise<unknown> {
		const { method, endpoint, body, formData, type } = requestItem;

		if (type === 'IMAGE_UPLOAD') {
			const fileId = (body as { fileId?: string })?.fileId;
			if (!fileId) {
				throw new Error('No fileId for IMAGE_UPLOAD');
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
				return await (client as any).patch(
					endpoint,
					body as Record<string, unknown>,
				);

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

		const newNote: Note = {
			...localNote,
			ID: newNoteId,
			title: serverData.title ?? localNote.title,
			updatedAt:
				serverData.updated_at ?? serverData.updatedAt ?? localNote.updatedAt,
			icon: localNote.icon || null,
		};

		await db.notesDelete(localId);
		await db.notesPut(newNote);

		const notes = store
			.getNotes()
			.map((note) => (note.ID === localId ? newNote : note));
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

	async _commitLocalBlockId(
		localId: string,
		serverData: ServerResponseWithId,
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
		const updatedActiveBlocks = activeBlocks.map((block) =>
			block.id === localId ? { ...block, id: newBlockId } : block,
		);
		store.setActiveBlocks(updatedActiveBlocks);

		let foundNoteId: string | number | null = null;

		const activeNoteId = store.getActiveNoteId();
		if (activeNoteId) {
			const activeNote = await db.notesGet(activeNoteId);
			if (
				activeNote &&
				activeNote.blocks &&
				activeNote.blocks.some((b) => b.id === localId)
			) {
				foundNoteId = activeNoteId;
				const updatedBlocks = activeNote.blocks.map((block) =>
					block.id === localId ? { ...block, id: newBlockId } : block,
				);
				await db.notesPut({ ...activeNote, blocks: updatedBlocks });
			}
		}

		if (!foundNoteId) {
			const allNotes = await db.notesGetAll();
			for (const note of allNotes) {
				if (note.blocks && note.blocks.some((b) => b.id === localId)) {
					foundNoteId = note.ID;
					const updatedBlocks = note.blocks.map((block) =>
						block.id === localId ? { ...block, id: newBlockId } : block,
					);
					await db.notesPut({ ...note, blocks: updatedBlocks });
					break;
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
		const newImageUrl = serverData.attach_url;

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
		try {
			const response = await client.put(
				`/notes/${image.noteId}/blocks/${image.blockId}/content`,
				{
					content: newImageContent,
				},
			);
			console.log(
				'[Queue] Block content updated on server, response:',
				response,
			);

			const cachedNote = await db.notesGet(image.noteId);
			if (cachedNote && cachedNote.blocks) {
				const updatedBlocks = cachedNote.blocks.map((b) =>
					b.id === image.blockId ? { ...b, content: newImageContent } : b,
				);
				await db.notesPut({ ...cachedNote, blocks: updatedBlocks });
			}
			const blocks = store.getActiveBlocks();
			const updatedBlocks = blocks.map((b) =>
				b.id === image.blockId ? { ...b, content: newImageContent } : b,
			);
			store.setActiveBlocks(updatedBlocks);
		} catch (error) {
			console.error('[Queue] Failed to update block content:', error);
			throw error;
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
};
