"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Kanban,
  Calendar,
  Briefcase,
  Sparkles,
  Scale,
  Settings,
  Search,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Plus,
  User as UserIcon,
  LogOut,
  Users,
  MessageSquare,
  Mail,
  Clock,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "./command-palette";
import { NotificationPopover } from "./notification-popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { AddCandidateDialog } from "@/components/candidates/add-candidate-dialog";
import { CreateOpeningDialog } from "@/components/openings/create-opening-dialog";
import { jobOpeningsApi, removeAuthToken, apiFetch } from "@/lib/api";

interface UserProfile {
  id: string;
  email: string;
  created_at: string;
}

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    badge: null,
  },
  {
    label: "Pipeline",
    href: "/pipeline",
    icon: Kanban,
    badge: null,
  },
  {
    label: "Recruiting Inbox",
    href: "/inbox",
    icon: Mail,
    badge: null,
  },
  {
    label: "Outreach Agent",
    href: "/outreach",
    icon: Send,
    badge: "AI",
  },
  {
    label: "Interviews",
    href: "/interviews",
    icon: Calendar,
    badge: null,
  },
  {
    label: "Availability",
    href: "/availability",
    icon: Clock,
    badge: null,
  },
  {
    label: "Requisitions",
    href: "/openings",
    icon: Briefcase,
    badge: null,
  },
  {
    label: "AI Screening",
    href: "/screening",
    icon: Sparkles,
    badge: "AI",
  },
  {
    label: "Compare",
    href: "/compare",
    icon: Scale,
    badge: null,
  },
  {
    label: "Agent Status",
    href: "/agent",
    icon: Sparkles,
    badge: "Live",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    badge: null,
  },
];

