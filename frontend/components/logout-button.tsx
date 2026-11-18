"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { removeAuthToken } from "@/lib/api";
import { Button, type ButtonProps } from "@/components/ui/button";

interface LogoutButtonProps extends Omit<ButtonProps, "onClick"> {
  showIcon?: boolean;
}

export function LogoutButton({
  children = "Sign Out",
  showIcon = true,
  variant = "outline",
  size = "sm",
  className,
  ...props
}: LogoutButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    try {
      setIsLoading(true);
      // Call Next.js route handler to clear the httpOnly cookie
      await fetch("/api/auth/logout", {
        method: "POST",
      });
      // Purge any client-side localStorage token
      removeAuthToken();
      // Redirect to login page and refresh routing tree
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleLogout}
      disabled={isLoading}
      {...props}
    >
      {showIcon && <LogOut className="h-4 w-4 mr-2" />}
      {isLoading ? "Signing out..." : children}
    </Button>
  );
}

