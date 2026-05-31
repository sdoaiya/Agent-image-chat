export {};

declare global {
  interface Window {
    electronAPI?: {
      getBackendPort: () => Promise<number | null>;
      getBackendOrigin?: () => Promise<string | null>;
      getBackendAuthToken?: () => Promise<string | null>;
      updateTheme: (theme: "light" | "dark") => void;
      saveImage?: (payload: { defaultPath?: string; bytes: number[] }) => Promise<{ saved: boolean; path?: string }>;
      fetchImageBytes?: (url: string) => Promise<{ bytes: number[]; contentType?: string }>;
    };
  }
}
