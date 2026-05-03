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
  const loaded = useConversations((s) => s.loaded);

  return (
    <div className="flex h-full flex-col">
      <div className="titlebar-drag border-b border-sidebar-border px-3 py-3" style={{ paddingTop: "calc(env(titlebar-area-height, 32px) + 8px)" }}>
        <div className="relative flex h-9 items-center justify-center">
          {sidebarOpen && <span className="titlebar-no-drag text-sm font-semibold text-sidebar-foreground">工作台</span>}
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className={cn(
                "titlebar-no-drag rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
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
            <span className="text-sm font-semibold text-sidebar-foreground">对话</span>
            <button
              type="button"
              onClick={() => create()}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            加载中...
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            暂无对话
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = activeId === conv.id;
            return (
              <div
                key={conv.id}
                onClick={() => setActive(conv.id)}
                className={cn(
                  "group flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-muted",
                  isActive && "bg-primary text-primary-foreground hover:bg-primary",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{conv.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(conv.id);
                  }}
                  className={cn(
                    "shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive",
                    isActive && "text-primary-foreground hover:text-primary-foreground/80",
                  )}
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
