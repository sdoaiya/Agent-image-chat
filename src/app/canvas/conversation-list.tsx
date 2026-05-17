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

  const sortedConversations = [...conversations].sort((a, b) => b.updated_at - a.updated_at);

  const startRename = (id: string, title: string) => {
    setEditingId(id);
    setEditingTitle(title);
  };

  const commitRename = () => {
    if (!editingId) return;
    rename(editingId, editingTitle);
    setEditingId(null);
    setEditingTitle("");
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

  const getConversationSummary = (conversation: typeof conversations[number]) => {
    const generatingCount = conversation.turns.filter((turn) => turn.status === "generating").length;
    if (generatingCount > 0) {
      return `${generatingCount} 个任务生成中`;
    }

    const latestTurn = conversation.turns.reduce<typeof conversation.turns[number] | null>((latest, turn) => {
      if (!latest || turn.created_at > latest.created_at) {
        return turn;
      }
      return latest;
    }, null);

    if (!latestTurn) {
      return "等待输入或从示例导入";
    }

    if (latestTurn.status === "error") {
      return latestTurn.error || "最近任务失败，可重试";
    }

    if (latestTurn.status === "done") {
      return `${conversation.turns.length} 个任务`;
    }

    return "待处理";
  };

  return (
    <aside
      className={cn(
        "canvas-conversation-root",
        !sidebarOpen && "canvas-conversation-root--collapsed",
      )}
      aria-label="左侧工作列表"
    >
      <div
        className={cn(
          "canvas-conversation-head titlebar-drag",
          !sidebarOpen && "canvas-conversation-head--collapsed",
        )}
        style={{ paddingTop: "calc(env(titlebar-area-height, 32px) + 8px)" }}
      >
        <div className="canvas-conversation-head-row titlebar-no-drag">
          {sidebarOpen ? (
            <div className="canvas-conversation-head-copy">
              <span className="canvas-conversation-kicker">工作列表</span>
            </div>
          ) : (
            <span className="sr-only">工作列表</span>
          )}

          <div className="canvas-conversation-head-actions">
            {sidebarOpen ? (
              <button
                type="button"
                onClick={() => create()}
                className="canvas-conversation-create"
                title="新建工作"
                aria-label="新建工作"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </button>
            ) : null}

            {onToggleSidebar ? (
              <button
                type="button"
                onClick={onToggleSidebar}
                className={cn(
                  "canvas-conversation-toggle",
                  sidebarOpen ? "canvas-conversation-toggle--open" : "canvas-conversation-toggle--collapsed",
                )}
                title={sidebarOpen ? "收起工作列表" : "展开工作列表"}
                aria-label={sidebarOpen ? "收起工作列表" : "展开工作列表"}
              >
                {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {sidebarOpen ? (
        <div className="canvas-conversation-list sidebar-scrollbar" role="list" aria-label="工作列表">
          {!loaded ? (
            <div className="canvas-conversation-empty">加载中...</div>
          ) : loadError ? (
            <div className="canvas-conversation-empty">{loadError}</div>
          ) : sortedConversations.length === 0 ? (
            <div className="canvas-conversation-empty">暂无工作</div>
          ) : (
            sortedConversations.map((conv) => {
              const isActive = activeId === conv.id;
              const summary = getConversationSummary(conv);

              return (
                <div
                  key={conv.id}
                  role="listitem"
                  data-testid={`conversation-item-${conv.id}`}
                  className={cn("canvas-conversation-item group", isActive && "canvas-conversation-item--active")}
                  onClick={() => setActive(conv.id)}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    startRename(conv.id, conv.title);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setActive(conv.id);
                    startRename(conv.id, conv.title);
                  }}
                >
                  {editingId === conv.id ? (
                    <input
                      value={editingTitle}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onBlur={commitRename}
                      onKeyDown={handleRenameKeyDown}
                      className={cn("canvas-conversation-input", isActive && "canvas-conversation-input--active")}
                      autoFocus
                      aria-label="重命名工作"
                    />
                  ) : (
                    <button
                      type="button"
                      className="canvas-conversation-copy border-0 bg-transparent p-0 text-left"
                      title="双击或右键可重命名"
                      aria-current={isActive ? "true" : undefined}
                      aria-label={`切换到工作 ${conv.title}，${summary}。双击或右键可重命名`}
                    >
                      <strong>{conv.title}</strong>
                      <span>{summary}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      remove(conv.id);
                    }}
                    className={cn("canvas-conversation-delete", isActive && "canvas-conversation-delete--active")}
                    aria-label={`删除工作 ${conv.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </aside>
  );
}
