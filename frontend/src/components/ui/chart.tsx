import * as React from "react"
import { ResponsiveContainer, Tooltip } from "recharts"
import { cn } from "@/lib/utils"

// --- Types ---

export type ChartConfig = Record<
  string,
  { label: string; color: string }
>

// --- Context ---

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null)

export function useChart() {
  const ctx = React.useContext(ChartContext)
  if (!ctx) throw new Error("useChart must be used within ChartContainer")
  return ctx
}

// --- ChartContainer ---

export function ChartContainer({
  config,
  className,
  children,
}: {
  config: ChartConfig
  className?: string
  children: React.ReactElement
}) {
  // Inject --color-{key} CSS variables from config
  const cssVars = Object.entries(config).reduce<Record<string, string>>(
    (acc, [key, val]) => {
      acc[`--color-${key}`] = val.color
      return acc
    },
    {},
  )

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        className={cn("w-full", className)}
        style={cssVars as React.CSSProperties}
      >
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

// --- ChartTooltipContent ---

export function ChartTooltipContent({
  active,
  payload,
  label,
  config,
  formatter,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color?: string }>
  label?: string
  config?: ChartConfig
  formatter?: (value: number, name: string) => string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs">
      {label && (
        <p className="mb-1.5 font-medium text-foreground">{label}</p>
      )}
      <div className="space-y-1">
        {payload.map((entry) => {
          const cfg = config?.[entry.name]
          const color = entry.color ?? cfg?.color ?? "var(--color-chart-1)"
          const displayLabel = cfg?.label ?? entry.name
          const displayValue = formatter
            ? formatter(entry.value, entry.name)
            : `${entry.value}`

          return (
            <div key={entry.name} className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-muted-foreground">{displayLabel}</span>
              <span className="ml-auto font-mono font-medium text-foreground">
                {displayValue}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- ChartLegendContent ---

export function ChartLegendContent({
  payload,
  config,
}: {
  payload?: Array<{ value: string; color?: string }>
  config?: ChartConfig
}) {
  if (!payload?.length) return null

  return (
    <div className="flex flex-wrap gap-3 justify-center pt-2">
      {payload.map((entry) => {
        const cfg = config?.[entry.value]
        const color = entry.color ?? cfg?.color ?? "var(--color-chart-1)"
        const label = cfg?.label ?? entry.value

        return (
          <div key={entry.value} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            {label}
          </div>
        )
      })}
    </div>
  )
}

// Re-export Tooltip for convenience
export { Tooltip as ChartTooltip }
