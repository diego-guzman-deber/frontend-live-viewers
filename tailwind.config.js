/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#1f5c3a",
        lightgray: "#f5f5f5",
      },
      fontFamily: {
        serif: ['"Merriweather"', "serif"],
        sans: ['"Open Sans"', "sans-serif"],
      },
    },
  },
  plugins: [],
}
