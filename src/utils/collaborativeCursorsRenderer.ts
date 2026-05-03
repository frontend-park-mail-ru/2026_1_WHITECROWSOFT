import { store } from '../store.js';
import type { CollaborativeUser } from '../types.js';

/**
 * Рендерер курсоров других пользователей
 * Отвечает за визуализацию положения курсора другого участника внутри заметки
 */
export class CollaborativeCursorsRenderer {
	private cursorElements: Map<string, HTMLElement> = new Map();
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
		window.addEventListener('collaborativeCursorMove', ((e: CustomEvent) => {
			this.updateUserCursor(e.detail as CollaborativeUser);
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

		const blockEl = this.container.querySelector(
			`[data-block-id="${user.cursor.blockId}"] .note__block`,
		) as HTMLElement;

		if (!blockEl) {
			this.removeCursor(user.userId);
			return;
		}

		let cursorEl = this.cursorElements.get(user.userId);

		if (!cursorEl) {
			cursorEl = document.createElement('div');
			cursorEl.className = 'collaborative-cursor';
			cursorEl.dataset.userId = user.userId;
			this.container.appendChild(cursorEl);
			this.cursorElements.set(user.userId, cursorEl);
		}

		const cursorPos = this.getCursorCoordinates(blockEl, user.cursor.position);
		if (cursorPos) {
			cursorEl.style.left = cursorPos.x + 'px';
			cursorEl.style.top = cursorPos.y + 'px';
			cursorEl.title = user.userName;
			cursorEl.style.display = 'block';
		} else {
			cursorEl.style.display = 'none';
		}
	}

	/**
	 * Вычисляет координаты курсора внутри блока текста
	 * Возвращает позицию в пикселях относительно контейнера
	 */
	private getCursorCoordinates(
		blockEl: HTMLElement,
		position: number,
	): { x: number; y: number } | null {
		if (position < 0 || position > blockEl.innerText.length) return null;

		const selection = window.getSelection();

		if (!selection) return null;

		try {
			const preRange = document.createRange();
			preRange.setStart(blockEl, 0);

			let charCount = 0;
			let node: Node | null = blockEl.firstChild;

			while (node && charCount < position) {
				if (node.nodeType === Node.TEXT_NODE) {
					const nodeLength = (node as Text).length;
					if (charCount + nodeLength >= position) {
						preRange.setEnd(node, position - charCount);
						break;
					}
					charCount += nodeLength;
				}
				node = node.nextSibling;
			}

			const rect = preRange.getBoundingClientRect();
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
		for (const userId of this.cursorElements.keys()) {
			if (!users.has(userId)) {
				this.removeCursor(userId);
			}
		}

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
		this.container = null;

		window.removeEventListener('collaborativeCursorMove', ((e: CustomEvent) => {
			this.updateUserCursor(e.detail as CollaborativeUser);
		}) as EventListener);
	}
}