export function AppShell({
  children,
  title,
  actions,
}: {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [createOpeningOpen, setCreateOpeningOpen] = useState(false);

  // Read sidebar preference from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("recruiter-sidebar-collapsed");
      if (stored !== null) {
        setCollapsed(stored === "true");
      }
    } catch {
      // storage unavailable
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("recruiter-sidebar-collapsed", String(next));
      } catch {
        // storage unavailable
      }
      return next;
    });
  };

  // Fetch current user info
  const { data: user } = useQuery<UserProfile>({
    queryKey: ["current-user"],
    queryFn: async () => {
      return apiFetch<UserProfile>("/api/v1/auth/me");
    },
    retry: false,
  });

  // Fetch job openings for global add candidate dialog
  const { data: openingsData } = useQuery({
    queryKey: ["job-openings"],
    queryFn: () => jobOpeningsApi.list(),
  });
  const openings = openingsData?.items || [];

  const handleLogout = async () => {
    try {
      removeAuthToken();
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      {/* ── Desktop Collapsible Sidebar ───────────────────────────── */}
      <aside
        className={`hidden md:flex flex-col border-r border-border bg-card/60 backdrop-blur-md transition-all duration-300 ease-in-out shrink-0 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between px-3 border-b border-border/80">
          {!collapsed && (
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 font-bold text-sm tracking-tight hover:opacity-90 transition-opacity"
            >
              <div className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-black text-xs shadow-xs">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="truncate leading-none text-foreground font-extrabold">TalentFlow</span>
                <span className="text-[10px] text-muted-foreground font-semibold leading-tight mt-0.5">Recruiting AI Copilot</span>
              </div>
            </Link>
          )}

          {collapsed && (
            <Link
              href="/dashboard"
              className="mx-auto h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs shadow-xs"
              title="TalentFlow Copilot"
            >
              <Sparkles className="h-4 w-4" />
            </Link>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground ml-auto hidden md:inline-flex"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Quick Add Button */}
        <div className="p-2.5">
          <Button
            id="btn-sidebar-add-candidate"
            onClick={() => setAddCandidateOpen(true)}
            size="sm"
            className={`w-full justify-start text-xs font-semibold shadow-xs transition-all ${
              collapsed ? "px-0 justify-center h-8" : "h-8 px-2.5 gap-2"
            }`}
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && <span>Add Candidate</span>}
          </Button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center rounded-lg text-xs font-medium transition-all ${
                  collapsed ? "justify-center h-9 px-0" : "px-2.5 py-2 gap-2.5"
                } ${
                  isActive
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-105 ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                {!collapsed && (
                  <span className="truncate flex-1">{item.label}</span>
                )}
                {!collapsed && item.badge && (
                  <span className="ml-auto text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    {item.badge}
                  </span>
                )}
                {/* Active left indicator */}
                {isActive && (
                  <motion.div
                    layoutId="activeNavIndicator"
                    className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Profile Pill at Bottom of Sidebar */}
        <div className="border-t border-border p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex w-full items-center rounded-lg p-1.5 text-xs text-left transition-colors hover:bg-accent ${
                  collapsed ? "justify-center" : "gap-2"
                }`}
              >
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center font-bold text-xs text-muted-foreground shrink-0 border border-border">
                  {user?.email ? user.email.charAt(0).toUpperCase() : <UserIcon className="h-3.5 w-3.5" />}
                </div>
                {!collapsed && (
                  <div className="flex-1 truncate">
                    <p className="font-semibold text-foreground truncate leading-tight">
                      {user?.email?.split("@")[0] || "Recruiter"}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate leading-tight">
                      {user?.email || "Signed in"}
                    </p>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="right" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-xs font-semibold leading-none text-foreground">{user?.email}</p>
                  <p className="text-[10px] leading-none text-muted-foreground">
                    Supabase PostgreSQL Connected
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <Settings className="mr-2 h-3.5 w-3.5" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCommandPaletteOpen(true)}>
                <Search className="mr-2 h-3.5 w-3.5" />
                <span>Command Menu</span>
                <span className="ml-auto text-[10px] text-muted-foreground font-mono">⌘K</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-3.5 w-3.5" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* ── Main Content Area ────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top App Bar */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card/40 px-4 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile menu trigger */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden h-8 w-8 p-0"
              aria-label="Open mobile menu"
            >
              <Menu className="h-4 w-4" />
            </Button>

            {/* Breadcrumb / Title */}
            <div>
              <h1 className="text-sm font-bold tracking-tight text-foreground">
                {title || "Recruiting Copilot"}
              </h1>
            </div>
          </div>

          {/* Right Header Utilities: Search Palette, Theme, User */}
          <div className="flex items-center gap-2">
            {/* Quick Search Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCommandPaletteOpen(true)}
              className="h-8 gap-2 px-2.5 text-xs text-muted-foreground hover:text-foreground hidden sm:inline-flex"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search talent, requisitions...</span>
              <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-0.5 rounded border border-border bg-muted px-1 font-mono text-[9px] font-medium text-muted-foreground">
                ⌘K
              </kbd>
            </Button>

            {/* Custom page actions */}
            {actions}

            <NotificationPopover />

            <ThemeToggle />

            {/* User Dropdown for Mobile / Top Bar */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 rounded-full p-0 border border-border">
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                    {user?.email ? user.email.charAt(0).toUpperCase() : "R"}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="font-normal text-xs text-muted-foreground truncate">
                  {user?.email || "My Account"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/settings")}>
                  <Settings className="mr-2 h-3.5 w-3.5" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Dynamic Page Content with Entrance Animation */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="mx-auto max-w-7xl h-full"
          >
            {children}
          </motion.div>
        </main>
      </div>

      {/* ── Mobile Sidebar Drawer ─────────────────────────────────── */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-64 max-w-[80vw] bg-card border-r border-border h-full flex flex-col p-4 shadow-xl z-50"
            >
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <span className="font-bold text-sm text-foreground">TalentFlow</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileMenuOpen(false)}
                  className="h-7 w-7 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="py-3">
                <Button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setAddCandidateOpen(true);
                  }}
                  size="sm"
                  className="w-full gap-2 text-xs font-semibold"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Candidate</span>
                </Button>
              </div>

              <nav className="flex-1 space-y-1 overflow-y-auto">
                {NAV_ITEMS.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-accent text-accent-foreground font-semibold"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate flex-1">{item.label}</span>
                      {item.badge && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>

              <div className="border-t border-border pt-3 mt-auto">
                <div className="flex items-center justify-between">
                  <div className="truncate">
                    <p className="text-xs font-bold text-foreground truncate">
                      {user?.email?.split("@")[0] || "Recruiter"}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {user?.email}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onOpenAddCandidate={() => setAddCandidateOpen(true)}
        onOpenCreateOpening={() => setCreateOpeningOpen(true)}
      />

      {/* Global Add Candidate Dialog */}
      <AddCandidateDialog
        open={addCandidateOpen}
        onClose={() => setAddCandidateOpen(false)}
        openings={openings}
      />

      {/* Global Create Opening Dialog */}
      <CreateOpeningDialog
        open={createOpeningOpen}
        onClose={() => setCreateOpeningOpen(false)}
      />
    </div>
  );
}
