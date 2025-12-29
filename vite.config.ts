import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // This fixes the "global is not defined" crash often seen with crypto libraries
    global: 'window',
  },
})