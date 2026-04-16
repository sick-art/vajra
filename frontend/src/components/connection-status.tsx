import { useQuery } from "@tanstack/react-query"
import { healthApi, type HealthResponse } from "@/lib/api-client"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface ConnectionStatusProps {
  compact?: boolean
  className?: string
}

export function ConnectionStatus({
  compact = false,
  className,
}: ConnectionStatusProps) {
  const { data, isError, isLoading } = useQuery<HealthResponse>({
    queryKey: ["health"],
    queryFn: healthApi.check,
    refetchInterval: 15_000,
    retry: 1,
  })

  const isConnected = !isError && data?.status === "ok"
  const isDegraded = !isError && data && data.status !== "ok"

  const dotColor = isLoading
    ? "bg-zinc-500"
    : isError
      ? "bg-red-400"
      : isDegraded
        ? "bg-yellow-400"
        : "bg-green-400"

  const label = isLoading
    ? "Connecting…"
    : isError
      ? "Offline"
      : isDegraded
        ? "Degraded"
        : "Connected"

  const components = data?.components ?? {}

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-1.5 cursor-default select-none",
              className,
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full flex-shrink-0",
                dotColor,
                isConnected && "animate-pulse",
              )}
            />
            {!compact && (
              <span className="text-xs text-muted-foreground">{label}</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="min-w-[160px]">
          <div className="space-y-1.5">
            <p className="font-semibold text-foreground text-xs">{label}</p>
            {Object.entries(components).map(([name, info]) => (
              <div key={name} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground capitalize">{name}</span>
                <span
                  className={cn(
                    "font-medium",
                    info.status === "ok" ? "text-green-400" : "text-red-400",
                  )}
                >
                  {info.status}
                </span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
