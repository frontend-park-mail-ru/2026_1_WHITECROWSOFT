import Handlebars from 'handlebars';

/**
 * Создает DOM элемент с заданными свойствами и дочерними элементами
 * @param {string} tag - тег элемента
 * @param {Object} [props={}] - свойства элемента (class, id, on* события и т.д.)
 * @param {Array} [children=[]] - дочерние элементы
 * @returns {HTMLElement} созданный элемент
*/
export function el(tag, props = {}, children = []) {
	const element = document.createElement(tag);

	Object.entries(props).forEach(([key, value]) => {
		if (key === 'class') {
			element.className = value;
		} else if (key.startsWith('on') && typeof value === 'function') {
			element.addEventListener(key.slice(2).toLowerCase(), value);
		} else if (value != null) {
			element.setAttribute(key, value);
		}
	});

	children.forEach((child) => {
		if (typeof child === 'string') {
			element.appendChild(document.createTextNode(child));
		} else if (child instanceof Node) {
			element.appendChild(child);
		}
	});

	return element;
}

/**
 * Рендерит контент в указанный контейнер
 * @param {HTMLElement} container - контейнер для рендеринга
 * @param {string|Node} content - строка HTML или DOM элемент
*/
export function render(container, content) {
	container.innerHTML = '';
	if (typeof content === 'string') {
		container.innerHTML = content;
	} else {
		container.appendChild(content);
	}
}

const partials = import.meta.glob('../components/partials/**/*.hbs', {
	query: '?raw',
	import: 'default',
	eager: true,
});

/**
 * Регистрирует Handlebars partials из файлов .hbs
*/
export function registerPartials() {
	console.log(partials);
	Object.entries(partials).forEach(([path, content]) => {
		const name = path.replace('../', '').replace('.hbs', '');

		Handlebars.registerPartial(name, content);
	});
	console.log('[Handlebars] Partials registered');
}

/**
 * Регистрирует Handlebars helpers для использования в шаблонах
*/
export function registerHelpers() {
	Handlebars.registerHelper('eq', function (a, b) {
		return a === b;
	});

	Handlebars.registerHelper('neq', function (a, b) {
		return a !== b;
	});

	Handlebars.registerHelper('and', function (a, b) {
		return a && b;
	});

	Handlebars.registerHelper('or', function (a, b) {
		return a || b;
	});
}
