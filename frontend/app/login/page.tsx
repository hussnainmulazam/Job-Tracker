"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Briefcase,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";

import { setAuthToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── Validation Schema ────────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/dashboard";

  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);

    try {
      // 1. Post credentials to Next.js route handler
      // This sets the secure httpOnly cookie 'auth_token' on the response
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg =
          typeof data.detail === "string"
            ? data.detail
            : Array.isArray(data.detail)
            ? data.detail.map((e: any) => e.msg || JSON.stringify(e)).join(", ")
            : "Authentication failed. Please verify your credentials.";
        setServerError(errorMsg);
        return;
      }

      // 2. Persist access token in localStorage for client-side API requests
      if (data.access_token) {
        setAuthToken(data.access_token);
      }

      // 3. Redirect user to destination or dashboard
      window.location.href = redirectPath;
    } catch (err) {
      setServerError("Unable to connect to authentication service. Please check your network or try again.");
    }
  };

  return (
    <Card className="w-full max-w-md shadow-lg border-slate-200 dark:border-slate-800">
      <CardHeader className="space-y-2 text-center pb-6">
        <div className="mx-auto h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md mb-2">
          <Briefcase className="h-6 w-6" />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">
          Welcome back
        </CardTitle>
        <CardDescription className="text-sm">
          Enter your email and password to access your application dashboard
        </CardDescription>
      </CardHeader>

      <CardContent>
        {serverError && (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="flex-1 font-medium">{serverError}</div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="developer@example.com"
                className={`pl-9 ${errors.email ? "border-red-500 focus-visible:ring-red-400" : ""}`}
                {...register("email")}
                disabled={isSubmitting}
              />
            </div>
            {errors.email && (
              <p className="text-[11px] text-red-500 font-medium">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-semibold">
                Password
              </Label>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                className={`pl-9 pr-10 ${errors.password ? "border-red-500 focus-visible:ring-red-400" : ""}`}
                {...register("password")}
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground focus:outline-none"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-[11px] text-red-500 font-medium">
                {errors.password.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full mt-2 font-medium"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                Sign In
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col space-y-3 pt-2 text-center text-xs text-muted-foreground border-t">
        <p>
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-semibold text-blue-600 hover:text-blue-500 hover:underline dark:text-blue-400"
          >
            Create an account
          </Link>
        </p>
        <Link
          href="/"
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back to home
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            Loading authentication form...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}

