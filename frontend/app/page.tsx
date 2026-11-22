"use client";

import React from "react";
import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  Kanban,
  FileText,
  Briefcase,
  Scale,
  Award,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between selection:bg-primary/20 selection:text-primary">
      {/* Navbar */}
      <header className="border-b border-border bg-card/60 backdrop-blur-md sticky top-0 z-40">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
            <img
              src="/brand/hiring-loop-logo.svg"
              alt="Hiring Loop"
              className="h-8 w-auto dark:hidden block object-contain"
            />
            <img
              src="/brand/hiring-loop-logo-dark.svg"
              alt="Hiring Loop"
              className="h-8 w-auto hidden dark:block object-contain"
            />
          </Link>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-xs h-8">
                Sign In
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="text-xs h-8 font-semibold shadow-xs">
                Start Screening
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 container mx-auto px-4 flex flex-col items-center justify-center py-16 text-center max-w-3xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary text-xs font-semibold mb-6">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Hire faster, with you in control.</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-foreground leading-tight sm:leading-tight">
          Screen top talent with AI-powered skill matching & ranking.
        </h1>

        <p className="text-sm sm:text-base text-muted-foreground mt-4 max-w-xl leading-relaxed">
          Upload PDF resumes with native text extraction, automatically compute skill fit scores (0-100), generate tailored interview questions, and manage recruitment pipeline on a smooth Kanban board.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 mt-8">
          <Link href="/register">
            <Button size="lg" className="text-xs h-10 px-5 gap-2 shadow-sm font-bold">
              <span>Create Recruiter Account</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" size="lg" className="text-xs h-10 px-5 font-semibold">
              <span>Sign In to Dashboard</span>
            </Button>
          </Link>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-16 text-left w-full">
          <div className="p-4 rounded-xl border border-border bg-card shadow-2xs">
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
              <Kanban className="h-4 w-4" />
            </div>
            <h3 className="text-xs font-bold text-foreground">Pipeline Kanban</h3>
            <p className="text-[11px] text-muted-foreground mt-1">
              Drag-and-drop candidates across Applied, Screening, Interview, Offer, and Rejected stages with optimistic updates.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card shadow-2xs">
            <div className="h-8 w-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3">
              <Sparkles className="h-4 w-4" />
            </div>
            <h3 className="text-xs font-bold text-foreground">AI Fit & Bulk Scoring</h3>
            <p className="text-[11px] text-muted-foreground mt-1">
              Extract PDF resumes, score matched vs missing skills, identify red flags, and rank entire candidate pools in seconds.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card shadow-2xs">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
              <Scale className="h-4 w-4" />
            </div>
            <h3 className="text-xs font-bold text-foreground">Side-by-Side Compare</h3>
            <p className="text-[11px] text-muted-foreground mt-1">
              Directly contrast candidate skill intersections, score rings, scorecard ratings, and AI summaries to pick top finalists.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-medium">Hiring Loop — Hire faster, with you in control.</span>
          <div className="flex items-center gap-4 text-[11px]">
            <span>FastAPI</span>
            <span>•</span>
            <span>Supabase PostgreSQL</span>
            <span>•</span>
            <span>OpenRouter AI</span>
            <span>•</span>
            <span>pypdf</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
