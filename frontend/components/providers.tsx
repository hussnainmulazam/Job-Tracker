"use client";

import React, { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./theme-provider";
import { Toaster } from "@/components/ui/toaster";

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60, // 1 minute
            retry: (failureCount, error: any) => {
              if (
                error?.status === 401 ||
                error?.status === 403 ||
                error?.statusCode === 401 ||
                error?.message?.includes("401")
              ) {
                return false;
              }
              return failureCount < 1;
            },
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ThemeProvider defaultTheme="system">
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
