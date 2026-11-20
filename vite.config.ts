import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Prefer TypeScript files over any leftover .js/.jsx with the same name
  resolve: {
    extensions: ['.tsx', '.ts', '.mjs', '.js', '.jsx', '.json'],
  },
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
})
