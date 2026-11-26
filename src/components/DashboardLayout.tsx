import { ContentIsland, LayerCard, SidebarDrawer } from "@nocoo/basalt";
import { AppHeader, AppHeaderMenuButton, ProjectLinks } from "@nocoo/basalt/components/app-header";
import { AppMain, AppShell, AppSkipLink } from "@nocoo/basalt/components/app-shell";
import { ThemeToggle } from "@nocoo/basalt/components/theme-toggle";
import { type ReactNode, Suspense, useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router";
import { AppSidebar, PersistedSidebarProvider } from "@/components/AppSidebar";
import { useIsMobile } from "@/hooks/use-mobile";

export const PAGE_TITLES: Record<string, string> = {
  "/admin": "概览",
  "/admin/secrets": "密钥库",
  "/admin/clients": "客户端与凭证",
  "/admin/logs": "审计日志",
};

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawerId = useId();

  const normalized = pathname === "/admin/" ? "/admin" : pathname;
  const title = PAGE_TITLES[normalized] ?? "概览";
  const breadcrumbs: { href?: string; label: ReactNode }[] = [
    { href: "/admin", label: "Squirrel" },
  ];

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname triggers close on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobile && mobileOpen) {
      setMobileOpen(false);
    }
  }, [isMobile, mobileOpen]);

  return (
    <AppShell>
      <AppSkipLink href="#main-content">跳至主内容</AppSkipLink>

      {!isMobile && (
        <PersistedSidebarProvider>
          <AppSidebar ariaLabel="主导航" />
        </PersistedSidebarProvider>
      )}

      {isMobile && (
        <SidebarDrawer
          id={drawerId}
          open={mobileOpen}
          onOpenChange={setMobileOpen}
          returnFocusRef={menuButton}
          title="导航菜单"
          description="浏览 Squirrel 密钥托管后台"
        >
          <AppSidebar
            ariaLabel="主导航抽屉"
            variant="mobile"
            onNavigate={() => setMobileOpen(false)}
            onDismiss={() => setMobileOpen(false)}
          />
        </SidebarDrawer>
      )}

      <AppMain>
        <AppHeader
          leading={
            isMobile ? (
              <AppHeaderMenuButton
                ref={menuButton}
                label="打开导航菜单"
                aria-expanded={mobileOpen}
                aria-haspopup="dialog"
                aria-controls={drawerId}
                onClick={() => setMobileOpen(true)}
              />
            ) : null
          }
          breadcrumbs={breadcrumbs}
          breadcrumbsLabel="面包屑导航"
          title={title}
          actions={
            <>
              <ProjectLinks github="nocoo/squirrel" hexly="squirrel" name="Squirrel" />
              <ThemeToggle
                labels={{
                  light: "切换至浅色主题",
                  dark: "切换至深色主题",
                  system: "跟随系统主题",
                }}
              />
            </>
          }
        />

        <div className="flex min-h-0 flex-1 flex-col px-basalt-space-lg pb-basalt-space-lg md:px-basalt-layout-sm md:pb-basalt-layout-sm">
          <ContentIsland>
            <Suspense key={pathname} fallback={<LayerCard.Loading label="页面加载中..." />}>
              {children}
            </Suspense>
          </ContentIsland>
        </div>
      </AppMain>
    </AppShell>
  );
}
