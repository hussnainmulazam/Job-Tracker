"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  candidatesApi,
  JobOpening,
  CandidateExtractionPreviewResponse,
  CandidateConfirmPayload,
} from "@/lib/api";
import {
  Loader2,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Sparkles,
  Check,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  X,
  Trash2,
  GitMerge,
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  GraduationCap,
  Calendar,
  Globe,
  Layers,
  FileCheck,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface AddCandidateDialogProps {
  open: boolean;
  onClose: () => void;
  openings: JobOpening[];
  defaultOpeningId?: string;
  onSuccess?: () => void;
}

interface CandidateReviewItem {
  id: string; // unique local ID
  fileName: string;
  fileSize: number;
  status: "queued" | "extracting" | "done" | "failed";
  errorMessage?: string;
  preview?: CandidateExtractionPreviewResponse;
  // Editable fields
  name: string;
  email: string;
  phone: string;
  address: string;
  current_title: string;
  years_of_experience: string;
  top_skills: string;
  education: string;
  linkedin_url: string;
  github_url: string;
  portfolio_url: string;
  kaggle_url: string;
  other_links: string[];
  cv_text: string;
  cv_file_url?: string | null;
  // Duplicate resolution
  duplicateAction: "create" | "merge" | "skip";
  isConfirmed?: boolean;
}

const LAST_OPENING_KEY = "job_tracker_last_opening_id";
const AUTO_SCREEN_PREF_KEY = "job_tracker_auto_screen_pref";

export function AddCandidateDialog({
  open,
  onClose,
  openings,
  defaultOpeningId,
  onSuccess,
}: AddCandidateDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mode & step
  const [activeTab, setActiveTab] = useState<"upload" | "text">("upload");
  const [step, setStep] = useState<"select" | "progress" | "review">("select");

  // Requisition & Auto-screen settings
  const [selectedOpeningId, setSelectedOpeningId] = useState<string>("");
  const [autoScreen, setAutoScreen] = useState<boolean>(true);

  // Files selected for bulk upload
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pastedCvText, setPastedCvText] = useState<string>("");
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Review queue
  const [reviewItems, setReviewItems] = useState<CandidateReviewItem[]>([]);
  const [currentReviewIndex, setCurrentReviewIndex] = useState<number>(0);
  const [isSubmittingConfirm, setIsSubmittingConfirm] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize selected opening from default or localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedOpening = localStorage.getItem(LAST_OPENING_KEY);
    const validOpening = openings.find((o) => o.id === storedOpening) ? storedOpening : null;
    const initial = defaultOpeningId || validOpening || (openings.length > 0 ? openings[0].id : "");
    setSelectedOpeningId(initial);

    const storedAutoScreen = localStorage.getItem(AUTO_SCREEN_PREF_KEY);
    if (storedAutoScreen !== null) {
      setAutoScreen(storedAutoScreen === "true");
    }
  }, [openings, defaultOpeningId, open]);

  // Persist opening selection
  const handleOpeningChange = (newId: string) => {
    setSelectedOpeningId(newId);
    if (typeof window !== "undefined") {
      localStorage.setItem(LAST_OPENING_KEY, newId);
    }
  };

  const handleAutoScreenToggle = (val: boolean) => {
    setAutoScreen(val);
    if (typeof window !== "undefined") {
      localStorage.setItem(AUTO_SCREEN_PREF_KEY, String(val));
    }
  };

  // Reset dialog state on close
  const handleClose = () => {
    setStep("select");
    setSelectedFiles([]);
    setPastedCvText("");
    setReviewItems([]);
    setCurrentReviewIndex(0);
    setIsSubmittingConfirm(false);
    onClose();
  };

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (files: File[]) => {
    const validFiles: File[] = [];
    for (const f of files) {
      const lower = f.name.toLowerCase();
      if (!lower.endsWith(".pdf") && !lower.endsWith(".docx")) {
        toast({
          title: "Unsupported Format",
          description: `Skipped ${f.name}. Only PDF (.pdf) and Word (.docx) files are supported.`,
          variant: "destructive",
        });
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: `Skipped ${f.name}. File size exceeds 10MB limit.`,
          variant: "destructive",
        });
        continue;
      }
      validFiles.push(f);
    }

    if (validFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...validFiles]);
    }
  };

  const removeSelectedFile = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Step 2: Run Extraction Pipeline ──────────────────────────────────────────

  const startExtraction = async () => {
    if (!selectedOpeningId) {
      toast({
        title: "Requisition Required",
        description: "Please select a target Job Opening first.",
        variant: "destructive",
      });
      return;
    }

    if (activeTab === "upload") {
      if (selectedFiles.length === 0) {
        toast({
          title: "No CVs Selected",
          description: "Please drop or select at least one CV file.",
          variant: "destructive",
        });
        return;
      }

      // Initialize review items in queued state
      const initialItems: CandidateReviewItem[] = selectedFiles.map((file, idx) => ({
        id: `file-${idx}-${Date.now()}`,
        fileName: file.name,
        fileSize: file.size,
        status: "queued",
        name: "",
        email: "",
        phone: "",
        address: "",
        current_title: "",
        years_of_experience: "",
        top_skills: "",
        education: "",
        linkedin_url: "",
        github_url: "",
        portfolio_url: "",
        kaggle_url: "",
        other_links: [],
        cv_text: "",
        duplicateAction: "create",
      }));

      setReviewItems(initialItems);
      setStep("progress");

      // Process files sequentially
      const updatedItems = [...initialItems];
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        updatedItems[i].status = "extracting";
        setReviewItems([...updatedItems]);

        const formData = new FormData();
        formData.append("file", file);
        formData.append("opening_id", selectedOpeningId);

        try {
          const preview = await candidatesApi.extractCv(formData);
          const data = preview.extracted_data;

          updatedItems[i].status = "done";
          updatedItems[i].preview = preview;
          updatedItems[i].name = data.name || "";
          updatedItems[i].email = data.email || "";
          updatedItems[i].phone = data.phone || "";
          updatedItems[i].address = data.address || "";
          updatedItems[i].current_title = data.current_title || "";
          updatedItems[i].years_of_experience =
            data.years_of_experience !== undefined && data.years_of_experience !== null
              ? String(data.years_of_experience)
              : "";
          updatedItems[i].top_skills = (data.top_skills || []).join(", ");
          updatedItems[i].education = data.education || "";
          updatedItems[i].linkedin_url = data.linkedin_url || "";
          updatedItems[i].github_url = data.github_url || "";
          updatedItems[i].portfolio_url = data.portfolio_url || "";
          updatedItems[i].kaggle_url = data.kaggle_url || "";
          updatedItems[i].other_links = data.other_links || [];
          updatedItems[i].cv_text = preview.cv_text;
          updatedItems[i].cv_file_url = preview.file_url;
          updatedItems[i].duplicateAction = preview.duplicate_info.is_duplicate ? "merge" : "create";
        } catch (err: any) {
          updatedItems[i].status = "failed";
          updatedItems[i].errorMessage = err.message || "Extraction failed.";
        }

        setReviewItems([...updatedItems]);
      }

      // Check if any succeeded
      const successfulCount = updatedItems.filter((it) => it.status === "done").length;
      if (successfulCount > 0) {
        setTimeout(() => {
          setStep("review");
          setCurrentReviewIndex(0);
        }, 600);
      }
    } else {
      // ── Tab 2: Pasted Text Extraction ────────────────────────────────────────
      if (!pastedCvText.trim() || pastedCvText.trim().length < 20) {
        toast({
          title: "Text Too Short",
          description: "Please paste at least 20 characters of resume text.",
          variant: "destructive",
        });
        return;
      }

      const textItem: CandidateReviewItem = {
        id: `text-${Date.now()}`,
        fileName: "Pasted CV Text",
        fileSize: pastedCvText.length,
        status: "extracting",
        name: "",
        email: "",
        phone: "",
        address: "",
        current_title: "",
        years_of_experience: "",
        top_skills: "",
        education: "",
        linkedin_url: "",
        github_url: "",
        portfolio_url: "",
        kaggle_url: "",
        other_links: [],
        cv_text: pastedCvText,
        duplicateAction: "create",
      };

      setReviewItems([textItem]);
      setStep("progress");

      try {
        const preview = await candidatesApi.extractText({
          opening_id: selectedOpeningId,
          cv_text: pastedCvText,
        });
        const data = preview.extracted_data;

        textItem.status = "done";
        textItem.preview = preview;
        textItem.name = data.name || "";
        textItem.email = data.email || "";
        textItem.phone = data.phone || "";
        textItem.address = data.address || "";
        textItem.current_title = data.current_title || "";
        textItem.years_of_experience =
          data.years_of_experience !== undefined && data.years_of_experience !== null
            ? String(data.years_of_experience)
            : "";
        textItem.top_skills = (data.top_skills || []).join(", ");
        textItem.education = data.education || "";
        textItem.linkedin_url = data.linkedin_url || "";
        textItem.github_url = data.github_url || "";
        textItem.portfolio_url = data.portfolio_url || "";
        textItem.kaggle_url = data.kaggle_url || "";
        textItem.other_links = data.other_links || [];
        textItem.duplicateAction = preview.duplicate_info.is_duplicate ? "merge" : "create";

        setReviewItems([textItem]);
        setTimeout(() => {
          setStep("review");
          setCurrentReviewIndex(0);
        }, 500);
      } catch (err: any) {
        textItem.status = "failed";
        textItem.errorMessage = err.message || "Failed to extract text details.";
        setReviewItems([textItem]);
      }
    }
  };

  // ── Step 3: Review & Confirm Actions ─────────────────────────────────────────

  const currentItem = reviewItems[currentReviewIndex];

  const updateCurrentItemField = (field: keyof CandidateReviewItem, value: any) => {
    setReviewItems((prev) => {
      const copy = [...prev];
      copy[currentReviewIndex] = { ...copy[currentReviewIndex], [field]: value };
      return copy;
    });
  };

  const handleConfirmCurrent = async () => {
    if (!currentItem) return;

    if (!currentItem.name.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter candidate full name.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingConfirm(true);

    const skillsArray = currentItem.top_skills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const expNum = currentItem.years_of_experience
      ? parseFloat(currentItem.years_of_experience)
      : null;

    const payload: CandidateConfirmPayload = {
      opening_id: selectedOpeningId,
      name: currentItem.name.trim(),
      email: currentItem.email.trim() || null,
      phone: currentItem.phone.trim() || null,
      address: currentItem.address.trim() || null,
      current_title: currentItem.current_title.trim() || null,
      years_of_experience: isNaN(expNum as number) ? null : expNum,
      top_skills: skillsArray,
      education: currentItem.education.trim() || null,
      linkedin_url: currentItem.linkedin_url.trim() || null,
      github_url: currentItem.github_url.trim() || null,
      portfolio_url: currentItem.portfolio_url.trim() || null,
      kaggle_url: currentItem.kaggle_url.trim() || null,
      other_links: currentItem.other_links,
      cv_text: currentItem.cv_text,
      cv_file_url: currentItem.cv_file_url || null,
      field_metadata: currentItem.preview?.field_metadata || {},
      extracted_data: {
        current_title: currentItem.current_title,
        years_of_experience: expNum,
        top_skills: skillsArray,
        education: currentItem.education,
      },
      auto_screen: autoScreen,
      action: currentItem.duplicateAction,
      merge_candidate_id:
        currentItem.duplicateAction === "merge"
          ? currentItem.preview?.duplicate_info.existing_candidate_id
          : null,
    };

    try {
      await candidatesApi.confirmExtracted(payload);
      toast({
        title: currentItem.duplicateAction === "merge" ? "Candidate Merged" : "Candidate Added",
        description: `${currentItem.name} was successfully ${
          currentItem.duplicateAction === "merge" ? "updated" : "added to the pipeline"
        }.`,
      });

      // Mark confirmed
      const updated = [...reviewItems];
      updated[currentReviewIndex].isConfirmed = true;
      setReviewItems(updated);

      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["job-openings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });

      // Move to next unconfirmed item or close
      const nextUnconfirmedIdx = updated.findIndex((it, idx) => idx > currentReviewIndex && !it.isConfirmed && it.status === "done");
      if (nextUnconfirmedIdx !== -1) {
        setCurrentReviewIndex(nextUnconfirmedIdx);
      } else {
        const anyUnconfirmed = updated.findIndex((it) => !it.isConfirmed && it.status === "done");
        if (anyUnconfirmed !== -1) {
          setCurrentReviewIndex(anyUnconfirmed);
        } else {
          // All done!
          onSuccess?.();
          handleClose();
        }
      }
    } catch (err: any) {
      toast({
        title: "Failed to Add Candidate",
        description: err.message || "An error occurred while persisting candidate details.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingConfirm(false);
    }
  };

  const selectedOpening = openings.find((o) => o.id === selectedOpeningId);

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
      <DialogContent className="max-w-2xl sm:max-w-3xl max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0 border-border bg-card shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-5 pb-3 border-b border-border bg-muted/20 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                <UploadCloud className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <span>Add Candidate to Pipeline</span>
                  <Badge variant="outline" className="text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0">
                    Upload-First
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Automatic AI & Regex Extraction • Duplicate Merge Detection • PDF & DOCX
                </DialogDescription>
              </div>
            </div>

            {/* Requisition Indicator in header */}
            {selectedOpening && (
              <Badge variant="secondary" className="text-xs max-w-[200px] truncate hidden sm:inline-flex gap-1.5">
                <Briefcase className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="truncate">{selectedOpening.title}</span>
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* ── STEP 1: SELECT & UPLOAD ────────────────────────────────────────── */}
        {step === "select" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* 1. Job Opening Selector & Auto-screen Setting */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 p-4 rounded-xl border border-border bg-muted/10">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="opening-select" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-primary" />
                  <span>Target Job Opening <span className="text-rose-500">*</span></span>
                </Label>
                {openings.length === 0 ? (
                  <div className="text-xs text-rose-500 p-2 border border-rose-500/20 bg-rose-500/5 rounded-lg flex items-center justify-between">
                    <span>No active job openings found.</span>
                    <Link href="/openings" className="underline font-semibold flex items-center gap-1">
                      Create opening <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                ) : (
                  <select
                    id="opening-select"
                    value={selectedOpeningId}
                    onChange={(e) => handleOpeningChange(e.target.value)}
                    className="w-full text-xs font-medium h-9 rounded-lg border border-input bg-background px-3 focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {openings.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.title} ({op.status})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Auto-screen switch */}
              <div className="space-y-1.5 flex flex-col justify-between">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Auto-Screening</span>
                </Label>
                <button
                  type="button"
                  onClick={() => handleAutoScreenToggle(!autoScreen)}
                  className={`flex items-center justify-between p-2 rounded-lg border text-xs font-medium transition-all ${
                    autoScreen
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
                      : "bg-muted/40 border-border text-muted-foreground"
                  }`}
                >
                  <span className="text-[11px] font-semibold">{autoScreen ? "Auto-Score ON" : "Manual Score"}</span>
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center ${
                      autoScreen ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {autoScreen && <Check className="w-2.5 h-2.5" />}
                  </div>
                </button>
              </div>
            </div>

            {/* 2. Upload Mode Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="grid grid-cols-2 h-9 p-1 bg-muted/60 rounded-xl mb-4">
                <TabsTrigger value="upload" className="text-xs font-semibold gap-1.5">
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Upload CVs (PDF / DOCX)</span>
                </TabsTrigger>
                <TabsTrigger value="text" className="text-xs font-semibold gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Paste CV Text</span>
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: Bulk Dropzone */}
              <TabsContent value="upload" className="space-y-4 focus-visible:outline-none">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    isDragging
                      ? "border-primary bg-primary/5 scale-[0.99]"
                      : "border-border hover:border-primary/50 hover:bg-muted/20 bg-muted/5"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={handleFileInputChange}
                  />
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3 shadow-xs">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground mb-1">
                    Drop one or multiple CVs here, or <span className="text-primary underline">browse files</span>
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Supports searchable and scanned PDF (.pdf) and Word documents (.docx) up to 10MB each.
                  </p>
                </div>

                {/* Selected Files List */}
                {selectedFiles.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-foreground px-1">
                      <span>Selected CVs ({selectedFiles.length})</span>
                      <button
                        type="button"
                        onClick={() => setSelectedFiles([])}
                        className="text-[11px] text-muted-foreground hover:text-rose-500"
                      >
                        Clear all
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {selectedFiles.map((f, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card text-xs shadow-2xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileText className="w-4 h-4 text-primary shrink-0" />
                            <span className="font-medium truncate">{f.name}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              ({(f.size / 1024).toFixed(0)} KB)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSelectedFile(idx);
                            }}
                            className="text-muted-foreground hover:text-rose-500 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Tab 2: Paste Raw CV Text */}
              <TabsContent value="text" className="space-y-3 focus-visible:outline-none">
                <div className="space-y-1.5">
                  <Label htmlFor="paste-cv-area" className="text-xs font-semibold text-foreground">
                    Paste Candidate Resume Text
                  </Label>
                  <Textarea
                    id="paste-cv-area"
                    placeholder="Paste the full text of candidate resume here (experience, skills, contact info)..."
                    value={pastedCvText}
                    onChange={(e) => setPastedCvText(e.target.value)}
                    rows={9}
                    className="text-xs font-mono resize-none bg-background focus:ring-1 focus:ring-primary"
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Heuristics & LLM will extract full name, email, phone, links, and skills.</span>
                    <span className="font-mono">{pastedCvText.length} characters</span>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* ── STEP 2: PROGRESS UI PER FILE ───────────────────────────────────── */}
        {step === "progress" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="text-center py-2 space-y-1">
              <h3 className="text-sm font-bold text-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>Extracting Candidate Details</span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Parsing text layers, running heuristic contact extractors, and checking for duplicates.
              </p>
            </div>

            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {reviewItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border bg-card text-xs"
                >
                  <div className="flex items-center gap-2.5 truncate max-w-[70%]">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{item.fileName}</span>
                  </div>

                  <div>
                    {item.status === "queued" && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Queued</span>
                      </Badge>
                    )}
                    {item.status === "extracting" && (
                      <Badge variant="outline" className="text-[10px] text-primary border-primary/30 bg-primary/5 gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Extracting...</span>
                      </Badge>
                    )}
                    {item.status === "done" && (
                      <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 gap-1 font-semibold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{item.name || "Extracted"}</span>
                      </Badge>
                    )}
                    {item.status === "failed" && (
                      <div className="flex items-center gap-1.5 text-rose-500 text-[11px]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate max-w-[200px]">{item.errorMessage || "Failed"}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 3: REVIEW SCREEN PER CANDIDATE ────────────────────────────── */}
        {step === "review" && currentItem && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Multiple candidates navigation tabs */}
            {reviewItems.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border">
                {reviewItems.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCurrentReviewIndex(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
                      currentReviewIndex === idx
                        ? "bg-foreground text-background shadow-xs"
                        : "bg-muted/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span>{idx + 1}. {item.name || item.fileName}</span>
                    {item.isConfirmed && (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    )}
                    {item.preview?.duplicate_info.is_duplicate && !item.isConfirmed && (
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Duplicate Candidate Banner */}
            {currentItem.preview?.duplicate_info.is_duplicate && (
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 flex-1">
                    <p className="font-bold">Duplicate Candidate Detected</p>
                    <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90 leading-relaxed">
                      Matched by <span className="font-semibold">{currentItem.preview.duplicate_info.matched_by}</span>.
                      Already exists as <strong>{currentItem.preview.duplicate_info.existing_candidate_name}</strong> in opening &ldquo;
                      {currentItem.preview.duplicate_info.existing_opening_title}&rdquo; (Stage: {currentItem.preview.duplicate_info.existing_stage}).
                    </p>
                  </div>
                </div>

                {/* Merge / Skip / Create Action selector */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => updateCurrentItemField("duplicateAction", "merge")}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition ${
                      currentItem.duplicateAction === "merge"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "bg-background/80 border border-amber-500/30 text-amber-900 dark:text-amber-200 hover:bg-background"
                    }`}
                  >
                    <GitMerge className="w-3 h-3" />
                    <span>Merge CV & Update Profile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateCurrentItemField("duplicateAction", "create")}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                      currentItem.duplicateAction === "create"
                        ? "bg-foreground text-background shadow-xs"
                        : "bg-background/80 border border-border text-foreground hover:bg-background"
                    }`}
                  >
                    <span>Create Separate Candidate</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateCurrentItemField("duplicateAction", "skip")}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                      currentItem.duplicateAction === "skip"
                        ? "bg-rose-600 text-white shadow-xs"
                        : "bg-background/80 border border-border text-muted-foreground hover:text-rose-500"
                    }`}
                  >
                    <span>Skip</span>
                  </button>
                </div>
              </div>
            )}

            {/* Editable Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* 1. Name */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <User className="w-3 h-3 text-muted-foreground" />
                    <span>Candidate Name <span className="text-rose-500">*</span></span>
                  </Label>
                  {currentItem.preview?.field_metadata?.name && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {currentItem.preview.field_metadata.name.source} ({Math.round(currentItem.preview.field_metadata.name.confidence * 100)}%)
                    </span>
                  )}
                </div>
                <Input
                  value={currentItem.name}
                  onChange={(e) => updateCurrentItemField("name", e.target.value)}
                  placeholder="e.g. Jane Doe"
                  className={`h-8 text-xs bg-background ${
                    !currentItem.name.trim() || currentItem.preview?.low_confidence_fields?.includes("name")
                      ? "border-amber-500/80 focus-visible:ring-amber-500"
                      : ""
                  }`}
                />
                {!currentItem.name.trim() && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5" /> Please specify candidate full name
                  </p>
                )}
              </div>

              {/* 2. Email */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <Mail className="w-3 h-3 text-muted-foreground" />
                    <span>Email Address</span>
                  </Label>
                  {currentItem.preview?.field_metadata?.email && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {currentItem.preview.field_metadata.email.source} ({Math.round(currentItem.preview.field_metadata.email.confidence * 100)}%)
                    </span>
                  )}
                </div>
                <Input
                  value={currentItem.email}
                  onChange={(e) => updateCurrentItemField("email", e.target.value)}
                  placeholder="e.g. jane@example.com"
                  className={`h-8 text-xs bg-background ${
                    !currentItem.email.trim()
                      ? "border-amber-500/80 focus-visible:ring-amber-500"
                      : ""
                  }`}
                />
                {!currentItem.email.trim() && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5" /> No email detected (optional, can be added later)
                  </p>
                )}
                {/* Secondary email chips */}
                {currentItem.preview?.extracted_data?.secondary_emails && currentItem.preview.extracted_data.secondary_emails.length > 0 && (
                  <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                    <span className="text-[9.5px] text-muted-foreground">Other found:</span>
                    {currentItem.preview.extracted_data.secondary_emails.map((se) => (
                      <button
                        key={se}
                        type="button"
                        onClick={() => updateCurrentItemField("email", se)}
                        className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-muted/60 hover:bg-primary/10 hover:text-primary transition"
                      >
                        {se}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Phone */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Phone className="w-3 h-3 text-muted-foreground" />
                  <span>Phone Number</span>
                </Label>
                <Input
                  value={currentItem.phone}
                  onChange={(e) => updateCurrentItemField("phone", e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="h-8 text-xs bg-background"
                />
              </div>

              {/* 4. Address */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-muted-foreground" />
                  <span>Location / City</span>
                </Label>
                <Input
                  value={currentItem.address}
                  onChange={(e) => updateCurrentItemField("address", e.target.value)}
                  placeholder="San Francisco, CA"
                  className="h-8 text-xs bg-background"
                />
              </div>

              {/* 5. Current Title */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Briefcase className="w-3 h-3 text-muted-foreground" />
                  <span>Current / Target Title</span>
                </Label>
                <Input
                  value={currentItem.current_title}
                  onChange={(e) => updateCurrentItemField("current_title", e.target.value)}
                  placeholder="Senior Full Stack Engineer"
                  className="h-8 text-xs bg-background"
                />
              </div>

              {/* 6. Years of Experience */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  <span>Years of Experience</span>
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="50"
                  value={currentItem.years_of_experience}
                  onChange={(e) => updateCurrentItemField("years_of_experience", e.target.value)}
                  placeholder="5"
                  className="h-8 text-xs bg-background font-mono"
                />
              </div>

              {/* 7. Education */}
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <GraduationCap className="w-3 h-3 text-muted-foreground" />
                  <span>Education / Degree</span>
                </Label>
                <Input
                  value={currentItem.education}
                  onChange={(e) => updateCurrentItemField("education", e.target.value)}
                  placeholder="B.S. in Computer Science, Stanford University"
                  className="h-8 text-xs bg-background"
                />
              </div>

              {/* 8. Top Skills */}
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Layers className="w-3 h-3 text-muted-foreground" />
                  <span>Key Skills (comma separated)</span>
                </Label>
                <Input
                  value={currentItem.top_skills}
                  onChange={(e) => updateCurrentItemField("top_skills", e.target.value)}
                  placeholder="Python, React, TypeScript, PostgreSQL, AWS"
                  className="h-8 text-xs bg-background"
                />
              </div>

              {/* 9. Professional Links */}
              <div className="sm:col-span-2 pt-2 border-t border-border/60">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                  Portfolio & Online Profiles
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Input
                    value={currentItem.linkedin_url}
                    onChange={(e) => updateCurrentItemField("linkedin_url", e.target.value)}
                    placeholder="https://linkedin.com/in/username"
                    className="h-8 text-xs bg-background font-mono text-[11px]"
                  />
                  <Input
                    value={currentItem.github_url}
                    onChange={(e) => updateCurrentItemField("github_url", e.target.value)}
                    placeholder="https://github.com/username"
                    className="h-8 text-xs bg-background font-mono text-[11px]"
                  />
                  <Input
                    value={currentItem.portfolio_url}
                    onChange={(e) => updateCurrentItemField("portfolio_url", e.target.value)}
                    placeholder="https://personalportfolio.dev"
                    className="h-8 text-xs bg-background font-mono text-[11px]"
                  />
                  <Input
                    value={currentItem.kaggle_url}
                    onChange={(e) => updateCurrentItemField("kaggle_url", e.target.value)}
                    placeholder="https://kaggle.com/username"
                    className="h-8 text-xs bg-background font-mono text-[11px]"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer Actions ─────────────────────────────────────────────────── */}
        <DialogFooter className="p-4 border-t border-border bg-muted/20 shrink-0 flex items-center justify-between sm:justify-between">
          {step === "select" && (
            <>
              <Button size="sm" variant="ghost" onClick={handleClose} className="text-xs">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={startExtraction}
                disabled={
                  openings.length === 0 ||
                  (activeTab === "upload" && selectedFiles.length === 0) ||
                  (activeTab === "text" && !pastedCvText.trim())
                }
                className="text-xs font-semibold gap-1.5 shadow-xs"
              >
                <span>Extract & Review Details</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </>
          )}

          {step === "progress" && (
            <div className="w-full flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Extracting candidate CV data...</span>
              <Button size="sm" variant="ghost" onClick={handleClose} className="text-xs">
                Cancel
              </Button>
            </div>
          )}

          {step === "review" && currentItem && (
            <div className="w-full flex items-center justify-between gap-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStep("select")}
                className="text-xs gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Upload More</span>
              </Button>

              <div className="flex items-center gap-2">
                {reviewItems.length > 1 && (
                  <span className="text-xs text-muted-foreground mr-1 hidden sm:inline-block">
                    Candidate {currentReviewIndex + 1} of {reviewItems.length}
                  </span>
                )}

                <Button
                  id="btn-confirm-candidate"
                  size="sm"
                  onClick={handleConfirmCurrent}
                  disabled={isSubmittingConfirm || !currentItem.name.trim()}
                  className="text-xs font-semibold gap-1.5 shadow-xs bg-primary text-primary-foreground"
                >
                  {isSubmittingConfirm ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : currentItem.duplicateAction === "merge" ? (
                    <GitMerge className="w-3.5 h-3.5" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {currentItem.duplicateAction === "merge"
                      ? "Confirm Merge"
                      : currentItem.duplicateAction === "skip"
                      ? "Skip Candidate"
                      : "Confirm & Add to Pipeline"}
                  </span>
                </Button>
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Clock(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
