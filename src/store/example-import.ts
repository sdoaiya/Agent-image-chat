import { create } from "zustand";
import type { AttachedPromptFile } from "@/app/canvas/prompt-bar";
import type { TurnMode } from "@/store/conversations";

export interface ExampleImportPayload {
  mode?: TurnMode;
  prompt?: string;
  files?: AttachedPromptFile[];
}

interface ExampleImportState {
  pending: ExampleImportPayload | null;
  setPending: (payload: ExampleImportPayload | null) => void;
  consumePending: () => ExampleImportPayload | null;
  clearPending: () => void;
}

export const useExampleImport = create<ExampleImportState>()((set, get) => ({
  pending: null,
  setPending: (payload) => set({ pending: payload }),
  consumePending: () => {
    const payload = get().pending;
    set({ pending: null });
    return payload;
  },
  clearPending: () => set({ pending: null }),
}));
