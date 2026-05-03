export {};

declare global {
  interface Window {
    electronAPI?: {
      getBackendPort: () => Promise<number>;
      getBackendOrigin?: () => Promise<string | null>;
      updateTheme: (theme: "light" | "dark") => void;
      saveImage?: (payload: { defaultPath?: string; bytes: number[] }) => Promise<{ saved: boolean; path?: string }>;
    };
  }
}
