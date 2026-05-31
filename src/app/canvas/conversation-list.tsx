import { useState, type KeyboardEvent } from "react";
import { MessageSquarePlus, PanelLeftClose, PanelLeftOpen, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConversations } from "@/store/conversations";

interface ConversationListProps {
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function ConversationList({ sidebarOpen = true, onToggleSidebar }: ConversationListProps = {}) {
  const conversations = useConversations((s) => s.conversations);
  const activeId = useConversations((s) => s.activeId);
  const setActive = useConversations((s) => s.setActive);
  const create = useConversations((s) => s.create);
  const remove = useConversations((s) => s.remove);
  const rename = useConversations((s) => s.rename);
  const loaded = useConversations((s) => s.loaded);
  const loadError = useConversations((s) => s.loadError);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const startRename = (id: string, title: string) => {
    setEditingId(id);
    setEditingTitle(title);
  };

  const commitRename = () => {
    if (!editingId) return;
    rename(editingId, editingTitle);
    setEditingId(null);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  };

  return (
    <div className="conversation-sidebar flex h-full flex-col">
      <div className="conversation-sidebar-head titlebar-drag border-b border-sidebar-border px-3 py-3" style={{ paddingTop: "calc(env(titlebar-area-height, 32px) + 8px)" }}>
        <div className="relative flex h-9 items-center justify-center">
          {sidebarOpen && <span className="conversation-sidebar-title titlebar-no-drag text-sm font-semibold text-sidebar-foreground">工作台</span>}
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className={cn(
                "conversation-icon-button titlebar-no-drag rounded-lg p-1.5 text-muted-foreground transition-colors",
                sidebarOpen ? "absolute right-0" : "mx-auto",
              )}
              title={sidebarOpen ? "收起对话区" : "展开对话区"}
              aria-label={sidebarOpen ? "收起对话区" : "展开对话区"}
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>
          )}
        </div>
        {sidebarOpen && (
          <div className="titlebar-no-drag mt-2 flex items-center justify-between">
            <span className="conversation-section-label text-sm font-semibold text-sidebar-foreground">对话</span>
            <button
              type="button"
              onClick={() => create()}
              className="conversation-icon-button rounded-lg p-1.5 text-muted-foreground transition-colors"
              title="新建对话"
              aria-label="新建对话"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      {sidebarOpen && <div className="sidebar-scrollbar flex-1 overflow-y-auto">
        {!loaded ? (
          <div className="conversation-empty px-3 py-6 text-center text-sm text-muted-foreground">
            加载中...
          </div>
        ) : loadError ? (
          <div className="conversation-empty px-3 py-6 text-center text-sm leading-5 text-muted-foreground">
            {loadError}
          </div>
        ) : conversations.length === 0 ? (
          <div className="conversation-empty px-3 py-6 text-center text-sm text-muted-foreground">
            暂无对话
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = activeId === conv.id;
            return (
              <div
                key={conv.id}
                onClick={() => setActive(conv.id)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  startRename(conv.id, conv.title);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setActive(conv.id);
                  startRename(conv.id, conv.title);
                }}
                className={cn(
                  "conversation-item group flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors",
                  isActive && "conversation-item--active text-primary-foreground",
                )}
              >
                {editingId === conv.id ? (
                  <input
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={commitRename}
                    onKeyDown={handleRenameKeyDown}
                    className={cn(
                      "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring",
                      isActive && "border-primary-foreground/40 bg-primary-foreground text-primary",
                    )}
                    autoFocus
                    aria-label="重命名对话"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate" title="双击或右键重命名">{conv.title}</span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(conv.id);
                  }}
                  className={cn(
                    "conversation-delete-button shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100",
                    isActive && "text-primary-foreground hover:text-primary-foreground/80",
                  )}
                  aria-label="删除对话"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>}
    </div>
  );
}
