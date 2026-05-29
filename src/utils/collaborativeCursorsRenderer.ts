import { store } from '../store.js';
import type { CollaborativeUser } from '../types.js';

/**
 * Рендерер курсоров других пользователей
 * Отвечает за визуализацию положения курсора другого участника внутри заметки
 */
export class CollaborativeCursorsRenderer {
	private cursorElements: Map<string, HTMLElement> = new Map();
	private selectionElements: Map<string, HTMLElement> = new Map();
	private container: HTMLElement | null = null;
	private unsubscribeCursors: (() => void) | null = null;

	/**
	 * Инициализирует рендерер курсоров в указанном контейнере
	 * @param container Контейнер с блоками заметки
	 */
	constructor(container: HTMLElement) {
		this.container = container;
		this.setupSubscriptions();
	}

	/**
	 * Настраивает подписки на события курсора и изменения пользователей
	 */
	private setupSubscriptions(): void {
		// Исправлено: событие передает МАССИВ пользователей
		window.addEventListener('collaborativeCursorMove', ((e: CustomEvent) => {
			const users = e.detail as CollaborativeUser[];
			if (Array.isArray(users)) {
				for (const user of users) {
					this.updateUserCursor(user);
				}
			} else {
				// fallback для обратной совместимости
				this.updateUserCursor(e.detail as CollaborativeUser);
			}
		}) as EventListener);

		this.unsubscribeCursors = store.subscribe('collaborativeUsers', (users) => {
			this.syncCursors(users);
		});
	}

	/**
	 * Обновляет позицию и видимость курсора пользователя
	 * Создает элемент курсора при первом появлении пользователя
	 */
	private updateUserCursor(user: CollaborativeUser): void {
		if (!this.container) return;

		// Проверка на наличие cursor и blockId
		if (!user.cursor || !user.cursor.blockId) {
			console.warn(
				'[CollaborativeCursorsRenderer] Invalid user cursor data:',
				user,
			);
			this.removeCursor(user.userId);
			return;
		}

		const blockEl = this.container.querySelector(
			`[data-block-id="${user.cursor.blockId}"] .note__block`,
		) as HTMLElement;

		if (!blockEl) {
			this.removeCursor(user.userId);
			return;
		}

		const startPos = user.cursor.startPosition ?? 0;
		const endPos = user.cursor.endPosition ?? user.cursor.endPosition ?? 0;
		const hasSelection = startPos !== endPos;

		if (hasSelection) {
			// Показываем выделение вместо курсора
			this.updateUserSelection(user, blockEl, startPos, endPos);
			// Скрываем курсор
			const cursorEl = this.cursorElements.get(user.userId);
			if (cursorEl) {
				cursorEl.style.display = 'none';
			}
		} else {
			// Удаляем выделение, если было
			this.removeSelection(user.userId);

			// Показываем курсор
			let cursorEl = this.cursorElements.get(user.userId);

			if (!cursorEl) {
				cursorEl = document.createElement('div');
				cursorEl.className = 'collaborative-cursor';
				cursorEl.dataset.userId = user.userId;
				this.container.appendChild(cursorEl);
				this.cursorElements.set(user.userId, cursorEl);
			}

			const cursorPos = this.getCursorCoordinates(blockEl, endPos);
			if (cursorPos) {
				cursorEl.style.left = cursorPos.x + 'px';
				cursorEl.style.top = cursorPos.y + 'px';
				cursorEl.title = user.userName;
				cursorEl.style.display = 'block';

				// Устанавливаем цвет пользователя
				const color = this.getUserColor(user.userId);
				cursorEl.style.backgroundColor = color;

				// Добавляем или обновляем метку с именем
				let label = cursorEl.querySelector(
					'.collaborative-cursor-label',
				) as HTMLElement;
				if (!label) {
					label = document.createElement('span');
					label.className = 'collaborative-cursor-label';
					cursorEl.appendChild(label);
				}
				label.textContent = user.userName;
				label.style.backgroundColor = color;
			} else {
				cursorEl.style.display = 'none';
			}
		}
	}

	/**
	 * Обновляет выделение текста пользователя
	 */
	private updateUserSelection(
		user: CollaborativeUser,
		blockEl: HTMLElement,
		startPos: number,
		endPos: number,
	): void {
		const selectionId = `collaborative-selection-${user.userId}`;
		let selectionEl = this.selectionElements.get(user.userId);

		if (!selectionEl) {
			selectionEl = document.createElement('div');
			selectionEl.id = selectionId;
			selectionEl.className = 'collaborative-selection';
			selectionEl.style.position = 'absolute';
			selectionEl.style.pointerEvents = 'none';
			selectionEl.style.zIndex = '999';
			if (this.container) this.container.appendChild(selectionEl);
			this.selectionElements.set(user.userId, selectionEl);
		}

		// Получаем координаты для выделения
		const startCoords = this.getCursorCoordinates(blockEl, startPos);
		const endCoords = this.getCursorCoordinates(blockEl, endPos);

		if (startCoords && endCoords) {
			const color = this.getUserColor(user.userId);
			selectionEl.style.backgroundColor = color;
			selectionEl.style.opacity = '0.3';
			selectionEl.style.left = startCoords.x + 'px';
			selectionEl.style.top = startCoords.y + 'px';
			selectionEl.style.width = endCoords.x - startCoords.x + 'px';
			selectionEl.style.height = '20px';
			selectionEl.title = `${user.userName}: selected text`;
			selectionEl.style.display = 'block';
		} else {
			selectionEl.style.display = 'none';
		}
	}

