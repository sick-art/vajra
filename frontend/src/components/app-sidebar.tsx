import * as React from "react"
import { NavLink, useMatch } from "react-router-dom"
import {
  LayoutDashboard,
  Workflow,
  Database,
  Search,
  BarChart3,
  FileText,
  Settings,
  Layers,
  Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { ConnectionStatus } from "@/components/connection-status"

const navItems = [
  {
    group: null,
    items: [
      { title: "Dashboard",   icon: LayoutDashboard, path: "/" },
      { title: "Workflows",   icon: Workflow,        path: "/workflows" },
      { title: "Pipeline",    icon: Zap,             path: "/pipeline" },
      { title: "Collections", icon: Database,        path: "/collections" },
      { title: "Query",       icon: Search,          path: "/query" },
    ],
  },
  {
    group: "Evaluation",
    items: [
      { title: "Runs",     icon: BarChart3, path: "/eval" },
      { title: "Datasets", icon: FileText,  path: "/eval/datasets" },
    ],
  },
  {
    group: "Configuration",
    items: [
      { title: "Settings", icon: Settings, path: "/settings" },
    ],
  },
]

function NavItem({ title, icon: Icon, path }: { title: string; icon: LucideIcon; path: string }) {
  const match = useMatch({ path, end: path === "/" })
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={!!match}
        render={<NavLink to={path} end={path === "/"} />}
      >
        <Icon className="h-4 w-4" />
        <span>{title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <Layers className="h-5 w-5 text-primary" />
          <span className="text-base font-semibold tracking-tight">VectorHouse</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {navItems.map((group) => (
          <SidebarGroup key={group.group ?? "main"}>
            {group.group && <SidebarGroupLabel>{group.group}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <NavItem key={item.title} {...item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        <div className="flex items-center justify-between px-2 py-2">
          <ConnectionStatus />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Theme</span>
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[0.6rem]">
              D
            </kbd>
          </div>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
