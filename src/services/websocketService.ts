import type { WebSocketMessage } from '../types.js';
import { handleAuthError } from '../utils/handleAuthError.js';

type MessageHandler = (message: WebSocketMessage) => void;

/**
 * Сервис для управления WebSocket соединением с сервером
 * Обрабатывает подключение, отправку сообщений и автоматическое переподключение
 */
export class WebSocketService {
	private ws: WebSocket | null = null;
	private url: string;
	private messageHandlers: Set<MessageHandler> = new Set();
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectDelay = 1000;
	private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
	private shouldReconnect: boolean = true;

	constructor(baseUrl: string = window.location.origin) {
		this.url = baseUrl;
	}

	/**
	 * Подключается к WebSocket для указанной заметки
	 */
	connect(noteId: string): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
				const wsUrl = `${protocol}//${window.location.host}/ws/notes/${noteId}`;

				this.ws = new WebSocket(wsUrl);
				this.shouldReconnect = true;

				this.ws.onopen = () => {
					this.reconnectAttempts = 0;
					this.setupHeartbeat();
					resolve();
				};

				this.ws.onmessage = (event) => {
					try {
						const message: WebSocketMessage = JSON.parse(event.data);
						this.notifyHandlers(message);
					} catch (error) {
						console.error('[WebSocket] Failed to parse message:', error);
					}
				};

				this.ws.onerror = (error) => {
					console.error('[WebSocket] Connection error', error);
					reject(new Error('WebSocket connection failed'));
				};

				this.ws.onclose = (event) => {
					this.clearHeartbeat();
					if (event.code === 1006) {
						const token = localStorage.getItem('accessToken');
						if (!token) {
							handleAuthError({ status: 401 });
							this.shouldReconnect = false;
							return;
						}
					}

					if (this.shouldReconnect) {
						this.attemptReconnect(noteId);
					}
				};
			} catch (error) {
				console.error('[WebSocket] Connection error:', error);
				reject(error);
			}
		});
	}

	/**
	 * Отключается от WebSocket
	 */
	disconnect(disableReconnect: boolean = true): void {
		this.clearHeartbeat();
		if (disableReconnect) {
			this.shouldReconnect = false;
			this.reconnectAttempts = this.maxReconnectAttempts;
		}
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}

	/**
	 * Отправляет сообщение на сервер
	 */
	send(message: Omit<WebSocketMessage, 'timestamp'>): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			console.error('[WebSocket] Not connected');
			return;
		}

		const fullMessage: WebSocketMessage = {
			...message,
			timestamp: Date.now(),
			is_local: true,
		};

		try {
			this.ws.send(JSON.stringify(fullMessage));
		} catch (error) {
			console.error('[WebSocket] Failed to send message:', error);
		}
	}

	/**
	 * Регистрирует обработчик входящих сообщений
	 */
	onMessage(handler: MessageHandler): () => void {
		this.messageHandlers.add(handler);
		return () => {
			this.messageHandlers.delete(handler);
		};
	}

	/**
	 * Проверяет, подключены ли мы к серверу
	 */
	isConnected(): boolean {
		return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
	}

	/**
	 * Рассылает сообщение всем зарегистрированным обработчикам
	 */
	private notifyHandlers(message: WebSocketMessage): void {
		this.messageHandlers.forEach((handler) => {
			try {
				handler(message);
			} catch (error) {
				console.error('[WebSocket] Error in message handler:', error);
			}
		});
	}

	/**
	 * Запускает heartbeat для поддержания соединения
	 */
	private setupHeartbeat(): void {
		this.clearHeartbeat();
		this.heartbeatTimeout = setTimeout(() => {
			if (
				this.ws &&
				this.ws.readyState === WebSocket.OPEN &&
				this.shouldReconnect
			) {
				this.send({
					type: 'heartbeat',
					msg: {},
				});
				this.setupHeartbeat();
			}
		}, 30000);
	}

	/**
	 * Останавливает heartbeat
	 */
	private clearHeartbeat(): void {
		if (this.heartbeatTimeout) {
			clearTimeout(this.heartbeatTimeout);
			this.heartbeatTimeout = null;
		}
	}

	/**
	 * Пытается переподключиться с экспоненциальной задержкой
	 */
	private attemptReconnect(noteId: string): void {
		if (!this.shouldReconnect) {
			return;
		}

		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			console.error('[WebSocket] Max reconnection attempts reached');
			return;
		}

		this.reconnectAttempts++;
		const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

		setTimeout(() => {
			this.connect(noteId).catch((error) => {
				console.error('[WebSocket] Reconnection failed:', error);
			});
		}, delay);
	}
}

export const wsService = new WebSocketService();
