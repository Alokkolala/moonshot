import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full rounded-lg border border-border bg-input/40 px-3.5 py-2 text-sm text-foreground shadow-sm transition-colors",
        "placeholder:text-muted-foreground/70",
        "focus-visible:outline-none focus-visible:border-ring/70 focus-visible:ring-[3px] focus-visible:ring-ring/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Input };
