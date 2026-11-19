import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>({base:mode==='pages'?'/VOYAGER/':'/',plugins:[react()],build:{chunkSizeWarningLimit:1600}}));
