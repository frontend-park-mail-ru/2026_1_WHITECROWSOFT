export function initNotFoundPage() {
	const app = document.querySelector('#app');
	if (app) {
		app.innerHTML = `
            <div style="text-align:center;padding:50px">
                <h1>404</h1>
                <p>Страница не найдена</p>
                <a href="/">Вернуться на главную</a>
            </div>
        `;
	}
}
