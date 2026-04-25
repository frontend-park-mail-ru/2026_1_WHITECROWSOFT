import Handlebars from 'handlebars';
import { handleAuthError } from '../../utils/handleAuthError.js';
import { registerHelpers, registerPartials } from '../../utils/utils.js';
import templateText from './statsPage.hbs?raw';
import './statsPage.scss';

export interface TicketStats {
	total: number;
	open: number;
	inProgress: number;
	waitingUser: number;
	closed: number;
	bugCount: number;
	suggestionCount: number;
	complaintCount: number;
	averageRating?: number;
}

interface ServerStatsResponse {
	total: number;
	open: number;
	in_progress: number;
	waiting_user: number;
	closed: number;
	bug_count: number;
	suggestion_count: number;
	complaint_count: number;
	average_rating?: number;
}

let currentContainer: HTMLElement | null = null;
let refreshInterval: number | null = null;

export async function initStatsPage(container: HTMLElement): Promise<void> {
	await cleanupStatsPage();
	currentContainer = container;
	registerHelpers();
	registerPartials();

	const template = Handlebars.compile(templateText);
	const initialStats: TicketStats = {
		total: 0,
		open: 0,
		inProgress: 0,
		waitingUser: 0,
		closed: 0,
		bugCount: 0,
		suggestionCount: 0,
		complaintCount: 0,
		averageRating: undefined,
	};

	const html = template(initialStats);
	container.innerHTML = html;

	await loadStats(container);
	attachEvents(container);
}

async function loadStats(container: HTMLElement): Promise<void> {
	try {
		const response = await fetch('/api/support/stats', {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
			credentials: 'include',
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(errorData.error || 'Ошибка загрузки статистики');
		}

		const serverStats: ServerStatsResponse = await response.json();

		const stats: TicketStats = {
			total: serverStats.total,
			open: serverStats.open,
			inProgress: serverStats.in_progress,
			waitingUser: serverStats.waiting_user,
			closed: serverStats.closed,
			bugCount: serverStats.bug_count,
			suggestionCount: serverStats.suggestion_count,
			complaintCount: serverStats.complaint_count,
			averageRating: serverStats.average_rating,
		};

		updateStatsUI(container, stats);
	} catch (error) {
		if (handleAuthError(error)) return;
		console.error('Failed to load stats:', error);
		showError(container, 'Не удалось загрузить статистику. Попробуйте позже.');
	}
}

function updateStatsUI(container: HTMLElement, stats: TicketStats): void {
	const totalEl = container.querySelector('[data-stat="total"]');
	const avgEl = container.querySelector('[data-stat="averageRating"]');
	const openEl = container.querySelector('[data-stat="open"]');
	const inProgressEl = container.querySelector('[data-stat="inProgress"]');
	const waitingUserEl = container.querySelector('[data-stat="waitingUser"]');
	const closedEl = container.querySelector('[data-stat="closed"]');
	const bugCountEl = container.querySelector('[data-stat="bugCount"]');
	const suggestionCountEl = container.querySelector(
		'[data-stat="suggestionCount"]',
	);
	const complaintCountEl = container.querySelector(
		'[data-stat="complaintCount"]',
	);

	if (totalEl) totalEl.textContent = String(stats.total);
	if (avgEl)
		avgEl.textContent =
			stats.averageRating !== undefined ? stats.averageRating.toFixed(1) : '—';
	if (openEl) openEl.textContent = String(stats.open);
	if (inProgressEl) inProgressEl.textContent = String(stats.inProgress);
	if (waitingUserEl) waitingUserEl.textContent = String(stats.waitingUser);
	if (closedEl) closedEl.textContent = String(stats.closed);
	if (bugCountEl) bugCountEl.textContent = String(stats.bugCount);
	if (suggestionCountEl)
		suggestionCountEl.textContent = String(stats.suggestionCount);
	if (complaintCountEl)
		complaintCountEl.textContent = String(stats.complaintCount);

	if (stats.total > 0) {
		const openPercent = (stats.open / stats.total) * 100;
		const inProgressPercent = (stats.inProgress / stats.total) * 100;
		const waitingUserPercent = (stats.waitingUser / stats.total) * 100;
		const closedPercent = (stats.closed / stats.total) * 100;

		updateProgressBar(container, 'open', openPercent);
		updateProgressBar(container, 'inProgress', inProgressPercent);
		updateProgressBar(container, 'waitingUser', waitingUserPercent);
		updateProgressBar(container, 'closed', closedPercent);

		updateProgressPercent(container, 'openPercent', openPercent);
		updateProgressPercent(container, 'inProgressPercent', inProgressPercent);
		updateProgressPercent(container, 'waitingUserPercent', waitingUserPercent);
		updateProgressPercent(container, 'closedPercent', closedPercent);
	} else {
		updateProgressBar(container, 'open', 0);
		updateProgressBar(container, 'inProgress', 0);
		updateProgressBar(container, 'waitingUser', 0);
		updateProgressBar(container, 'closed', 0);

		updateProgressPercent(container, 'openPercent', 0);
		updateProgressPercent(container, 'inProgressPercent', 0);
		updateProgressPercent(container, 'waitingUserPercent', 0);
		updateProgressPercent(container, 'closedPercent', 0);
	}
}

function updateProgressBar(
	container: HTMLElement,
	statName: string,
	percent: number,
): void {
	const fillEl = container.querySelector(
		`[data-progress-fill="${statName}"]`,
	) as HTMLElement;
	if (fillEl) {
		fillEl.style.width = `${percent}%`;
	}
}

function updateProgressPercent(
	container: HTMLElement,
	dataAttr: string,
	percent: number,
): void {
	const percentEl = container.querySelector(`[data-progress="${dataAttr}"]`);
	if (percentEl) {
		percentEl.textContent = `${percent.toFixed(1)}%`;
	}
}

function showError(container: HTMLElement, message: string): void {
	const existingError = container.querySelector('.stats__error');
	if (existingError) {
		existingError.remove();
	}

	const errorDiv = document.createElement('div');
	errorDiv.className = 'stats__error';
	errorDiv.innerHTML = `
        <div class="stats__error-content">
            <span class="stats__error-icon">⚠️</span>
            <span class="stats__error-message">${message}</span>
        </div>
    `;

	const actionsDiv = container.querySelector('.stats__actions');
	if (actionsDiv) {
		container.insertBefore(errorDiv, actionsDiv);
	} else {
		container.querySelector('.stats__overwrapper')?.appendChild(errorDiv);
	}

	setTimeout(() => {
		errorDiv.remove();
	}, 5000);
}

function attachEvents(container: HTMLElement): void {
	const refreshBtn = container.querySelector('[data-action="refresh"]');
	if (refreshBtn) {
		refreshBtn.addEventListener('click', async (e) => {
			e.preventDefault();
			const btn = refreshBtn as HTMLButtonElement;
			const originalText = btn.innerHTML;
			btn.innerHTML =
				'<img src="/icons/refresh.svg" class="icon icon--spin"> Загрузка...';
			btn.disabled = true;

			await loadStats(container);

			btn.innerHTML = originalText;
			btn.disabled = false;
		});
	}
}

export async function cleanupStatsPage(): Promise<void> {
	if (refreshInterval) {
		clearInterval(refreshInterval);
		refreshInterval = null;
	}
	if (currentContainer) {
		currentContainer.innerHTML = '';
		currentContainer = null;
	}
}
