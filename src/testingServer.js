// server.js
import http from 'http';
import process from 'process';

const server = http.createServer((req, res) => {
	console.log(`${req.method} ${req.url}`);

	// ============================================
	// ✅ CORS HEADERS (для всех запросов)
	// ============================================
	const origin = req.headers.origin;
	if (
		origin === 'http://localhost:5173' ||
		origin === 'http://127.0.0.1:5173'
	) {
		res.setHeader('Access-Control-Allow-Origin', origin);
		res.setHeader('Access-Control-Allow-Credentials', 'true');
		res.setHeader(
			'Access-Control-Allow-Methods',
			'GET,POST,PUT,DELETE,OPTIONS',
		);
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
	}

	// Preflight запрос
	if (req.method === 'OPTIONS') {
		res.writeHead(204);
		res.end();
		return;
	}

	// ============================================
	// ✅ API ROUTES
	// ============================================

	// 1. Ping (проверка что сервер работает)
	if (req.url === '/ping' && req.method === 'GET') {
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end('pong');
		return;
	}

	// 2. POST /signin (вход)
	if (req.url === '/signin' && req.method === 'POST') {
		handleSignin(req, res);
		return;
	}

	// 3. POST /signup (регистрация)
	if (req.url === '/signup' && req.method === 'POST') {
		handleSignup(req, res);
		return;
	}

	// 4. GET /protected (проверка авторизации)
	if (req.url === '/protected' && req.method === 'GET') {
		handleProtected(req, res);
		return;
	}

	// 5. POST /logout (выход)
	if (req.url === '/logout' && req.method === 'POST') {
		handleLogout(req, res);
		return;
	}
});

// ============================================
// 📝 API HANDLERS
// ============================================

// Временное хранилище пользователей (в памяти)
const users = new Map();
let userIdCounter = 1;

function handleSignin(req, res) {
	let body = '';

	req.on('data', (chunk) => (body += chunk));
	req.on('end', () => {
		try {
			const { login, password } = JSON.parse(body);

			// Простая валидация
			if (!login || !password) {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'login and password required' }));
				return;
			}

			// Ищем пользователя
			const user = users.get(login);
			if (!user || user.password !== password) {
				res.writeHead(401, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'incorrect username or password' }));
				return;
			}

			// Генерируем простой токен (в проде используйте JWT!)
			const token = `fake_jwt_token_${user.id}_${Date.now()}`;

			// Устанавливаем cookie
			res.writeHead(200, {
				'Content-Type': 'application/json',
				'Set-Cookie': `NoterianCookieJWT=${token}; HttpOnly; Path=/; SameSite=Strict`,
			});
			res.end(
				JSON.stringify({
					id: user.id.toString(),
					login: user.login,
					token: token,
				}),
			);
		} catch (err) {
			console.log(err);
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'invalid JSON' }));
		}
	});
}

function handleSignup(req, res) {
	let body = '';

	req.on('data', (chunk) => (body += chunk));
	req.on('end', () => {
		try {
			const { login, password } = JSON.parse(body);

			// Валидация
			if (!login || !password) {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'login and password required' }));
				return;
			}

			if (password.length < 4) {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(
					JSON.stringify({ error: 'password must be at least 4 characters' }),
				);
				return;
			}

			// Проверяем существует ли пользователь
			if (users.has(login)) {
				res.writeHead(409, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'user already exists' }));
				return;
			}

			// Создаём пользователя
			const userId = userIdCounter++;
			users.set(login, { id: userId, login, password });

			// Генерируем токен
			const token = `fake_jwt_token_${userId}_${Date.now()}`;

			// Устанавливаем cookie
			res.writeHead(200, {
				'Content-Type': 'application/json',
				'Set-Cookie': `NoterianCookieJWT=${token}; HttpOnly; Path=/; SameSite=Strict`,
			});
			res.end(
				JSON.stringify({
					id: userId.toString(),
					login: login,
					token: token,
				}),
			);
		} catch (err) {
			console.log(err);
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'invalid JSON' }));
		}
	});
}

function handleProtected(req, res) {
	// Проверяем cookie
	const cookies = parseCookies(req.headers.cookie);
	const token = cookies['NoterianCookieJWT'];

	if (!token) {
		res.writeHead(401, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'unauthorized' }));
		return;
	}

	// Простая проверка токена (в проде используйте JWT verify!)
	if (!token.startsWith('fake_jwt_token_')) {
		res.writeHead(401, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'invalid token' }));
		return;
	}

	// Успех
	res.writeHead(200, { 'Content-Type': 'application/json' });
	res.end(
		JSON.stringify({
			msg: 'This is a protected endpoint',
			user_id: token.split('_')[2],
			time: new Date().toISOString(),
		}),
	);
}

function handleLogout(req, res) {
	// Очищаем cookie
	res.writeHead(204, {
		'Set-Cookie':
			'NoterianCookieJWT=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0',
	});
	res.end();
}

// ============================================
// 🔧 HELPER FUNCTIONS
// ============================================

function parseCookies(cookieHeader) {
	const cookies = {};
	if (!cookieHeader) return cookies;

	cookieHeader.split(';').forEach((cookie) => {
		const [name, value] = cookie.trim().split('=');
		cookies[name] = decodeURIComponent(value || '');
	});

	return cookies;
}

// ============================================
// 🚀 START SERVER
// ============================================

const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
	console.log('\n🚀 Server started on http://localhost:' + PORT);
	console.log('🔌 API endpoints:');
	console.log('   GET  /ping');
	console.log('   POST /signin');
	console.log('   POST /signup');
	console.log('   GET  /protected');
	console.log('   POST /logout');
	console.log('\n📝 Press Ctrl+C to stop\n');
});
