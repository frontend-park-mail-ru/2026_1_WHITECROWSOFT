import { attachmentService } from '../../../services/attachmentService.js';
import { store } from '../../../store.js';
import type { Block } from '../../../types.js';
import Component from '../../component.js';
import templateString from './musicBlock.hbs?raw';
import './musicBlock.scss';

interface MusicBlockOptions {
	block: Block;
	onDelete?: (blockId: string) => void;
}

export default class MusicBlock extends Component {
	protected templateString = templateString;

	private block: Block;
	private onDelete?: (blockId: string) => void;
	private audioElement: HTMLAudioElement | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private isPlaying: boolean = false;
	private duration: number = 0;
	private waveformData: number[] = [];

	constructor(options: MusicBlockOptions) {
		super();
		this.block = options.block;
		this.onDelete = options.onDelete;
	}

	protected getTemplateData() {
		let title = 'Аудио';
		let filename = '';
		try {
			if (this.block.content && this.block.content !== '{}') {
				const musicData = JSON.parse(this.block.content) as {
					title?: string;
					filename?: string;
				};
				title = musicData.title || 'Аудио';
				filename = musicData.filename || '';
			}
		} catch (e) {
			console.warn('Failed to parse music data', e);
		}
		return {
			blockId: this.block.id,
			title: title,
			filename: filename,
		};
	}

	async onRender(): Promise<void> {
		await this.loadMusic();
		this.initCanvas();
		this.bindEvents();
	}

	private initCanvas(): void {
		this.canvas = this.domElement?.querySelector(
			'.note__musicBlock-canvas',
		) as HTMLCanvasElement;
		if (this.canvas) {
			this.canvas.width = 300;
			this.canvas.height = 40;
			this.drawWaveform();
		}
	}

	private drawWaveform(): void {
		if (!this.canvas) return;
		const ctx = this.canvas.getContext('2d');
		if (!ctx) return;

		ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

		if (this.waveformData.length === 0) {
			this.generateWaveformData();
		}

		const barCount = this.waveformData.length;
		const barWidth = 3;
		const barGap = 2;
		const totalWidth = barCount * (barWidth + barGap);
		const startX = (this.canvas.width - totalWidth) / 2;
		const maxBarHeight = this.canvas.height * 0.7;
		const minBarHeight = 4;

		for (let i = 0; i < barCount; i++) {
			const amplitude = this.waveformData[i];
			const height = minBarHeight + amplitude * (maxBarHeight - minBarHeight);
			const x = startX + i * (barWidth + barGap);
			const y = (this.canvas.height - height) / 2;

			ctx.fillStyle = '#e0e0e0';
			ctx.fillRect(x, y, barWidth, height);
		}
	}

	private drawProgress(): void {
		if (!this.canvas || !this.audioElement || !this.duration) return;
		const ctx = this.canvas.getContext('2d');
		if (!ctx) return;

		const barCount = this.waveformData.length;
		const barWidth = 3;
		const barGap = 2;
		const totalWidth = barCount * (barWidth + barGap);
		const startX = (this.canvas.width - totalWidth) / 2;
		const maxBarHeight = this.canvas.height * 0.7;
		const minBarHeight = 4;

		const progress = this.audioElement.currentTime / this.duration;
		const filledBarsCount = Math.floor(barCount * progress);

		for (let i = 0; i < filledBarsCount; i++) {
			const amplitude = this.waveformData[i];
			const height = minBarHeight + amplitude * (maxBarHeight - minBarHeight);
			const x = startX + i * (barWidth + barGap);
			const y = (this.canvas.height - height) / 2;

			const gradient = ctx.createLinearGradient(x, y, x, y + height);
			gradient.addColorStop(0, '#4a90e2');
			gradient.addColorStop(1, '#357abd');
			ctx.fillStyle = gradient;
			ctx.fillRect(x, y, barWidth, height);
		}

		const currentSpan = this.domElement?.querySelector(
			'.note__musicBlock-current',
		);
		if (currentSpan) {
			currentSpan.textContent = this.formatTime(this.audioElement.currentTime);
		}
	}

	private generateWaveformData(): void {
		const barCount = 60;
		this.waveformData = [];

		for (let i = 0; i < barCount; i++) {
			const t = i / barCount;
			let amplitude = 0;

			amplitude += Math.sin(t * Math.PI * 4) * 0.2;
			amplitude += Math.sin(t * Math.PI * 8) * 0.1;
			amplitude += Math.sin(t * Math.PI * 16) * 0.05;

			amplitude = (amplitude + 0.5) / 1.5;
			amplitude = Math.max(0.3, Math.min(0.8, amplitude));
			amplitude = amplitude * (0.8 + Math.random() * 0.4);

			this.waveformData.push(Math.min(0.9, Math.max(0.3, amplitude)));
		}
	}

	private async analyzeAudio(): Promise<void> {
		if (!this.audioElement || !this.audioElement.src) return;

		try {
			const response = await fetch(this.audioElement.src);
			const arrayBuffer = await response.arrayBuffer();
			const audioContext = new AudioContext();
			const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

			const channelData = audioBuffer.getChannelData(0);
			const barCount = 60;
			const samplesPerBar = Math.floor(channelData.length / barCount);

			const rawData: number[] = [];

			for (let i = 0; i < barCount; i++) {
				let sum = 0;
				const start = i * samplesPerBar;
				const end = Math.min(start + samplesPerBar, channelData.length);

				for (let j = start; j < end; j++) {
					sum += Math.abs(channelData[j]);
				}

				let amplitude = sum / samplesPerBar;
				amplitude = Math.min(0.6, amplitude);
				rawData.push(amplitude);
			}

			let maxAmplitude = Math.max(...rawData);
			if (maxAmplitude === 0) maxAmplitude = 1;

			this.waveformData = rawData.map((amp) => {
				let normalized = amp / maxAmplitude;
				normalized = Math.max(0.3, Math.min(0.9, normalized));
				return normalized;
			});

			audioContext.close();
			this.drawWaveform();
		} catch (error) {
			console.warn('Failed to analyze audio:', error);
			this.generateWaveformData();
			this.drawWaveform();
		}
	}

