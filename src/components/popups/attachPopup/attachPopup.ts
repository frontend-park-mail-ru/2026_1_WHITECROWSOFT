import { attachmentService } from '../../../services/attachmentService.js';
import { noteService } from '../../../services/noteService.js';
import { subnoteService } from '../../../services/subnoteService.js';
import { store } from '../../../store.js';
import { Block } from '../../../types.js';
import { getElementPosition } from '../../../utils/utils.js';
import Component from '../../component.js';
import templateString from './attachPopup.hbs?raw';

interface AttachPopupOptions {
	anchorElement: HTMLElement;
	afterBlockId: string | null;
	onBlockCreated?: (block: Block) => void;
}

type FileType = 'image' | 'audio' | null;

export default class AttachPopup extends Component {
	protected templateString = templateString;

	private anchorElement: HTMLElement;
	private afterBlockId: string | null;
	private fileInput: HTMLInputElement | null = null;
	private pendingFileType: FileType = null;

	private boundHandlers: {
		onDocumentClick?: (e: MouseEvent) => void;
		onEscape?: (e: KeyboardEvent) => void;
		onTextClick?: () => void;
		onPictureClick?: () => void;
		onMusicClick?: () => void;
		onTableClick?: () => void;
		onSubnoteClick?: () => void;
		onFileChange?: (e: Event) => void;
	} = {};

	constructor(options: AttachPopupOptions) {
		super();
		this.anchorElement = options.anchorElement;
		this.afterBlockId = options.afterBlockId;
	}

	protected getTemplateData() {
		return {};
	}

	renderTo(container: HTMLElement | null): void {
		if (!container) return;
		const temp = document.createElement('div');
		temp.innerHTML = this.render();
		const popupElement = temp.firstChild as HTMLElement;
		if (popupElement) {
			this.domElement = popupElement;
			container.appendChild(popupElement);
			this.onRender();
		}
	}

	open(): void {
		this.close();
		this.fileInput = document.createElement('input');
		this.fileInput.type = 'file';
		this.fileInput.style.display = 'none';
		this.pendingFileType = null;
		this.renderTo(document.body);
	}

	onRender(): void {
		if (this.fileInput && this.domElement) {
			this.domElement.appendChild(this.fileInput);
		}
		this.position();
		this.bindGlobalCloseHandlers();
		this.bindPopupEvents();
		this.domElement?.dispatchEvent(
			new CustomEvent('popup:opened', {
				detail: { afterBlockId: this.afterBlockId },
			}),
		);
	}

	private position(): void {
		if (!this.anchorElement || !this.domElement) return;
		const rect = getElementPosition(this.anchorElement);
		const popupRect = this.domElement.getBoundingClientRect();
		const top = rect.bottom + window.scrollY + 5;
		let left = rect.left + window.scrollX;
		if (left + popupRect.width > window.innerWidth) {
			left = window.innerWidth - popupRect.width - 10;
		}
		this.domElement.style.top = `${top}px`;
		this.domElement.style.left = `${left}px`;
		this.domElement.style.zIndex = '30';
		this.domElement.style.position = 'fixed';
	}

