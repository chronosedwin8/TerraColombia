// vitest.config.ts
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "file:///C:/Users/eortiz/Desktop/TerraColombia/node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.4_jsdom@25.0.1/node_modules/vitest/dist/config.js";
import vue from "file:///C:/Users/eortiz/Desktop/TerraColombia/node_modules/.pnpm/@vitejs+plugin-vue@5.2.4_vite@6.4.3_@types+node@22.20.4_jiti@1.21.7_tsx@4.23.15_yaml@2.9.1__vue@3.5.43_typescript@5.9.3_/node_modules/@vitejs/plugin-vue/dist/index.mjs";
var __vite_injected_original_import_meta_url = "file:///C:/Users/eortiz/Desktop/TerraColombia/apps/web/vitest.config.ts";
var vitest_config_default = defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url))
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.spec.ts"],
    server: {
      deps: {
        // Los paquetes del monorepo son TypeScript sin compilar.
        inline: ["@terracolombia/shared", "@terracolombia/geo"]
      }
    }
  }
});
export {
  vitest_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZXN0LmNvbmZpZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXGVvcnRpelxcXFxEZXNrdG9wXFxcXFRlcnJhQ29sb21iaWFcXFxcYXBwc1xcXFx3ZWJcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXGVvcnRpelxcXFxEZXNrdG9wXFxcXFRlcnJhQ29sb21iaWFcXFxcYXBwc1xcXFx3ZWJcXFxcdml0ZXN0LmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvZW9ydGl6L0Rlc2t0b3AvVGVycmFDb2xvbWJpYS9hcHBzL3dlYi92aXRlc3QuY29uZmlnLnRzXCI7aW1wb3J0IHsgZmlsZVVSTFRvUGF0aCwgVVJMIH0gZnJvbSAnbm9kZTp1cmwnO1xuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZXN0L2NvbmZpZyc7XG5pbXBvcnQgdnVlIGZyb20gJ0B2aXRlanMvcGx1Z2luLXZ1ZSc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFt2dWUoKV0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgJ0AnOiBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJy4vc3JjJywgaW1wb3J0Lm1ldGEudXJsKSksXG4gICAgfSxcbiAgfSxcbiAgdGVzdDoge1xuICAgIGVudmlyb25tZW50OiAnanNkb20nLFxuICAgIGdsb2JhbHM6IHRydWUsXG4gICAgaW5jbHVkZTogWydzcmMvKiovKi5zcGVjLnRzJ10sXG4gICAgc2VydmVyOiB7XG4gICAgICBkZXBzOiB7XG4gICAgICAgIC8vIExvcyBwYXF1ZXRlcyBkZWwgbW9ub3JlcG8gc29uIFR5cGVTY3JpcHQgc2luIGNvbXBpbGFyLlxuICAgICAgICBpbmxpbmU6IFsnQHRlcnJhY29sb21iaWEvc2hhcmVkJywgJ0B0ZXJyYWNvbG9tYmlhL2dlbyddLFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQThVLFNBQVMsZUFBZSxXQUFXO0FBQ2pYLFNBQVMsb0JBQW9CO0FBQzdCLE9BQU8sU0FBUztBQUZtTSxJQUFNLDJDQUEyQztBQUlwUSxJQUFPLHdCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsSUFBSSxDQUFDO0FBQUEsRUFDZixTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLGNBQWMsSUFBSSxJQUFJLFNBQVMsd0NBQWUsQ0FBQztBQUFBLElBQ3REO0FBQUEsRUFDRjtBQUFBLEVBQ0EsTUFBTTtBQUFBLElBQ0osYUFBYTtBQUFBLElBQ2IsU0FBUztBQUFBLElBQ1QsU0FBUyxDQUFDLGtCQUFrQjtBQUFBLElBQzVCLFFBQVE7QUFBQSxNQUNOLE1BQU07QUFBQTtBQUFBLFFBRUosUUFBUSxDQUFDLHlCQUF5QixvQkFBb0I7QUFBQSxNQUN4RDtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
