import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
	root: 'src',
	build: {
		outDir: '../dist',
	},
	resolve: {
		alias: {
			'@assets': path.resolve(__dirname, 'src/assets/'),
		},
	},
});