	private async loadMusic(): Promise<void> {
		const audioEl = this.domElement?.querySelector(
			'.note__musicBlock-audio',
		) as HTMLAudioElement;
		if (!audioEl) return;

		try {
			if (
				this.block.content &&
				this.block.content.trim() !== '' &&
				this.block.content !== '{}'
			) {
				const musicData = JSON.parse(this.block.content) as {
					attachmentId: string | number;
					url?: string;
				};
				const attachmentId = musicData.attachmentId;
				const noteId = this.block.note_id || store.getActiveNoteId();

				if (noteId && attachmentId) {
					const audioUrl = await attachmentService.getAudioUrl(
						attachmentId,
						noteId,
						this.block.id,
					);
					if (audioUrl) {
						audioEl.src = audioUrl;
						audioEl.load();

						audioEl.addEventListener('loadedmetadata', () => {
							this.duration = audioEl.duration;
							const durationSpan = this.domElement?.querySelector(
								'.note__musicBlock-duration',
							);
							if (durationSpan) {
								durationSpan.textContent = this.formatTime(this.duration);
							}
							this.analyzeAudio();
						});

						audioEl.addEventListener('timeupdate', () => {
							this.drawProgress();
						});

						audioEl.addEventListener('ended', () => {
							this.isPlaying = false;
							this.updatePlayButton();
							this.drawWaveform();
						});

						return;
					}
				}
			}
			throw new Error('No audio data');
		} catch (e) {
			console.warn('Failed to load audio', e);
			const container = this.domElement?.querySelector(
				'.note__musicBlock-container',
			);
			if (container) {
				container.innerHTML =
					'<div class="note__musicBlock-error">❌ Ошибка загрузки аудио</div>';
			}
		}
	}

	private formatTime(seconds: number): string {
		if (isNaN(seconds)) return '0:00';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	private bindEvents(): void {
		const blockEl = this.domElement;
		if (!blockEl) return;

		const playBtn = blockEl.querySelector('[data-action="play"]');
		const waveform = blockEl.querySelector('[data-action="waveform"]');
		const audioEl = blockEl.querySelector(
			'.note__musicBlock-audio',
		) as HTMLAudioElement;
		this.audioElement = audioEl;

		if (playBtn && audioEl) {
			playBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.togglePlay();
			});
		}

		if (waveform && audioEl) {
			waveform.addEventListener('click', (e) => {
				e.stopPropagation();
				const rect = this.canvas?.getBoundingClientRect();
				if (rect && this.duration) {
					const clickX = (e as MouseEvent).clientX - rect.left;
					const percent = Math.max(0, Math.min(1, clickX / rect.width));
					audioEl.currentTime = this.duration * percent;
					this.drawProgress();
				}
			});
		}

		blockEl.addEventListener('focus', () => {
			this.domElement?.classList.add('note__block-wrapper--focused');
		});

		blockEl.addEventListener('blur', () => {
			this.domElement?.classList.remove('note__block-wrapper--focused');
		});

		blockEl.addEventListener('click', (e) => {
			e.stopPropagation();
			(blockEl as HTMLElement).focus();
		});

		blockEl.addEventListener('keydown', async (e) => {
			const isBackspace = e.key === 'Backspace';
			const isDelete = e.key === 'Delete';
			if (isBackspace || isDelete) {
				e.preventDefault();
				e.stopPropagation();
				this.onDelete?.(String(this.block.id));
			}
		});
	}

	private togglePlay(): void {
		if (!this.audioElement) return;

		if (this.isPlaying) {
			this.audioElement.pause();
		} else {
			this.audioElement.play().catch(console.error);
		}
		this.isPlaying = !this.isPlaying;
		this.updatePlayButton();
	}

	private updatePlayButton(): void {
		const playBtn = this.domElement?.querySelector('[data-action="play"]');
		const img = playBtn?.querySelector('img');
		if (img) {
			img.src = this.isPlaying ? '/icons/pause.svg' : '/icons/play.svg';
		}
	}

	updateBlock(newBlock: Block): void {
		const contentChanged = this.block.content !== newBlock.content;
		this.block = newBlock;
		if (!this.domElement || !contentChanged) {
			return;
		}

		if (this.audioElement) {
			this.audioElement.pause();
			this.isPlaying = false;
			this.updatePlayButton();
		}

		void this.loadMusic();
	}

	focus(): void {
		const blockEl = this.domElement;
		if (blockEl) {
			blockEl.focus();
			if (!blockEl.hasAttribute('tabindex')) {
				blockEl.setAttribute('tabindex', '0');
			}
		}
	}

	getContent(): string {
		return this.block.content || '';
	}

	setCursorAtStart(): void {}
	setCursorAtOffset(): void {}

	destroy(): void {
		if (this.audioElement) {
			this.audioElement.pause();
			this.audioElement.src = '';
		}
		this.audioElement = null;
		this.canvas = null;
	}
}
