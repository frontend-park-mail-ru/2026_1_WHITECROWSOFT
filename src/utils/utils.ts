import Handlebars from 'handlebars';

type EventHandler = (event: Event) => void;

interface ElementProps {
	class?: string;
	id?: string;
	[key: string]: string | number | boolean | EventHandler | undefined;
}

type ChildType = string | Node | null | undefined;

/**
 * Создает DOM элемент с заданными свойствами и дочерними элементами
 * @param tag - тег элемента
 * @param props - свойства элемента (class, id, on* события и т.д.)
 * @param children - дочерние элементы
 * @returns созданный элемент
 */
export function el(
	tag: string,
	props: ElementProps = {},
	children: ChildType[] = [],
): HTMLElement {
	const element = document.createElement(tag);

	Object.entries(props).forEach(([key, value]) => {
		if (value === undefined || value === null) return;

		if (key === 'class') {
			element.className = String(value);
		} else if (key.startsWith('on') && typeof value === 'function') {
			const eventName = key.slice(2).toLowerCase();
			element.addEventListener(eventName, value as EventHandler);
		} else if (
			typeof value === 'string' ||
			typeof value === 'number' ||
			typeof value === 'boolean'
		) {
			element.setAttribute(key, String(value));
		}
	});

	children.forEach((child) => {
		if (child === null || child === undefined) return;

		if (typeof child === 'string') {
			element.appendChild(document.createTextNode(child));
		} else if (child instanceof Node) {
			element.appendChild(child);
		}
	});

	return element;
}

export function createElement(
	tag: string,
	...classNames: string[]
): HTMLElement {
	const element = document.createElement(tag);
	if (classNames.length) {
		element.className = classNames.join(' ');
	}
	return element;
}

export function getElementPosition(el: HTMLElement): DOMRect {
	return el.getBoundingClientRect();
}

/**
 * Рендерит контент в указанный контейнер
 * @param container - контейнер для рендеринга
 * @param content - строка HTML или DOM элемент
 */
export function render(
	container: HTMLElement | null,
	content: string | Node,
): void {
	if (!container) return;

	container.innerHTML = '';
	if (typeof content === 'string') {
		container.innerHTML = content;
	} else {
		container.appendChild(content);
	}
}

interface PartialModules {
	[path: string]: string;
}

const partials = import.meta.glob('../components/partials/**/*.hbs', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as PartialModules;

/**
 * Регистрирует Handlebars partials из файлов .hbs
 */
export function registerPartials(): void {
	Object.entries(partials).forEach(([path, content]) => {
		const name = path.replace('../', '').replace('.hbs', '');
		Handlebars.registerPartial(name, content);
	});
}

type HandlebarsHelper = (...args: unknown[]) => unknown;

interface HelpersMap {
	[key: string]: HandlebarsHelper;
}

function normalizeIconName(icon: string): string {
	const match = icon.match(/([^/\\]+)\.svg$/);
	return match ? match[1] : icon;
}

function buildSvgAttributes(hash: Record<string, unknown>): string {
	return Object.entries(hash)
		.filter(([key]) => key !== 'alt')
		.map(
			([key, value]) =>
				`${key}="${Handlebars.escapeExpression(String(value))}"`,
		)
		.join(' ');
}

interface SvgOptions {
	hash?: Record<string, unknown>;
}

/**
 * Регистрирует Handlebars helpers для использования в шаблонах
 */
export function registerHelpers(): void {
	const helpers: HelpersMap = {
		eq: (a: unknown, b: unknown) => a === b,
		neq: (a: unknown, b: unknown) => a !== b,
		and: (a: unknown, b: unknown) => !!(a && b),
		or: (a: unknown, b: unknown) => !!(a || b),
		ternary: (condition: unknown, truthy: unknown, falsy: unknown) =>
			condition ? truthy : falsy,
		svgIcon: (name: unknown, options: SvgOptions) => {
			const iconName = normalizeIconName(String(name || ''));
			const hash = options?.hash || {};
			const alt =
				typeof hash.alt === 'string'
					? Handlebars.escapeExpression(hash.alt)
					: null;
			const attributes = buildSvgAttributes(hash);
			const accessibility = alt
				? `aria-label="${alt}" role="img"`
				: 'aria-hidden="true"';
			const svg = `<svg ${attributes} ${accessibility} xmlns="http://www.w3.org/2000/svg"><use xlink:href="#${Handlebars.escapeExpression(
				iconName,
			)}" href="#${Handlebars.escapeExpression(iconName)}"></use></svg>`;
			return new Handlebars.SafeString(svg);
		},
	};

	Object.entries(helpers).forEach(([name, fn]) => {
		if (!Handlebars.helpers[name]) {
			Handlebars.registerHelper(name, fn);
		}
	});
}
