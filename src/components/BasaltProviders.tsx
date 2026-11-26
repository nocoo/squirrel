import type { ReactNode } from "react";
import { Link } from "react-router";
import { ThemeProvider, TooltipProvider, LinkProvider, Toaster } from "@nocoo/basalt";
import { AccentProvider } from "@nocoo/basalt/providers/accent";

const PALETTE_OVERRIDES = {
  primary: {
    light: "32 95% 44%",
    dark: "38 92% 55%",
  },
} as const;

function AppRouterLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link to={href} className={className}>
      {children}
    </Link>
  );
}

export function BasaltProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultTheme="system" storageKey="theme">
      <AccentProvider defaultAccent="primary" paletteOverrides={PALETTE_OVERRIDES}>
        <LinkProvider render={AppRouterLink}>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </LinkProvider>
      </AccentProvider>
    </ThemeProvider>
  );
}
