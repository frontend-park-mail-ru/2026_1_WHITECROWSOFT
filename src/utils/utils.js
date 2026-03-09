import Handlebars from 'handlebars';

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

export function registerPartials() {
	console.log(partials);
	Object.entries(partials).forEach(([path, content]) => {
		const name = path.replace('../', '').replace('.hbs', '');

		Handlebars.registerPartial(name, content);
	});
	console.log('[Handlebars] Partials registered');
}

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
