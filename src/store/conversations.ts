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
  provider?: string;
  source?: string;
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
  provider?: string;
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
  style?: string;
  upscale?: string;
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
  loadError: string | null;
}

interface ConversationsActions {
  load: () => Promise<void>;
  create: () => string;
  remove: (id: string) => void;
  rename: (id: string, title: string) => void;
  setActive: (id: string | null) => void;
  addTurn: (convId: string, turn: ConversationTurn) => void;
  updateTurn: (convId: string, turnId: string, partial: Partial<ConversationTurn>) => void;
  removeTurn: (convId: string, turnId: string) => void;
}

const STORAGE_KEY = "gimg-conversations";
const ACTIVE_ID_STORAGE_KEY = "gimg-active-conversation";
const store = localforage.createInstance({ name: STORAGE_KEY });

type StoredConversations =
  | Conversation[]
  | {
      conversations?: Conversation[];
      activeId?: string | null;
    };

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

function persistActiveConversation(activeId: string | null): void {
  writeQueue = writeQueue.then(async () => {
    await store.setItem(ACTIVE_ID_STORAGE_KEY, activeId);
  }).catch((err) => {
    console.error("[gimg] Failed to persist active conversation:", err);
  });
}

function normalizeStoredConversations(stored: StoredConversations | null): { conversations: Conversation[]; activeId: string | null } {
  if (!stored) return { conversations: [], activeId: null };
  if (Array.isArray(stored)) return { conversations: stored, activeId: null };
  return {
    conversations: Array.isArray(stored.conversations) ? stored.conversations : [],
    activeId: typeof stored.activeId === "string" ? stored.activeId : null,
  };
}

export const useConversations = create<ConversationsState & ConversationsActions>()(
  (set) => ({
    conversations: [],
    activeId: null,
    loaded: false,
    loadError: null,

    load: async () => {
      try {
        const [rawStored, storedActiveId] = await Promise.all([
          store.getItem<StoredConversations>(STORAGE_KEY),
          store.getItem<string | null>(ACTIVE_ID_STORAGE_KEY),
        ]);
        const stored = normalizeStoredConversations(rawStored);
        const conversations = stored.conversations.map((c) => ({
          ...c,
          turns: normalizeTurns(c.turns),
        }));
        const rememberedActiveId = storedActiveId || stored.activeId;
        const activeId = conversations.some((item) => item.id === rememberedActiveId)
          ? rememberedActiveId
          : (conversations[0]?.id ?? null);
        set({ conversations, loaded: true, loadError: null, activeId });
      } catch (err) {
        console.error("[gimg] Failed to load conversations:", err);
        set({ conversations: [], loaded: true, loadError: "对话读取失败，可新建对话继续使用。", activeId: null });
      }
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
        persistActiveConversation(id);
        return { conversations, activeId: id, loadError: null };
      });
      return id;
    },

    remove: (id) => {
      set((state) => {
        const conversations = state.conversations.filter((c) => c.id !== id);
        persistConversations(conversations);
        const activeId = state.activeId === id ? (conversations[0]?.id ?? null) : state.activeId;
        if (activeId !== state.activeId) persistActiveConversation(activeId);
        return {
          conversations,
          activeId,
        };
      });
    },

    rename: (id, title) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      set((state) => {
        const conversations = state.conversations.map((c) =>
          c.id === id ? { ...c, title: trimmed.slice(0, 80), updated_at: Date.now() } : c,
        );
        persistConversations(conversations);
        return { conversations };
      });
    },

    setActive: (id) => {
      persistActiveConversation(id);
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
