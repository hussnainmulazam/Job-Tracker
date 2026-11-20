"use client";

import React, { useState, useEffect } from "react";
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
import { jobOpeningsApi, JobOpening, JobOpeningStatus } from "@/lib/api";
import { Loader2, Plus, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface EditOpeningDialogProps {
  opening: JobOpening | null;
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

export function EditOpeningDialog({
  opening,
  open,
  onClose,
  onSuccess,
}: EditOpeningDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [skills, setSkills] = useState<string[]>([]);
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

  useEffect(() => {
    if (opening) {
      reset({
        title: opening.title,
        description: opening.description || "",
        status: opening.status,
        pass_mark: opening.pass_mark ?? 80,
      });
      setSkills(opening.required_skills || []);
    }
  }, [opening, reset]);

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
    if (!opening) return;
    try {
      await jobOpeningsApi.update(opening.id, {
        ...values,
        pass_mark: values.pass_mark,
        required_skills: skills,
      });

      toast({
        title: "Requisition Updated",
        description: `"${values.title}" has been updated.`,
      });

      queryClient.invalidateQueries({ queryKey: ["job-openings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      onClose();
      onSuccess?.();
    } catch (err: any) {
      toast({
        title: "Update Failed",
        description: err.message || "Failed to update job opening.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Edit Job Requisition</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Update role title, requirements, status, and required skills for candidate scoring.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-title" className="text-xs font-medium">
              Role Title *
            </Label>
            <Input
              id="edit-title"
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
              <Label htmlFor="edit-status" className="text-xs font-medium">
                Status
              </Label>
              <select
                id="edit-status"
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
              <Label htmlFor="edit-pass-mark" className="text-xs font-medium flex items-center justify-between">
                <span>Pass Mark (%)</span>
                <span className="text-[10px] text-muted-foreground font-normal">Default: 80</span>
              </Label>
              <Input
                id="edit-pass-mark"
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
            <Label htmlFor="edit-description" className="text-xs font-medium">
              Job Description & Responsibilities *
            </Label>
            <Textarea
              id="edit-description"
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

            <div className="flex flex-wrap gap-1.5 pt-1">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-medium"
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
                <span className="text-[11px] text-muted-foreground italic">
                  No required skills added.
                </span>
              )}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
