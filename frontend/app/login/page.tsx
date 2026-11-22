"use client";

import React, { useState, useEffect, Suspense } from "react";
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
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
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

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setServerError(decodeURIComponent(errorParam));
    }
  }, [searchParams]);

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
    <Card className="w-full max-w-md shadow-card border-border/70 dark:border-white/[0.08] rounded-2xl bg-card">
      <CardHeader className="space-y-2 text-center pb-6">
        <div className="flex flex-col items-center justify-center mb-1">
          <img
            src="/brand/hiring-loop-logo.svg"
            alt="Hiring Loop"
            className="h-9 w-auto dark:hidden block object-contain"
          />
          <img
            src="/brand/hiring-loop-logo-dark.svg"
            alt="Hiring Loop"
            className="h-9 w-auto hidden dark:block object-contain"
          />
        </div>
        <CardTitle className="text-xl font-bold tracking-tight text-foreground">
          Welcome back
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          Hire faster, with you in control.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {serverError && (
          <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{serverError}</div>
          </div>
        )}

        {/* ── Continue with Google ────────────────────────────────────── */}
        <div className="space-y-4 mb-4">
          <GoogleAuthButton
            onError={(msg) => setServerError(msg)}
            disabled={isSubmitting}
          />

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/80" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase">
              <span className="bg-card px-2.5 text-muted-foreground font-semibold">
                or
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-medium text-foreground">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="recruiter@company.com"
                className={`pl-9 ${errors.email ? "border-destructive focus-visible:ring-destructive" : ""}`}
                {...register("email")}
                disabled={isSubmitting}
              />
            </div>
            {errors.email && (
              <p className="text-[11px] text-destructive font-medium">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-medium text-foreground">
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
                className={`pl-9 pr-10 ${errors.password ? "border-destructive focus-visible:ring-destructive" : ""}`}
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
              <p className="text-[11px] text-destructive font-medium">
                {errors.password.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full mt-2 font-medium shadow-xs"
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

      <CardFooter className="flex flex-col space-y-3 pt-2 text-center text-xs text-muted-foreground border-t border-border/70">
        <p>
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-primary hover:underline"
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Loading authentication form...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}

