"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { jobOpeningsApi, JobOpeningStatus } from "@/lib/api";
import { Loader2, Plus, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface CreateOpeningDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const formSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  status: z.enum(["draft", "active", "paused", "closed"]),
  pass_mark: z.coerce.number().min(1, "Pass mark must be at least 1").max(100, "Pass mark cannot exceed 100").default(80),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateOpeningDialog({
  open,
  onClose,
  onSuccess,
}: CreateOpeningDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [skills, setSkills] = useState<string[]>(["Python", "FastAPI", "PostgreSQL"]);
  const [newSkillInput, setNewSkillInput] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "active",
      pass_mark: 80,
    },
  });

  const handleAddSkill = (e?: React.SyntheticEvent) => {
    if (e && e.type === "keydown" && (e as React.KeyboardEvent).key !== "Enter") {
      return;
    }
    e?.preventDefault();
    e?.stopPropagation();
    const clean = newSkillInput.trim();
    if (clean && !skills.includes(clean)) {
      setSkills((prev) => [...prev, clean]);
      setNewSkillInput("");
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills((prev) => prev.filter((s) => s !== skillToRemove));
  };

  const onSubmit = async (values: FormValues) => {
    try {
      await jobOpeningsApi.create({
        ...values,
        required_skills: skills,
      });

      toast({
        title: "Job Opening Created",
        description: `"${values.title}" has been published.`,
      });

      queryClient.invalidateQueries({ queryKey: ["job-openings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      reset();
      onClose();
      onSuccess?.();
    } catch (err: any) {
      toast({
        title: "Creation Failed",
        description: err.message || "Failed to create job opening.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">New Job Requisition</DialogTitle>
          <DialogDescription className="text-xs">
            Define requirements and required skills used by AI for candidate scoring.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="title" className="text-xs font-medium">
              Role Title *
            </Label>
            <Input
              id="title"
              placeholder="e.g. Senior Machine Learning Engineer"
              {...register("title")}
              className="text-xs"
            />
            {errors.title && (
              <p className="text-[10px] text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="status" className="text-xs font-medium">
                Initial Status
              </Label>
              <select
                id="status"
                {...register("status")}
                className="w-full text-xs font-medium h-9 px-3 rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="active">Active (Open for applications)</option>
                <option value="draft">Draft (Private)</option>
                <option value="paused">Paused (On hold)</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pass_mark" className="text-xs font-medium flex items-center justify-between">
                <span>Pass Mark (%)</span>
                <span className="text-[10px] text-muted-foreground font-normal">Default: 80</span>
              </Label>
              <Input
                id="pass_mark"
                type="number"
                min={1}
                max={100}
                {...register("pass_mark")}
                className="text-xs"
                placeholder="80"
              />
              {errors.pass_mark && (
                <p className="text-[10px] text-destructive">{errors.pass_mark.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs font-medium">
              Job Description & Responsibilities *
            </Label>
            <Textarea
              id="description"
              rows={4}
              placeholder="Outline primary duties, core responsibilities, architecture challenges..."
              {...register("description")}
              className="text-xs resize-none"
            />
            {errors.description && (
              <p className="text-[10px] text-destructive">{errors.description.message}</p>
            )}
          </div>

          {/* Required Skills Tag Editor */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">
              Required Skills (used for AI match calculation)
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add skill (e.g. Kubernetes, TypeScript)..."
                value={newSkillInput}
                onChange={(e) => setNewSkillInput(e.target.value)}
                onKeyDown={handleAddSkill}
                className="text-xs flex-1"
              />
              <Button
                id="btn-add-skill"
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddSkill}
                className="text-xs gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-lg border border-border bg-muted/20">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(skill)}
                    className="hover:text-destructive focus:outline-none"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {skills.length === 0 && (
                <span className="text-xs text-muted-foreground italic">
                  No skills added. Add at least 1-3 skills for optimal AI screening.
                </span>
              )}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="text-xs font-semibold gap-2"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isSubmitting ? "Creating..." : "Create Requisition"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
