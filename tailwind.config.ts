import type { Config } from 'tailwindcss';

const config: Config = {
	content: [
		'./index.html',
		'./App.tsx',
		'./index.tsx',
		'./components/**/*.{ts,tsx}',
		'./services/**/*.{ts,tsx}',
	],
	theme: {
		extend: {},
	},
	plugins: [],
};

export default config;
