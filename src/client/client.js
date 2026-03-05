const SERVER_URL = 'http://localhost:8000';

class Client {
    constructor() {
        this.serverURL = SERVER_URL;
    }

    async request(endpoint, options = {}) {
        const url = `${this.serverURL}${endpoint}`

        try {
            const response = await fetch(url, {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`Request failed: ${response.status}`)
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
            body: JSON.stringify(body)
        });
    }

    put(endpoint, body = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    postForm(endpoint, formData) {
        return this.request(endpoint, {
            method: 'POST',
            body: formData,
            headers: {},
        });
    }
}

export const client = new Client();