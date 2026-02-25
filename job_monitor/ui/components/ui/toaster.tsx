/**
 * Toaster wrapper for sonner library.
 * Provides toast notifications without next-themes dependency.
 */
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      className="toaster group"
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast bg-background text-foreground border-border shadow-lg",
          description: "text-muted-foreground",
          error: "bg-red-50 border-red-200 text-red-800",
          warning: "bg-orange-50 border-orange-200 text-orange-800",
        },
      }}
    />
  );
}
