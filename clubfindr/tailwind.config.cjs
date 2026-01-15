/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		colors: {
			black: 'black',
			white: 'white',
			dark_blue: '#1a202c',
			transparent: 'transparent',
			primary: 'rgb(var(--color-primary) / <alpha-value>)',
			bg: 'rgb(var(--color-bg) / <alpha-value>)',
			bgdark: 'rgb(var(--color-dark-bg) / <alpha-value>)',
			secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
			light: 'rgb(var(--color-light) / <alpha-value>)',
			spotify: 'rgb(var(--color-spotify) / <alpha-value>)',
			orange: {
				500: '#f97316',
				600: '#ea580c'
			},
			red: {
				100: '#fee2e2',
				400: '#f87171',
				700: '#b91c1c'
			},
			gray: {
				200: '#e5e7eb'
			},
			green: {
				500: '#22c55e'
			}
		},
		extend: {
			fontFamily: {
				sen: ['Sen']
			},
			keyframes: {
				'fade-in': {
					'0%': {
						opacity: '0',
						transform: 'translateY(-1rem)'
					},
					'100%': {
						opacity: '1',
						transform: 'translateY(0)'
					}
				}
			},
			animation: {
				'fade-in': 'fade-in 0.3s ease-out'
			}
		}
	},
	plugins: [],
	variants: {
		extend: {
			opacity: ['group-hover']
		}
	}
};
