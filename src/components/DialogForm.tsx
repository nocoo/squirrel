import { clsx } from "clsx";
import type { ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";

export function DialogForm({ className, ...props }: ComponentPropsWithoutRef<"form">) {
  return (
    <form
      className={twMerge(clsx("mt-basalt-layout space-y-basalt-layout", className))}
      {...props}
    />
  );
}

export function DialogBody({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={twMerge(clsx("mt-basalt-layout space-y-basalt-layout-sm", className))}
      {...props}
    />
  );
}
