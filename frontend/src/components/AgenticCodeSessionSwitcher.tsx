"use client";

import { useEffect, useRef, useState } from "react";

export type AgenticCodeSessionSummary = {
  id: string;
  name: string;
  lastActive: string;
  status: "idle" | "in_progress" | "done";
  archived: boolean;
};

type Props = {
  sessions: AgenticCodeSessionSummary[];
  activeId: string;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
};

const STATUS_DOT: Record<AgenticCodeSessionSummary["status"], string> = {
  idle: "bg-gray-300",
  in_progress: "bg-blue-500",
  done: "bg-green-500",
};

function SessionRow({
  session,
  active,
  onSwitch,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  session: AgenticCodeSessionSummary;
  active: boolean;
  onSwitch: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickAway(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    }
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [menuOpen]);

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSwitch}
        className={[
          "flex w-full items-center gap-2 rounded-lg px-2 py-2 pr-7 text-left transition-colors",
          active ? "bg-indigo-50 text-indigo-900" : "text-gray-700 hover:bg-gray-50",
          session.archived ? "opacity-60" : "",
        ].join(" ")}
      >
        <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_DOT[session.status]}`} />
        <span className="flex-1 truncate text-xs font-medium">{session.name}</span>
        <span className="flex-shrink-0 text-[10px] text-gray-400">{session.lastActive}</span>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-gray-300 opacity-0 hover:text-gray-600 group-hover:opacity-100"
      >
        ⋯
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-1 top-8 z-10 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {session.archived ? (
            <button
              type="button"
              onClick={() => {
                onUnarchive();
                setMenuOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-50"
            >
              Unarchive
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onArchive();
                setMenuOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-50"
            >
              Archive
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (confirmDelete) {
                onDelete();
                setMenuOpen(false);
                setConfirmDelete(false);
              } else {
                setConfirmDelete(true);
              }
            }}
            className="block w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
          >
            {confirmDelete ? "Click again to confirm" : "Delete"}
          </button>
        </div>
      )}
    </div>
  );
}

export function AgenticCodeSessionSwitcher({
  sessions,
  activeId,
  onSwitch,
  onNew,
  onArchive,
  onUnarchive,
  onDelete,
}: Props) {
  const [showArchived, setShowArchived] = useState(false);
  const active = sessions.filter((s) => !s.archived);
  const archived = sessions.filter((s) => s.archived);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Sessions
        </span>
        <button
          type="button"
          onClick={onNew}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
        >
          + New
        </button>
      </div>
      <div className="space-y-1">
        {active.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            active={s.id === activeId}
            onSwitch={() => onSwitch(s.id)}
            onArchive={() => onArchive(s.id)}
            onUnarchive={() => onUnarchive(s.id)}
            onDelete={() => onDelete(s.id)}
          />
        ))}
      </div>
      {archived.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="px-1 text-[11px] font-semibold text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showArchived ? "▾" : "▸"} Archived ({archived.length})
          </button>
          {showArchived && (
            <div className="mt-1 space-y-1">
              {archived.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  active={s.id === activeId}
                  onSwitch={() => onSwitch(s.id)}
                  onArchive={() => onArchive(s.id)}
                  onUnarchive={() => onUnarchive(s.id)}
                  onDelete={() => onDelete(s.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
