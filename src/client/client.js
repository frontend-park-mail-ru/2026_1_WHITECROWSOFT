const SERVER_URL = 'http://localhost:8000';

class Client {
	constructor() {
		this.serverURL = SERVER_URL;
	}

	async request(endpoint, options = {}) {
		const url = `${this.serverURL}${endpoint}`;

		try {
			const response = await fetch(url, {
				credentials: 'include',
				headers: {
					'Content-Type': 'application/json',
					...options.headers,
				},
				...options,
			});

<<<<<<< HEAD
<<<<<<< Updated upstream
=======
>>>>>>> b843ce63c85232b9f6f6f044bd48a4c51bbe8a1a
			if (!response.ok) {
				throw new Error(`Request failed: ${response.status}`);
			}

			if (response.status === 204) return null;

			return await response.json();
		} catch (err) {
			if (err.name === 'AbortError') {
				const timeoutError = new Error('Request timeout: 408');
				timeoutError.cause = err;
				throw timeoutError;
			}
			const clientError = new Error('Client error');
			clientError.cause = err;
			throw clientError;
		}
	}

	get(endpoint) {
		return this.request(endpoint, { method: 'GET' });
	}

	post(endpoint, body = {}) {
		return this.request(endpoint, {
			method: 'POST',
			body: JSON.stringify(body),
		});
	}

	put(endpoint, body = {}) {
		return this.request(endpoint, {
			method: 'PUT',
<<<<<<< HEAD
=======
			const responesData = await response.json().catch(() => null);

			if (!response.ok) {
				const error = new Error(`Request failed: ${response.status}`);
				error.status = response.status;
				error.data = responesData;
				throw error;
			}

			if (response.status === 204) return null;

			return await responesData;
		} catch (err) {
			if (err.status) {
				throw err;
			}
			if (err.name === 'AbortError') {
				const timeoutError = new Error('Request timeout: 408');
				timeoutError.cause = err;
				throw timeoutError;
			}
			const clientError = new Error('Client error');
			clientError.status = 0;
			clientError.cause = err;
			throw clientError;
		}
	}

	get(endpoint) {
		return this.request(endpoint, { method: 'GET' });
	}

	post(endpoint, body = {}) {
		return this.request(endpoint, {
			method: 'POST',
>>>>>>> Stashed changes
			body: JSON.stringify(body),
		});
	}

<<<<<<< Updated upstream
=======
	put(endpoint, body = {}) {
		return this.request(endpoint, {
			method: 'PUT',
			body: JSON.stringify(body),
		});
	}

>>>>>>> Stashed changes
=======
			body: JSON.stringify(body),
		});
	}

>>>>>>> b843ce63c85232b9f6f6f044bd48a4c51bbe8a1a
	postForm(endpoint, formData) {
		return this.request(endpoint, {
			method: 'POST',
			body: formData,
			headers: {},
		});
	}
}

export const client = new Client();
