/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                cyan: {
                    400: '#22d3ee',
                    500: '#06b6d4',
                    600: '#0891b2',
                },
                purple: {
                    400: '#c084fc',
                    500: '#a855f7',
                    600: '#9333ea',
                }
            }
        },
    },
    plugins: [],
}
