type Status = "idle" | "active" | "done";

interface AgentCardProps {
  name: string;
  role: string;
  status: Status;
}

const statusStyles: Record<Status, string> = {
  idle: "border-gray-200 bg-gray-50 text-gray-400",
  active: "border-blue-400 bg-blue-50 text-blue-700 animate-pulse",
  done: "border-green-400 bg-green-50 text-green-700",
};

const statusLabel: Record<Status, string> = {
  idle: "Waiting",
  active: "Running…",
  done: "Done",
};

export function AgentCard({ name, role, status }: AgentCardProps) {
  return (
    <div className={`rounded-xl border-2 p-4 transition-all duration-500 ${statusStyles[status]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">{role}</p>
      <p className="mt-1 text-base font-bold">{name}</p>
      <p className="mt-2 text-xs">{statusLabel[status]}</p>
    </div>
  );
}