	/**
	 * Удаляет выделение пользователя
	 */
	private removeSelection(userId: string): void {
		const selectionEl = this.selectionElements.get(userId);
		if (selectionEl) {
			selectionEl.remove();
			this.selectionElements.delete(userId);
		}
	}

	/**
	 * Генерирует цвет для пользователя на основе userId
	 */
	private getUserColor(userId: string): string {
		let hash = 0;
		for (let i = 0; i < userId.length; i++) {
			hash = userId.charCodeAt(i) + ((hash << 5) - hash);
		}
		const hue = Math.abs(hash % 360);
		return `hsl(${hue}, 70%, 55%)`;
	}

	/**
	 * Вычисляет координаты курсора внутри блока текста
	 * Возвращает позицию в пикселях относительно контейнера
	 */
	private getCursorCoordinates(
		blockEl: HTMLElement,
		position: number,
	): { x: number; y: number } | null {
		if (position < 0) return null;

		const textContent = blockEl.innerText;
		if (position > textContent.length) position = textContent.length;

		const selection = window.getSelection();
		if (!selection) return null;

		try {
			// Создаем range для вычисления позиции
			const range = document.createRange();

			// Ищем текстовый узел в нужной позиции
			let charCount = 0;
			let targetNode: Node | null = blockEl.firstChild;
			let targetOffset = 0;

			while (targetNode && charCount < position) {
				if (targetNode.nodeType === Node.TEXT_NODE) {
					const nodeLength = (targetNode as Text).length;
					if (charCount + nodeLength >= position) {
						targetOffset = position - charCount;
						break;
					}
					charCount += nodeLength;
				}
				targetNode = targetNode.nextSibling;
			}

			if (targetNode && targetNode.nodeType === Node.TEXT_NODE) {
				range.setStart(targetNode as Text, targetOffset);
				range.setEnd(targetNode as Text, targetOffset);
			} else {
				// Если не нашли текстовый узел, ставим в начало блока
				range.setStart(blockEl, 0);
				range.setEnd(blockEl, 0);
			}

			const rect = range.getBoundingClientRect();
			const containerRect = this.container?.getBoundingClientRect();

			if (!containerRect) return null;

			return {
				x: rect.left - containerRect.left,
				y: rect.top - containerRect.top,
			};
		} catch (error) {
			console.error(
				'[CollaborativeCursorsRenderer] Failed to get cursor coordinates:',
				error,
			);
			return null;
		}
	}

	/**
	 * Синхронизирует DOM-элементы курсоров со списком активных пользователей
	 * Удаляет устаревшие курсоры и обновляет существующие
	 */
	private syncCursors(users: Map<string, CollaborativeUser>): void {
		// Удаляем курсоры для пользователей, которых больше нет
		for (const userId of this.cursorElements.keys()) {
			if (!users.has(userId)) {
				this.removeCursor(userId);
			}
		}

		// Удаляем выделения для пользователей, которых больше нет
		for (const userId of this.selectionElements.keys()) {
			if (!users.has(userId)) {
				this.removeSelection(userId);
			}
		}

		// Обновляем курсоры для всех активных пользователей
		users.forEach((user) => {
			this.updateUserCursor(user);
		});
	}

	/**
	 * Удаляет DOM-элемент курсора для пользователя
	 * Вызывается при отключении пользователя или потере блока
	 */
	private removeCursor(userId: string): void {
		const cursorEl = this.cursorElements.get(userId);
		if (cursorEl) {
			cursorEl.remove();
			this.cursorElements.delete(userId);
		}
		this.removeSelection(userId);
	}

	/**
	 * Очищает все курсоры и отписывается от событий
	 * Используется при переходе с страницы заметки или разрыве подключения
	 */
	cleanup(): void {
		if (this.unsubscribeCursors) {
			this.unsubscribeCursors();
		}

		this.cursorElements.forEach((el) => el.remove());
		this.cursorElements.clear();

		this.selectionElements.forEach((el) => el.remove());
		this.selectionElements.clear();

		this.container = null;

		// Удаляем слушатель
		const handler = ((e: CustomEvent) => {
			const users = e.detail as CollaborativeUser[];
			if (Array.isArray(users)) {
				for (const user of users) {
					this.updateUserCursor(user);
				}
			}
		}) as EventListener;

		window.removeEventListener('collaborativeCursorMove', handler);
	}
}
