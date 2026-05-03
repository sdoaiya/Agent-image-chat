import { create } from "zustand";

interface TasksState {
  activeTaskKeys: Set<string>;
  startTask: (convId: string, turnId: string) => void;
  endTask: (convId: string, turnId: string) => void;
  isTaskActive: (convId: string, turnId: string) => boolean;
  isAnyTaskActive: () => boolean;
}

function taskKey(convId: string, turnId: string): string {
  return `${convId}:${turnId}`;
}

export const useTasks = create<TasksState>()((set, get) => ({
  activeTaskKeys: new Set(),

  startTask: (convId, turnId) => {
    set((state) => {
      const keys = new Set(state.activeTaskKeys);
      keys.add(taskKey(convId, turnId));
      return { activeTaskKeys: keys };
    });
  },

  endTask: (convId, turnId) => {
    set((state) => {
      const keys = new Set(state.activeTaskKeys);
      keys.delete(taskKey(convId, turnId));
      return { activeTaskKeys: keys };
    });
  },

  isTaskActive: (convId, turnId) => {
    return get().activeTaskKeys.has(taskKey(convId, turnId));
  },

  isAnyTaskActive: () => {
    return get().activeTaskKeys.size > 0;
  },
}));