import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: "/marathon/",
  plugins: [vue()],
  server: {
    port: 5174,
    proxy: {
      "/marathon/api": "http://127.0.0.1:3790"
    }
  }
});
