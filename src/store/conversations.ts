import { create } from "zustand";
import localforage from "localforage";
import { generateId } from "@/lib/utils";

export type TurnMode = "generate" | "edit" | "upscale";
export type TurnStatus = "pending" | "generating" | "done" | "error";

export interface ImageData {
  url: string;
  b64_json?: string;
  revised_prompt?: string;
  file_id?: string;
  gen_id?: string;
  source_account_id?: string;
  width?: number;
  height?: number;
  bytes?: number;
}

export interface ImageMeta {
  created_at: number;
  model: string;
  mode: TurnMode;
  size?: string;
  scale?: string;
}

export interface ConversationTurn {
  id: string;
  mode: TurnMode;
  prompt: string;
  status: TurnStatus;
  images: ImageData[];
  error?: string;
  source_images?: File[];
  mask_file?: File;
  scale?: string;
  size?: string;
  n?: number;
  quality?: string;
  aspectRatio?: string;
  model: string;
  created_at: number;
}

export interface Conversation {
  id: string;
  title: string;
  turns: ConversationTurn[];
  created_at: number;
  updated_at: number;
}

interface ConversationsState {
  conversations: Conversation[];
  activeId: string | null;
  loaded: boolean;
}

interface ConversationsActions {
  load: () => Promise<void>;
  create: () => string;
  remove: (id: string) => void;
  setActive: (id: string | null) => void;
  addTurn: (convId: string, turn: ConversationTurn) => void;
  updateTurn: (convId: string, turnId: string, partial: Partial<ConversationTurn>) => void;
  removeTurn: (convId: string, turnId: string) => void;
}

const STORAGE_KEY = "gimg-conversations";
const store = localforage.createInstance({ name: STORAGE_KEY });

function normalizeTurns(turns: ConversationTurn[]): ConversationTurn[] {
  return turns.map((t) => {
    if (t.status !== "pending" && t.status !== "generating") return t;
    return {
      ...t,
      status: "error" as const,
      error: t.error || "页面刷新后任务中断，请重试",
      source_images: undefined,
      mask_file: undefined,
    };
  });
}

let writeQueue: Promise<void> = Promise.resolve();

function persistConversations(conversations: Conversation[]): void {
  const serializable = conversations.map((c) => ({
    ...c,
    turns: c.turns.map((t) => {
      const { source_images, mask_file, ...rest } = t;
      void source_images;
      void mask_file;
      return rest;
    }),
  }));
  writeQueue = writeQueue.then(async () => {
    await store.setItem(STORAGE_KEY, serializable);
  }).catch((err) => {
    console.error("[gimg] Failed to persist conversations:", err);
  });
}

export const useConversations = create<ConversationsState & ConversationsActions>()(
  (set) => ({
    conversations: [],
    activeId: null,
    loaded: false,

    load: async () => {
      const stored = (await store.getItem<Conversation[]>(STORAGE_KEY)) ?? [];
      const conversations = stored.map((c) => ({
        ...c,
        turns: normalizeTurns(c.turns),
      }));
      set({ conversations, loaded: true, activeId: conversations[0]?.id ?? null });
    },

    create: () => {
      const id = generateId();
      const now = Date.now();
      const conv: Conversation = {
        id,
        title: "新对话",
        turns: [],
        created_at: now,
        updated_at: now,
      };
      set((state) => {
        const conversations = [conv, ...state.conversations];
        persistConversations(conversations);
        return { conversations, activeId: id };
      });
      return id;
    },

    remove: (id) => {
      set((state) => {
        const conversations = state.conversations.filter((c) => c.id !== id);
        persistConversations(conversations);
        return {
          conversations,
          activeId: state.activeId === id ? (conversations[0]?.id ?? null) : state.activeId,
        };
      });
    },

    setActive: (id) => {
      set({ activeId: id });
    },

    addTurn: (convId, turn) => {
      set((state) => {
        const conversations = state.conversations.map((c) =>
          c.id === convId
            ? { ...c, turns: [...c.turns, turn], updated_at: Date.now(), title: c.turns.length === 0 ? turn.prompt.slice(0, 18) || "新对话" : c.title }
            : c,
        );
        persistConversations(conversations);
        return { conversations };
      });
    },

    updateTurn: (convId, turnId, partial) => {
      set((state) => {
        const conversations = state.conversations.map((c) =>
          c.id === convId
            ? {
                ...c,
                turns: c.turns.map((t) => (t.id === turnId ? { ...t, ...partial } : t)),
                updated_at: Date.now(),
              }
            : c,
        );
        persistConversations(conversations);
        return { conversations };
      });
    },

    removeTurn: (convId, turnId) => {
      set((state) => {
        const conversations = state.conversations.map((c) =>
          c.id === convId
            ? { ...c, turns: c.turns.filter((t) => t.id !== turnId), updated_at: Date.now() }
            : c,
        );
        persistConversations(conversations);
        return { conversations };
      });
    },
  }),
);
