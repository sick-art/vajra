import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<string, string> = {
  // Temporal workflow statuses (uppercase)
  RUNNING:    "border-blue-800 bg-blue-500/10 text-blue-400",
  COMPLETED:  "border-green-800 bg-green-500/10 text-green-400",
  FAILED:     "border-red-800 bg-red-500/10 text-red-400",
  CANCELED:   "border-yellow-800 bg-yellow-500/10 text-yellow-400",
  TERMINATED: "border-yellow-800 bg-yellow-500/10 text-yellow-400",
  TIMED_OUT:  "border-orange-800 bg-orange-500/10 text-orange-400",
  // Eval run statuses (lowercase)
  running:    "border-blue-800 bg-blue-500/10 text-blue-400",
  completed:  "border-green-800 bg-green-500/10 text-green-400",
  failed:     "border-red-800 bg-red-500/10 text-red-400",
  pending:    "border-zinc-700 bg-zinc-500/10 text-zinc-400",
  canceled:   "border-yellow-800 bg-yellow-500/10 text-yellow-400",
}

const DOT_COLORS: Record<string, string> = {
  RUNNING:    "bg-blue-400 animate-pulse",
  COMPLETED:  "bg-green-400",
  FAILED:     "bg-red-400",
  CANCELED:   "bg-yellow-400",
  TERMINATED: "bg-yellow-400",
  TIMED_OUT:  "bg-orange-400",
  running:    "bg-blue-400 animate-pulse",
  completed:  "bg-green-400",
  failed:     "bg-red-400",
  pending:    "bg-zinc-500",
  canceled:   "bg-yellow-400",
}

export function WorkflowStatusBadge({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        STATUS_STYLES[status] ?? "border-zinc-700 text-muted-foreground",
        className,
      )}
    >
      {status}
    </Badge>
  )
}

export function StatusDot({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full flex-shrink-0",
        DOT_COLORS[status] ?? "bg-zinc-500",
        className,
      )}
    />
  )
}
