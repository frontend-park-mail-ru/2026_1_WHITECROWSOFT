import type { WebSocketMessage } from '../types.js';

type MessageHandler = (message: WebSocketMessage) => void;

/**
 * Сервис для управления WebSocket соединением с сервером
 * Обрабатывает подключение, отправку сообщений и автоматическое переподключение
 */
export class WebSocketService {
	private ws: WebSocket | null = null;
	private url: string;
	private messageHandlers: Set<MessageHandler> = new Set(); // Список обработчиков входящих сообщений
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectDelay = 1000;
	private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;

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

				// Обработчик успешного подключения
				this.ws.onopen = () => {
					this.reconnectAttempts = 0;
					this.setupHeartbeat();
					console.log('[WebSocket] Connected');
					resolve();
				};

				// Обработчик входящих сообщений
				this.ws.onmessage = (event) => {
					try {
						const message: WebSocketMessage = JSON.parse(event.data);
						this.notifyHandlers(message); // Рассылаем всем обработчикам
					} catch (error) {
						console.error('[WebSocket] Failed to parse message:', error);
					}
				};

				// Обработчик ошибок подключения
				this.ws.onerror = (error) => {
					console.error('[WebSocket] Error:', error);
					reject(error);
				};

				// Обработчик закрытия соединения
				this.ws.onclose = () => {
					this.clearHeartbeat(); // Останавливаем heartbeat
					console.log('[WebSocket] Disconnected');
					this.attemptReconnect(noteId); // Пытаемся переподключиться
				};
			} catch (error) {
				reject(error);
			}
		});
	}

	/**
	 * Отключается от WebSocket
	 */
	disconnect(): void {
		this.clearHeartbeat();
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
			isLocal: true, // Помечаем как локальное сообщение
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

		// Возвращаем функцию для отписки
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
			if (this.ws && this.ws.readyState === WebSocket.OPEN) {
				// Отправляем heartbeat каждые 30 секунд
				this.send({
					type: 'heartbeat',
					msg: {},
				});
				this.setupHeartbeat(); // Запускаем следующий heartbeat
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
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			console.error('[WebSocket] Max reconnection attempts reached');
			return;
		}

		this.reconnectAttempts++;
		const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Экспоненциальная задержка

		console.log(
			`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
		);

		setTimeout(() => {
			this.connect(noteId).catch((error) => {
				console.error('[WebSocket] Reconnection failed:', error);
			});
		}, delay);
	}
}

export const wsService = new WebSocketService();
