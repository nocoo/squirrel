import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Sidebar as BasaltSidebar,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPalette,
  SidebarBrand,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarIconItem,
  SidebarItem,
  SidebarNav,
  SidebarProvider,
  SidebarSearch,
  SidebarToggle,
  SidebarUser,
} from "@nocoo/basalt";
import { useSidebar } from "@nocoo/basalt/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@nocoo/basalt/components/tooltip";
import { Bot, KeyRound, LayoutDashboard, type LucideIcon, ScrollText } from "@nocoo/basalt/icons";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { getUserDisplay } from "@/lib/user-display";
import { APP_VERSION } from "@/lib/version";
import { useMe } from "@/viewmodels/useMe";

const ACCESS_LOGOUT_URL = "/cdn-cgi/access/logout";
const SIDEBAR_COLLAPSED_KEY = "squirrel:sidebar-collapsed";
type SidebarCollapsedPreference = "false" | "true";

interface NavItem {
  title: string;
  icon: LucideIcon;
  path: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "控制台",
    items: [
      { title: "概览", icon: LayoutDashboard, path: "/admin" },
      { title: "密钥库", icon: KeyRound, path: "/admin/secrets" },
      { title: "客户端与凭证", icon: Bot, path: "/admin/clients" },
    ],
  },
  {
    label: "安全",
    items: [{ title: "审计日志", icon: ScrollText, path: "/admin/logs" }],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function isActive(pathname: string, path: string): boolean {
  if (path === "/admin") {
    return pathname === "/admin" || pathname === "/admin/";
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}

function usePersistedSidebarCollapsed(
  key: string,
  defaultValue: SidebarCollapsedPreference,
): [SidebarCollapsedPreference, (value: SidebarCollapsedPreference) => void] {
  const [stored, setStored] = useState<SidebarCollapsedPreference>(() => {
    if (typeof window === "undefined") return defaultValue;
    const value = localStorage.getItem(key);
    return value === "true" || value === "false" ? value : defaultValue;
  });

  const setValue = useCallback(
    (next: SidebarCollapsedPreference) => {
      setStored(next);
      localStorage.setItem(key, next);
    },
    [key],
  );

  return [stored, setValue];
}

export function PersistedSidebarProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = usePersistedSidebarCollapsed(SIDEBAR_COLLAPSED_KEY, "false");
  const collapsed = stored === "true";
  const onCollapsedChange = useCallback(
    (next: boolean) => {
      setStored(next ? "true" : "false");
    },
    [setStored],
  );

  return (
    <SidebarProvider collapsed={collapsed} onCollapsedChange={onCollapsedChange}>
      {children}
    </SidebarProvider>
  );
}

interface SidebarProps {
  ariaLabel: string;
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
  onDismiss?: () => void;
}

function SquirrelSidebarBody({
  variant,
  onNavigate,
  onDismiss,
}: {
  variant?: SidebarProps["variant"];
  onNavigate?: () => void;
  onDismiss?: () => void;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { data: meUser } = useMe();
  const { collapsed, peek, peeking } = useSidebar();
  const railCollapsed = collapsed && !(peek && peeking);
  const [searchOpen, setSearchOpen] = useState(false);
  const {
    name: userName,
    initial,
    email: userEmail,
    avatar: userAvatarUrl,
  } = getUserDisplay(meUser);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelect = useCallback(
    (path: string) => {
      setSearchOpen(false);
      navigate(path);
      onNavigate?.();
    },
    [navigate, onNavigate],
  );

  const avatar = (
    <Avatar>
      {userAvatarUrl ? <AvatarImage src={userAvatarUrl} alt={userName} /> : null}
      <AvatarFallback className="text-basalt-sm">{initial}</AvatarFallback>
    </Avatar>
  );

  return (
    <>
      <SidebarHeader>
        <SidebarBrand
          logo={<img src="/logo-48.png" alt="" width={24} height={24} />}
          name="Squirrel"
          version={`v${APP_VERSION}`}
          action={
            variant === "mobile" ? (
              <SidebarToggle
                mode="dismiss"
                dismissLabel="关闭导航菜单"
                {...(onDismiss ? { onDismiss } : {})}
              />
            ) : (
              <SidebarToggle expandLabel="展开侧边栏" collapseLabel="收起侧边栏" />
            )
          }
        />
      </SidebarHeader>
      <SidebarNav>
        <SidebarSearch
          shortcut="⌘K"
          onClick={(event) => {
            event.preventDefault();
            setSearchOpen(true);
          }}
        >
          搜索
        </SidebarSearch>
        {railCollapsed
          ? ALL_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.path);
              return (
                <Tooltip key={item.path} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <SidebarIconItem
                      href={item.path}
                      active={active}
                      aria-label={item.title}
                      onClick={onNavigate}
                    >
                      <Icon className="size-basalt-icon-lg" strokeWidth={1.5} aria-hidden="true" />
                    </SidebarIconItem>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {item.title}
                  </TooltipContent>
                </Tooltip>
              );
            })
          : NAV_GROUPS.map((group) => (
              <SidebarGroup key={group.label} label={group.label}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item.path);
                  return (
                    <SidebarItem
                      key={item.path}
                      href={item.path}
                      active={active}
                      onClick={onNavigate}
                    >
                      <Icon
                        className="size-basalt-icon-lg shrink-0"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      <span className="flex-1 truncate text-left">{item.title}</span>
                    </SidebarItem>
                  );
                })}
              </SidebarGroup>
            ))}
      </SidebarNav>
      <SidebarFooter>
        <SidebarUser
          name={userName}
          email={userEmail || undefined}
          avatar={avatar}
          tooltip={userName}
          signOutHref={ACCESS_LOGOUT_URL}
          signOutLabel="退出登录"
        />
      </SidebarFooter>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="搜索页面..." />
        <CommandList>
          <CommandEmpty>未找到结果</CommandEmpty>
          {NAV_GROUPS.map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.path}
                  value={item.title}
                  onSelect={() => handleSelect(item.path)}
                >
                  <item.icon
                    className="size-basalt-icon-lg text-basalt-muted-foreground"
                    strokeWidth={1.5}
                  />
                  <span>{item.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandPalette>
    </>
  );
}

export function AppSidebar({
  ariaLabel,
  variant = "desktop",
  onNavigate,
  onDismiss,
}: SidebarProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <BasaltSidebar aria-label={ariaLabel} resizable={false}>
        <SquirrelSidebarBody
          variant={variant}
          {...(onNavigate ? { onNavigate } : {})}
          {...(onDismiss ? { onDismiss } : {})}
        />
      </BasaltSidebar>
    </TooltipProvider>
  );
}
