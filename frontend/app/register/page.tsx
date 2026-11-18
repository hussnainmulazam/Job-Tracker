"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  CheckCircle2,
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

// ── Registration Validation Schema ──────────────────────────────────────────
const registerSchema = z
  .object({
    email: z
      .string()
      .min(1, "Email is required")
      .email("Please provide a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long"),
    confirmPassword: z
      .string()
      .min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const currentPassword = watch("password");

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null);

    try {
      // 1. Post registration details to Next.js route handler
      // This forwards to FastAPI /api/v1/auth/register and sets the httpOnly cookie
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg =
          typeof data.detail === "string"
            ? data.detail
            : Array.isArray(data.detail)
            ? data.detail.map((e: any) => e.msg || JSON.stringify(e)).join(", ")
            : "Registration failed. That email might already be in use.";
        setServerError(errorMsg);
        return;
      }

      // 2. Persist access token in localStorage for client-side API requests
      if (data.access_token) {
        setAuthToken(data.access_token);
      }

      // 3. Navigate directly to dashboard
      window.location.href = "/dashboard";
    } catch (err) {
      setServerError(
        "Unable to connect to registration service. Please verify your internet connection."
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      <Card className="w-full max-w-md shadow-lg border-slate-200 dark:border-slate-800">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="mx-auto h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md mb-2">
            <Briefcase className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            Create an account
          </CardTitle>
          <CardDescription className="text-sm">
            Start tracking job applications and tailoring CVs with AI
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
            {/* Email Field */}
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
                  placeholder="name@company.com"
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

            {/* Password Field */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters"
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
              {/* Password strength hint */}
              {currentPassword && currentPassword.length >= 8 && (
                <p className="text-[11px] text-emerald-600 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Password meets minimum length
                </p>
              )}
            </div>

            {/* Confirm Password Field */}
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-xs font-semibold">
                Confirm Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  className={`pl-9 pr-10 ${errors.confirmPassword ? "border-red-500 focus-visible:ring-red-400" : ""}`}
                  {...register("confirmPassword")}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground focus:outline-none"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-[11px] text-red-500 font-medium">
                  {errors.confirmPassword.message}
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
                  Creating account...
                </>
              ) : (
                <>
                  Create Account
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col space-y-3 pt-2 text-center text-xs text-muted-foreground border-t">
          <p>
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-blue-600 hover:text-blue-500 hover:underline dark:text-blue-400"
            >
              Sign in
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
    </div>
  );
}

