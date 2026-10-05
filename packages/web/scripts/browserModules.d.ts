// Vite resolves this URL inside page.evaluate; this declaration checks the actual store API.
declare module "*/src/store.ts" {
  export const useGameStore: typeof import("../src/store").useGameStore;
}
