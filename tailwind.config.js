/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
    "./SOURCE.jsx",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  safelist: [
    { pattern: /bg-(blue|green|red|yellow|purple|gray|orange)-(400|600|700|800|900|950)/ },
    { pattern: /text-(blue|green|red|yellow|purple|gray|orange)-(300|400|500)/ },
    { pattern: /border-(blue|green|red|yellow|purple|gray|orange)-(700|800|900)/ },
  ],
};
