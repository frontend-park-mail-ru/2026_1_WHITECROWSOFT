import { defineConfig } from 'vite';
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons';
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
	plugins: [
		createSvgIconsPlugin({
			iconDirs: [path.resolve(__dirname, 'src/public/icons')],
			symbolId: '[name]',
			inject: 'body-last',
			svgoOptions: true,
		}),
	],
});