	private bindGlobalCloseHandlers(): void {
		this.boundHandlers.onDocumentClick = (e: MouseEvent) => {
			if (!this.domElement?.contains(e.target as Node)) {
				this.close();
			}
		};
		this.boundHandlers.onEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				this.close();
			}
		};
		document.addEventListener('click', this.boundHandlers.onDocumentClick);
		document.addEventListener('keydown', this.boundHandlers.onEscape);
	}

	private unbindGlobalCloseHandlers(): void {
		if (this.boundHandlers.onDocumentClick) {
			document.removeEventListener('click', this.boundHandlers.onDocumentClick);
		}
		if (this.boundHandlers.onEscape) {
			document.removeEventListener('keydown', this.boundHandlers.onEscape);
		}
	}

	private bindPopupEvents(): void {
		if (!this.domElement) return;
		const textBtn = this.domElement.querySelector('[data-action="text"]');
		const pictureBtn = this.domElement.querySelector('[data-action="picture"]');
		const tableBtn = this.domElement.querySelector('[data-action="table"]');
		const subnoteBtn = this.domElement.querySelector('[data-action="subnote"]');
		const musicBtn = this.domElement.querySelector('[data-action="music"]');

		if (textBtn) {
			this.boundHandlers.onTextClick = async () => {
				const activeNoteId = store.getActiveNoteId();
				if (activeNoteId) {
					await noteService.createBlockAfter(
						activeNoteId,
						{
							note_id: activeNoteId,
							block_type_id: 1,
							content: '',
						},
						this.afterBlockId,
					);
				}
				this.close();
			};
			textBtn.addEventListener('click', this.boundHandlers.onTextClick);
		}

		if (pictureBtn) {
			this.boundHandlers.onPictureClick = () => {
				this.pendingFileType = 'image';
				if (this.fileInput) {
					this.fileInput.accept = 'image/*';
					this.fileInput.click();
				}
			};
			pictureBtn.addEventListener('click', this.boundHandlers.onPictureClick);
		}

		if (musicBtn) {
			this.boundHandlers.onMusicClick = () => {
				this.pendingFileType = 'audio';
				if (this.fileInput) {
					this.fileInput.accept = 'audio/*';
					this.fileInput.click();
				}
			};
			musicBtn.addEventListener('click', this.boundHandlers.onMusicClick);
		}

		if (tableBtn) {
			this.boundHandlers.onTableClick = () => {
				console.log('Add table block');
				this.close();
			};
			tableBtn.addEventListener('click', this.boundHandlers.onTableClick);
		}

		if (this.fileInput) {
			this.boundHandlers.onFileChange = async (e: Event) => {
				const target = e.target as HTMLInputElement;
				const file = target.files?.[0];
				if (!file) {
					this.close();
					return;
				}

				const activeNoteId = store.getActiveNoteId();
				if (!activeNoteId) {
					this.close();
					return;
				}

				if (file.size > 10 * 1024 * 1024) {
					console.warn('File too large (max 10MB)');
					this.close();
					return;
				}

				try {
					if (
						this.pendingFileType === 'image' &&
						file.type.startsWith('image/')
					) {
						await attachmentService.createImageBlock(
							activeNoteId,
							file,
							this.afterBlockId,
						);
					} else if (
						this.pendingFileType === 'audio' &&
						file.type.startsWith('audio/')
					) {
						await attachmentService.createAudioBlock(
							activeNoteId,
							file,
							this.afterBlockId,
						);
					} else {
						console.warn(
							`Unsupported file type for ${this.pendingFileType}:`,
							file.type,
						);
					}
				} catch (error) {
					console.error('[AttachPopup] Error:', error);
				}

				if (this.fileInput) {
					this.fileInput.value = '';
				}
				this.close();
			};
			this.fileInput.addEventListener(
				'change',
				this.boundHandlers.onFileChange,
			);
		}

		if (subnoteBtn) {
			this.boundHandlers.onSubnoteClick = async () => {
				const activeNoteId = store.getActiveNoteId();
				if (!activeNoteId) {
					console.error('No active note id');
					this.close();
					return;
				}
				try {
					const newSubnote = await subnoteService.createSubnote(activeNoteId, {
						title: 'Новая подзаметка',
						parent_id: activeNoteId,
					});
					if (!newSubnote || !newSubnote.ID) {
						throw new Error('Failed to create subnote');
					}
					await subnoteService.createSubnoteBlock(
						activeNoteId,
						newSubnote.ID,
						newSubnote.title,
						this.afterBlockId,
					);
				} catch (error) {
					console.error('Error creating subnote:', error);
				}
				this.close();
			};
			subnoteBtn.addEventListener('click', this.boundHandlers.onSubnoteClick);
		}
	}

	private unbindPopupEvents(): void {
		if (!this.domElement) return;
		const textBtn = this.domElement.querySelector('[data-action="text"]');
		const pictureBtn = this.domElement.querySelector('[data-action="picture"]');
		const tableBtn = this.domElement.querySelector('[data-action="table"]');
		const subnoteBtn = this.domElement.querySelector('[data-action="subnote"]');
		const musicBtn = this.domElement.querySelector('[data-action="music"]');

		if (textBtn && this.boundHandlers.onTextClick) {
			textBtn.removeEventListener('click', this.boundHandlers.onTextClick);
		}
		if (pictureBtn && this.boundHandlers.onPictureClick) {
			pictureBtn.removeEventListener(
				'click',
				this.boundHandlers.onPictureClick,
			);
		}
		if (musicBtn && this.boundHandlers.onMusicClick) {
			musicBtn.removeEventListener('click', this.boundHandlers.onMusicClick);
		}
		if (tableBtn && this.boundHandlers.onTableClick) {
			tableBtn.removeEventListener('click', this.boundHandlers.onTableClick);
		}
		if (subnoteBtn && this.boundHandlers.onSubnoteClick) {
			subnoteBtn.removeEventListener(
				'click',
				this.boundHandlers.onSubnoteClick,
			);
		}
		if (this.fileInput && this.boundHandlers.onFileChange) {
			this.fileInput.removeEventListener(
				'change',
				this.boundHandlers.onFileChange,
			);
		}
	}

	close(): void {
		if (!this.domElement) return;
		this.unbindGlobalCloseHandlers();
		this.unbindPopupEvents();
		this.domElement.dispatchEvent(new CustomEvent('popup:closing'));
		this.domElement.remove();
		this.domElement = null;
		if (this.fileInput) {
			this.fileInput.remove();
			this.fileInput = null;
		}
		this.pendingFileType = null;
	}

	getElement(): HTMLElement | null {
		return this.domElement;
	}

	destroy(): void {
		this.close();
	}
}
