"use client";

import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  CheckCircle2,
  Lock,
  ArrowRight,
  ArrowLeft,
  X,
  UserCheck,
  Briefcase,
  Calendar,
  Mail,
  Plus,
  Trash2,
  RotateCcw,
  Clock,
  Globe,
  Building,
  Check,
  RefreshCw,
  Eye,
  Edit3,
  Copy,
} from "lucide-react";

import {
  OnboardingStatusResponse,
  onboardingApi,
} from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SetupWizardDialogProps {
  open: boolean;
  initialStep?: number;
  onClose: () => void;
  onboardingData?: OnboardingStatusResponse | null;
  onSuccess?: () => void;
}

const EMAIL_TONE_OPTIONS = [
  {
    id: "warm_professional",
    title: "Warm & Professional",
    description: "Empathetic, clear, and encouraging recruiter tone. (Recommended)",
  },
  {
    id: "casual_friendly",
    title: "Casual & Friendly",
    description: "Approachable tech startup feel, modern and informal.",
  },
  {
    id: "direct_concise",
    title: "Direct & Concise",
    description: "Short, bullet-pointed, zero fluff, straight to business.",
  },
  {
    id: "formal",
    title: "Formal & Corporate",
    description: "Traditional corporate phrasing with strict protocol.",
  },
];

const TIMEZONE_OPTIONS = [
  "Asia/Karachi",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
];

const SUGGESTED_SKILLS = [
  "Python",
  "FastAPI",
  "PostgreSQL",
  "TypeScript",
  "React",
  "Next.js",
  "Docker",
  "Kubernetes",
  "AWS",
  "System Design",
  "REST APIs",
  "GraphQL",
];

export const LIFECYCLE_TEMPLATES: Array<{
  key: string;
  name: string;
  shortName: string;
  description: string;
  variables: string[];
}> = [
  {
    key: "cv_received",
    name: "CV Received",
    shortName: "CV Received",
    description: "Sent immediately when applicant CV is ingested to confirm intake.",
    variables: ["{candidate_name}", "{role}", "{company}", "{hr_name}"],
  },
  {
    key: "cv_passed",
    name: "CV Passed",
    shortName: "CV Passed",
    description: "Sent when candidate's CV is approved / shortlisted by recruiting.",
    variables: ["{candidate_name}", "{role}", "{company}", "{hr_name}", "{schedule_link}"],
  },
  {
    key: "job_details",
    name: "Job Details",
    shortName: "Job Details",
    description: "Shares the role responsibilities, tech stack, and team culture.",
    variables: ["{candidate_name}", "{role}", "{company}", "{hr_name}", "{job_details}", "{schedule_link}"],
  },
  {
    key: "initial_interview",
    name: "Initial Interview",
    shortName: "Initial Screen",
    description: "Invites candidate to an introductory screening conversation.",
    variables: ["{candidate_name}", "{role}", "{company}", "{hr_name}", "{schedule_link}"],
  },
  {
    key: "initial_passed",
    name: "Initial Passed",
    shortName: "Initial Passed",
    description: "Congratulates candidate on passing the initial round and moves them forward.",
    variables: ["{candidate_name}", "{role}", "{company}", "{hr_name}", "{schedule_link}"],
  },
  {
    key: "behavioral_interview",
    name: "Behavioral Interview",
    shortName: "Behavioral",
    description: "Invites candidate to the behavioral and cultural alignment round.",
    variables: ["{candidate_name}", "{role}", "{company}", "{hr_name}", "{interview_date}", "{interview_time}", "{meet_link}", "{schedule_link}"],
  },
  {
    key: "behavioral_passed",
    name: "Behavioral Passed",
    shortName: "Behavioral Passed",
    description: "Notifies candidate they passed the behavioral evaluation.",
    variables: ["{candidate_name}", "{role}", "{company}", "{hr_name}", "{schedule_link}"],
  },
  {
    key: "final_interview",
    name: "Final Interview",
    shortName: "Final Round",
    description: "Invites candidate to the final leadership / executive interview.",
    variables: ["{candidate_name}", "{role}", "{company}", "{hr_name}", "{interview_date}", "{interview_time}", "{meet_link}", "{schedule_link}"],
  },
  {
    key: "offer_letter",
    name: "Offer Letter",
    shortName: "Offer Letter",
    description: "Celebratory formal job offer extending employment details.",
    variables: ["{candidate_name}", "{role}", "{company}", "{hr_name}"],
  },
  {
    key: "rejection",
    name: "Rejection (per stage)",
    shortName: "Rejection",
    description: "Short, warm, and empathetic rejection message.",
    variables: ["{candidate_name}", "{role}", "{company}", "{hr_name}"],
  },
  {
    key: "interview_reminder",
    name: "Interview Reminder",
    shortName: "Reminder",
    description: "Friendly reminder before an upcoming scheduled interview.",
    variables: ["{candidate_name}", "{role}", "{company}", "{hr_name}", "{interview_date}", "{interview_time}", "{meet_link}"],
  },
];

export const VARIABLE_CHIPS: Array<{ token: string; label: string }> = [
  { token: "{candidate_name}", label: "Candidate Name" },
  { token: "{role}", label: "Role" },
  { token: "{company}", label: "Company" },
  { token: "{hr_name}", label: "HR Name" },
  { token: "{interview_date}", label: "Interview Date" },
  { token: "{interview_time}", label: "Interview Time" },
  { token: "{meet_link}", label: "Google Meet Link" },
  { token: "{schedule_link}", label: "Schedule Link" },
  { token: "{job_details}", label: "Job Details" },
];

export const DEFAULT_LIFECYCLE_TEMPLATES: Record<string, { name: string; subject: string; body: string }> = {
  cv_received: {
    name: "CV Received",
    subject: "Got your application for {role} at {company}!",
    body: "Hi {candidate_name},\n\nThank you for sharing your resume with us for the {role} position. I've received your CV and our hiring team is reviewing it now.\n\nWe know how much effort goes into applying, so we'll be in touch with next steps as soon as we finish our review.\n\nWarm regards,\n{hr_name}\n{company}",
  },
  cv_passed: {
    name: "CV Passed",
    subject: "Great news regarding your application for {role} at {company}",
    body: "Hi {candidate_name},\n\nYour background caught our eye! Your skills and experience align closely with what we're building for {role} at {company}.\n\nWe'd love to chat and get to know you better. Please pick a time that works best for you here:\n{schedule_link}\n\nLooking forward to our conversation!\n\nWarm regards,\n{hr_name}\n{company}",
  },
  job_details: {
    name: "Job Details",
    subject: "More details on the {role} opportunity at {company}",
    body: "Hi {candidate_name},\n\nHere is an overview of what you'll be driving as {role} at {company}:\n\n{job_details}\n\nIf this sounds exciting, grab a quick time on my calendar so we can talk through your questions:\n{schedule_link}\n\nWarm regards,\n{hr_name}\n{company}",
  },
  initial_interview: {
    name: "Initial Interview",
    subject: "Let's connect: {role} at {company}",
    body: "Hi {candidate_name},\n\nWe would love to invite you to an introductory 30-minute chat for the {role} opening. It's an informal conversation to learn about your goals and share more about the role.\n\nChoose a slot that suits your schedule here:\n{schedule_link}\n\nWarm regards,\n{hr_name}\n{company}",
  },
  initial_passed: {
    name: "Initial Passed",
    subject: "Great speaking with you! Next steps for {role} at {company}",
    body: "Hi {candidate_name},\n\nI really enjoyed our introductory conversation. The team was impressed by your experience and we are excited to move you forward to the next round!\n\nPlease use this booking link to schedule your next session:\n{schedule_link}\n\nWarm regards,\n{hr_name}\n{company}",
  },
  behavioral_interview: {
    name: "Behavioral Interview",
    subject: "Team & Culture Fit Interview: {role} at {company}",
    body: "Hi {candidate_name},\n\nWe'd love to invite you to our team alignment conversation for the {role} position. This session is a chance for you to meet the team, discuss how we work together, and ask any questions you have.\n\nIf not already booked, pick a time here:\n{schedule_link}\nMeeting link: {meet_link}\n\nWarm regards,\n{hr_name}\n{company}",
  },
  behavioral_passed: {
    name: "Behavioral Passed",
    subject: "Wonderful feedback on your interview for {role} at {company}",
    body: "Hi {candidate_name},\n\nThe team loved meeting with you! Your approach to collaboration and problem solving made a fantastic impression on everyone.\n\nWe would love to move you to the final interview round. You can book your slot here:\n{schedule_link}\n\nWarm regards,\n{hr_name}\n{company}",
  },
  final_interview: {
    name: "Final Interview",
    subject: "Final Interview: {role} at {company}",
    body: "Hi {candidate_name},\n\nYou have reached the final stage of our hiring process! This round will be a focused discussion with our leadership team.\n\nInterview timing: {interview_date} at {interview_time}\nVideo room: {meet_link}\n\nWe are excited for this conversation. Reach out if you need anything beforehand.\n\nWarm regards,\n{hr_name}\n{company}",
  },
  offer_letter: {
    name: "Offer Letter",
    subject: "Offer of Employment: Welcome to {company}!",
    body: "Hi {candidate_name},\n\nOn behalf of everyone at {company}, I am thrilled to extend an offer for the {role} position! We were deeply inspired by your talent and believe you will do phenomenal work here.\n\nI will follow up shortly with your formal offer summary packet. In the meantime, huge congratulations—we can't wait to work together!\n\nWarm regards,\n{hr_name}\n{company}",
  },
  rejection: {
    name: "Rejection (per stage)",
    subject: "Update on your application for {role} at {company}",
    body: "Hi {candidate_name},\n\nThank you sincerely for taking the time to speak with us about the {role} position at {company}. While our team was impressed by your background, we have chosen to move forward with another applicant whose experience is slightly closer to our current immediate priorities.\n\nWe genuinely appreciate your time and enthusiasm. We'll keep your profile in our talent pool for future openings, and wish you all the best in your search.\n\nWarm regards,\n{hr_name}\n{company}",
  },
  interview_reminder: {
    name: "Interview Reminder",
    subject: "Reminder: Your upcoming interview with {company} for {role}",
    body: "Hi {candidate_name},\n\nJust a friendly reminder about our upcoming interview for the {role} role.\n\nDate & Time: {interview_date} at {interview_time}\nGoogle Meet Link: {meet_link}\n\nLooking forward to speaking with you soon! Let me know if you need to reschedule.\n\nWarm regards,\n{hr_name}\n{company}",
  },
};

function resolvePreviewText(text: string, sampleVars: Record<string, string>): string {
  if (!text) return "";
  let res = text;
  Object.entries(sampleVars).forEach(([k, v]) => {
    res = res.split(`{${k}}`).join(v);
    res = res.split(`{{${k}}}`).join(v);
  });
  return res;
}

export function SetupWizardDialog({
  open,
  initialStep = 1,
  onClose,
  onboardingData,
  onSuccess,
}: SetupWizardDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeStep, setActiveStep] = useState<number>(initialStep);

  // ── Step 1 State ────────────────────────────────────────────────────────────
  const [hrName, setHrName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [hrRole, setHrRole] = useState("");
  const [emailTone, setEmailTone] = useState("warm_professional");
  const [signature, setSignature] = useState("");

  // ── Step 2 State ────────────────────────────────────────────────────────────
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [newSkillInput, setNewSkillInput] = useState("");
  const [yearsExperience, setYearsExperience] = useState<number | "">("");

  // ── Step 3 State ────────────────────────────────────────────────────────────
  const [timezone, setTimezone] = useState("Asia/Karachi");
  const [slotDuration, setSlotDuration] = useState(30);
  const [bufferMinutes, setBufferMinutes] = useState(10);
  const [weeklyHours, setWeeklyHours] = useState<Record<string, { enabled: boolean; start: string; end: string }>>({
    mon: { enabled: true, start: "09:00", end: "17:00" },
    tue: { enabled: true, start: "09:00", end: "17:00" },
    wed: { enabled: true, start: "09:00", end: "17:00" },
    thu: { enabled: true, start: "09:00", end: "17:00" },
    fri: { enabled: true, start: "09:00", end: "17:00" },
    sat: { enabled: false, start: "10:00", end: "14:00" },
    sun: { enabled: false, start: "10:00", end: "14:00" },
  });
  const [interviewRounds, setInterviewRounds] = useState<Array<{ round_name: string; duration_minutes: number }>>([
    { round_name: "Initial Screening", duration_minutes: 30 },
    { round_name: "Technical Evaluation", duration_minutes: 45 },
    { round_name: "Final Culture Fit", duration_minutes: 30 },
  ]);

  // ── Step 4 State ────────────────────────────────────────────────────────────
  const [activeTemplateTab, setActiveTemplateTab] = useState("cv_received");
  const [templatePreviewMode, setTemplatePreviewMode] = useState(false);
  const [isGeneratingAllAI, setIsGeneratingAllAI] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Record<string, { subject: string; body: string; name?: string }>>(
    DEFAULT_LIFECYCLE_TEMPLATES
  );

  // Prepopulate form when onboardingData loads or changes
  useEffect(() => {
    if (onboardingData) {
      if (initialStep) {
        setActiveStep(Math.min(initialStep, 5));
      } else {
        setActiveStep(Math.min(onboardingData.current_step, 5));
      }

      // Step 1
      if (onboardingData.step_1) {
        setHrName(onboardingData.step_1.hr_name || "");
        setCompanyName(onboardingData.step_1.company_name || "");
        setHrRole(onboardingData.step_1.hr_role || "");
        setEmailTone(onboardingData.step_1.email_tone || "warm_professional");
        setSignature(onboardingData.step_1.signature || "");
      }

      // Step 2
      if (onboardingData.step_2) {
        setJobTitle(onboardingData.step_2.job_title || "");
        setJobDescription(onboardingData.step_2.job_description || "");
        setRequiredSkills(onboardingData.step_2.required_skills || []);
        setYearsExperience(
          onboardingData.step_2.years_of_experience !== null && onboardingData.step_2.years_of_experience !== undefined
            ? onboardingData.step_2.years_of_experience
            : ""
        );
      }

      // Step 3
      if (onboardingData.step_3) {
        setTimezone(onboardingData.step_3.timezone || "Asia/Karachi");
        setSlotDuration(onboardingData.step_3.slot_duration_minutes || 30);
        setBufferMinutes(onboardingData.step_3.buffer_minutes || 10);
        if (onboardingData.step_3.interview_rounds && onboardingData.step_3.interview_rounds.length > 0) {
          setInterviewRounds(onboardingData.step_3.interview_rounds);
        }
      }

      // Step 4
      if (onboardingData.step_4?.templates && Object.keys(onboardingData.step_4.templates).length > 0) {
        setTemplates((prev) => ({
          ...DEFAULT_LIFECYCLE_TEMPLATES,
          ...onboardingData.step_4.templates,
        }));
      }
    }
  }, [onboardingData, initialStep]);

  // Keep signature in sync if HR updates details and signature is untouched
  useEffect(() => {
    if (hrName && companyName && !signature) {
      setSignature(`Best regards,\n${hrName}\n${hrRole ? `${hrRole} | ` : ""}${companyName}`);
    }
  }, [hrName, companyName, hrRole, signature]);

  // ── Mutations ───────────────────────────────────────────────────────────────

  const saveStep1Mutation = useMutation({
    mutationFn: () =>
      onboardingApi.saveStep1({
        hr_name: hrName,
        company_name: companyName,
        hr_role: hrRole,
        email_tone: emailTone,
        signature: signature || undefined,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["onboarding-status"], updated);
      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
      toast({
        title: "Step 1 Saved",
        description: "HR & Company profile saved to database.",
      });
      setActiveStep(2);
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save profile",
        description: err.message || "Please fill in all required fields.",
        variant: "destructive",
      });
    },
  });

  const saveStep2Mutation = useMutation({
    mutationFn: () =>
      onboardingApi.saveStep2({
        job_title: jobTitle,
        job_description: jobDescription,
        required_skills: requiredSkills,
        years_of_experience: yearsExperience === "" ? undefined : Number(yearsExperience),
        job_opening_id: onboardingData?.step_2?.job_opening_id,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["onboarding-status"], updated);
      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
      queryClient.invalidateQueries({ queryKey: ["job-openings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({
        title: "Step 2 Saved",
        description: `Requisition "${jobTitle}" created and saved.`,
      });
      setActiveStep(3);
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save job opening",
        description: err.message || "Please provide title and description.",
        variant: "destructive",
      });
    },
  });

  const saveStep3Mutation = useMutation({
    mutationFn: () => {
      const formattedWeeklyHours: Record<string, Array<{ start: string; end: string }>> = {};
      Object.entries(weeklyHours).forEach(([day, cfg]) => {
        formattedWeeklyHours[day] = cfg.enabled ? [{ start: cfg.start, end: cfg.end }] : [];
      });

      return onboardingApi.saveStep3({
        timezone,
        slot_duration_minutes: Number(slotDuration),
        buffer_minutes: Number(bufferMinutes),
        weekly_hours: formattedWeeklyHours,
        interview_rounds: interviewRounds,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["onboarding-status"], updated);
      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
      queryClient.invalidateQueries({ queryKey: ["availability"] });
      toast({
        title: "Step 3 Saved",
        description: "Weekly availability and interview rounds configured.",
      });
      setActiveStep(4);
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save availability",
        description: err.message || "Could not persist schedule.",
        variant: "destructive",
      });
    },
  });

  const saveStep4Mutation = useMutation({
    mutationFn: () => onboardingApi.saveStep4({ templates }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["onboarding-status"], updated);
      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
      toast({
        title: "Step 4 Saved",
        description: "Candidate lifecycle email templates saved successfully.",
      });
      setActiveStep(5);
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save templates",
        description: err.message || "Please complete template subjects and bodies.",
        variant: "destructive",
      });
    },
  });

  const startAgentMutation = useMutation({
    mutationFn: () => onboardingApi.startAgent(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({
        title: "🎉 AI Recruiter Copilot Activated!",
        description: res.message || "Your autonomous recruiting agent is now online and monitoring your pipeline.",
      });
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Cannot start agent",
        description: err.message || "All 4 steps must be completed first.",
        variant: "destructive",
      });
    },
  });

  if (!open) return null;

  // ── Helper Actions ──────────────────────────────────────────────────────────

  const handleAddSkill = (skillToAdd: string) => {
    const clean = skillToAdd.trim();
    if (clean && !requiredSkills.includes(clean)) {
      setRequiredSkills([...requiredSkills, clean]);
    }
    setNewSkillInput("");
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setRequiredSkills(requiredSkills.filter((s) => s !== skillToRemove));
  };

  const handleAutofillRequisition = () => {
    setJobTitle("Senior Full Stack AI Engineer");
    setJobDescription(
      "We are seeking a Senior Full Stack Engineer to lead the architecture of our AI agent workflows and modern Next.js interface. " +
        "You will design scalable PostgreSQL schemas, implement FastAPI microservices, and collaborate closely with product to ship delightful talent automation tools."
    );
    setRequiredSkills(["Python", "FastAPI", "Next.js", "TypeScript", "PostgreSQL", "Docker"]);
    setYearsExperience(4.0);
    toast({
      title: "Sample Requisition Loaded",
      description: "Sample job description and competencies applied.",
    });
  };

  const handleInsertVariable = (tag: string) => {
    const cur = templates[activeTemplateTab] || { subject: "", body: "" };
    setTemplates({
      ...templates,
      [activeTemplateTab]: {
        ...cur,
        body: cur.body ? `${cur.body} ${tag}` : tag,
      },
    });
  };

  const handleGenerateAllWithAI = async () => {
    setIsGeneratingAllAI(true);
    try {
      const res = await onboardingApi.generateTemplates({
        hr_name: hrName || "Talent Lead",
        company_name: companyName || "Our Company",
        hr_role: hrRole || "Recruiter",
        email_tone: emailTone || "warm_professional",
      });
      if (res?.templates) {
        setTemplates((prev) => ({
          ...prev,
          ...res.templates,
        }));
        queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
        toast({
          title: "✨ All 11 Templates Generated with AI",
          description: `Generated in ${res.latency_seconds || 3.5}s using ${res.model_used || "AI"}. Short, warm, and human.`,
        });
      }
    } catch (err: any) {
      toast({
        title: "Generation error",
        description: err.message || "Could not generate templates. Loaded human defaults.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingAllAI(false);
    }
  };

  const handleRegenerateSingleWithAI = async (key: string) => {
    setRegeneratingKey(key);
    try {
      const res = await onboardingApi.generateTemplates({
        hr_name: hrName || "Talent Lead",
        company_name: companyName || "Our Company",
        hr_role: hrRole || "Recruiter",
        email_tone: emailTone || "warm_professional",
        single_template_key: key,
      });
      if (res?.templates && res.templates[key]) {
        setTemplates((prev) => ({
          ...prev,
          [key]: res.templates[key],
        }));
        queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
        const name = LIFECYCLE_TEMPLATES.find((t) => t.key === key)?.name || key;
        toast({
          title: `✨ ${name} Regenerated with AI`,
          description: `Fresh human draft generated in ${res.latency_seconds || 1.2}s.`,
        });
      }
    } catch (err: any) {
      toast({
        title: "Regeneration failed",
        description: err.message || "Failed to regenerate template.",
        variant: "destructive",
      });
    } finally {
      setRegeneratingKey(null);
    }
  };

  const isSaving =
    saveStep1Mutation.isPending ||
    saveStep2Mutation.isPending ||
    saveStep3Mutation.isPending ||
    saveStep4Mutation.isPending;

  const stepsHeader = [
    { num: 1, title: "HR Profile", icon: UserCheck, completed: onboardingData?.step_1?.completed },
    { num: 2, title: "First Opening", icon: Briefcase, completed: onboardingData?.step_2?.completed },
    { num: 3, title: "Availability", icon: Calendar, completed: onboardingData?.step_3?.completed },
    { num: 4, title: "Templates", icon: Mail, completed: onboardingData?.step_4?.completed },
    { num: 5, title: "Start Agent", icon: Sparkles, completed: onboardingData?.agent_started },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-card border border-border/80 shadow-2xl rounded-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* ── Dialog Header & Step Indicator Bar ─────────────────────────── */}
        <div className="px-5 py-4 border-b border-border/80 bg-muted/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-foreground">
                Recruiter Setup Wizard
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Step {activeStep <= 4 ? activeStep : 4} of 4 • Save each step and resume anytime
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors"
            title="Close / Resume Later"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Progress Step Switcher Pills ──────────────────────────────── */}
        <div className="px-5 py-2.5 border-b border-border/60 bg-card/60 flex items-center gap-1.5 overflow-x-auto shrink-0 select-none">
          {stepsHeader.map((s) => {
            const isCurrent = activeStep === s.num;
            const StepIcon = s.icon;
            return (
              <button
                key={s.num}
                type="button"
                onClick={() => setActiveStep(s.num)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  isCurrent
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : s.completed
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                {s.completed ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <StepIcon className="h-3.5 w-3.5" />
                )}
                <span>
                  {s.num}. {s.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Body: Active Step Content ─────────────────────────────────── */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 min-h-[360px]">
          {/* ═══════════════════════════════════════════════════════════════════
              STEP 1: HR & Company Profile
          ════════════════════════════════════════════════════════════════════ */}
          {activeStep === 1 && (
            <div className="space-y-5 animate-in fade-in-50 duration-200">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-foreground">1. Recruiter & Company Profile</h3>
                <p className="text-xs text-muted-foreground">
                  Your identity and brand voice will be used by the AI agent to sign candidate emails and draft communications.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Your Full Name <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    placeholder="e.g. Sarah Jenkins"
                    value={hrName}
                    onChange={(e) => setHrName(e.target.value)}
                    className="text-xs h-9 bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Company Name <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    placeholder="e.g. Acme Technologies"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="text-xs h-9 bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Your HR / Recruiting Role <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    placeholder="e.g. Senior Technical Recruiter / Head of Talent"
                    value={hrRole}
                    onChange={(e) => setHrRole(e.target.value)}
                    className="text-xs h-9 bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Communication Tone
                  </label>
                  <select
                    value={emailTone}
                    onChange={(e) => setEmailTone(e.target.value)}
                    className="w-full text-xs h-9 px-3 rounded-lg border border-border/80 bg-background font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    {EMAIL_TONE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tone helper cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {EMAIL_TONE_OPTIONS.map((opt) => (
                  <div
                    key={opt.id}
                    onClick={() => setEmailTone(opt.id)}
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                      emailTone === opt.id
                        ? "border-primary bg-primary/[0.04] ring-1 ring-primary/30"
                        : "border-border/60 bg-muted/20 hover:border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-bold text-foreground text-[11px]">{opt.title}</span>
                      {emailTone === opt.id && <Check className="h-3 w-3 text-primary" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{opt.description}</p>
                  </div>
                ))}
              </div>

              {/* Signature editor */}
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    Email Signature Block
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setSignature(`Best regards,\n${hrName || "Recruiter Name"}\n${hrRole ? `${hrRole} | ` : ""}${companyName || "Company"}`)
                    }
                    className="text-[10px] text-primary hover:underline font-medium"
                  >
                    Generate from profile
                  </button>
                </div>
                <Textarea
                  rows={3}
                  placeholder={`Best regards,\nSarah Jenkins\nSenior Technical Recruiter | Acme Technologies`}
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  className="text-xs bg-background font-mono"
                />
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STEP 2: First Job Opening with JD
          ════════════════════════════════════════════════════════════════════ */}
          {activeStep === 2 && (
            <div className="space-y-5 animate-in fade-in-50 duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-foreground">2. First Job Opening & Requisition</h3>
                  <p className="text-xs text-muted-foreground">
                    Define the initial vacancy for the AI to screen resumes against and calculate candidate fit scores.
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutofillRequisition}
                  className="h-7 text-xs gap-1.5 shrink-0 self-start sm:self-auto"
                >
                  <Sparkles className="h-3 w-3 text-primary" />
                  <span>Autofill Sample Requisition</span>
                </Button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Job Title <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      placeholder="e.g. Senior Backend Engineer"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      className="text-xs h-9 bg-background"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Min Experience (Years)
                    </label>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      placeholder="e.g. 3.0"
                      value={yearsExperience}
                      onChange={(e) => setYearsExperience(e.target.value === "" ? "" : Number(e.target.value))}
                      className="text-xs h-9 bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Job Description <span className="text-rose-500">*</span>
                  </label>
                  <Textarea
                    rows={6}
                    placeholder="Paste or write the role responsibilities, team context, and technical expectations..."
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    className="text-xs bg-background leading-relaxed"
                  />
                </div>

                {/* Skills tags */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">
                    Required Competencies / Skills
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Type a skill and press Enter..."
                      value={newSkillInput}
                      onChange={(e) => setNewSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          handleAddSkill(newSkillInput);
                        }
                      }}
                      className="text-xs h-8 bg-background max-w-sm"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleAddSkill(newSkillInput)}
                      disabled={!newSkillInput.trim()}
                      className="h-8 text-xs font-medium"
                    >
                      Add
                    </Button>
                  </div>

                  {/* Active tags */}
                  {requiredSkills.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {requiredSkills.map((sk) => (
                        <Badge
                          key={sk}
                          variant="secondary"
                          className="gap-1 text-xs py-1 px-2.5 bg-primary/10 text-primary border-primary/20"
                        >
                          <span>{sk}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSkill(sk)}
                            className="text-primary hover:text-foreground"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Suggested Quick Add Chips */}
                  <div className="pt-2">
                    <span className="text-[11px] text-muted-foreground mr-1.5">Quick add:</span>
                    <div className="inline-flex flex-wrap gap-1">
                      {SUGGESTED_SKILLS.filter((s) => !requiredSkills.includes(s))
                        .slice(0, 8)
                        .map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => handleAddSkill(s)}
                            className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-border/80 bg-muted/30 hover:bg-primary/10 hover:text-primary transition-colors"
                          >
                            + {s}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STEP 3: Weekly Availability & Interview Lengths per Round
          ════════════════════════════════════════════════════════════════════ */}
          {activeStep === 3 && (
            <div className="space-y-5 animate-in fade-in-50 duration-200">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-foreground">3. Weekly Availability & Round Lengths</h3>
                <p className="text-xs text-muted-foreground">
                  Set your working hours and interview durations. Candidates use these settings to self-book interview slots.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Time Zone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full text-xs h-9 px-3 rounded-lg border border-border/80 bg-background font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Default Slot Duration
                  </label>
                  <select
                    value={slotDuration}
                    onChange={(e) => setSlotDuration(Number(e.target.value))}
                    className="w-full text-xs h-9 px-3 rounded-lg border border-border/80 bg-background font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={45}>45 Minutes</option>
                    <option value={60}>60 Minutes</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Buffer Between Calls
                  </label>
                  <select
                    value={bufferMinutes}
                    onChange={(e) => setBufferMinutes(Number(e.target.value))}
                    className="w-full text-xs h-9 px-3 rounded-lg border border-border/80 bg-background font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value={0}>No Buffer (0 min)</option>
                    <option value={5}>5 Minutes</option>
                    <option value={10}>10 Minutes</option>
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                  </select>
                </div>
              </div>

              {/* Interview Lengths Per Round */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground">
                    Interview Lengths per Round
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setInterviewRounds([
                        ...interviewRounds,
                        { round_name: `Round ${interviewRounds.length + 1}`, duration_minutes: 30 },
                      ])
                    }
                    className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Round</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {interviewRounds.map((rnd, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2.5 rounded-xl border border-border/70 bg-muted/20"
                    >
                      <span className="h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <Input
                        placeholder="Round Title"
                        value={rnd.round_name}
                        onChange={(e) => {
                          const updated = [...interviewRounds];
                          updated[idx].round_name = e.target.value;
                          setInterviewRounds(updated);
                        }}
                        className="text-xs h-8 bg-background flex-1"
                      />
                      <select
                        value={rnd.duration_minutes}
                        onChange={(e) => {
                          const updated = [...interviewRounds];
                          updated[idx].duration_minutes = Number(e.target.value);
                          setInterviewRounds(updated);
                        }}
                        className="text-xs h-8 px-2.5 rounded-lg border border-border/80 bg-background font-medium cursor-pointer"
                      >
                        <option value={15}>15 min</option>
                        <option value={30}>30 min</option>
                        <option value={45}>45 min</option>
                        <option value={60}>60 min</option>
                        <option value={90}>90 min</option>
                      </select>
                      {interviewRounds.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setInterviewRounds(interviewRounds.filter((_, i) => i !== idx))}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Weekly Working Days */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-bold text-foreground">
                  Weekly Working Hours
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(weeklyHours).map(([day, cfg]) => (
                    <div
                      key={day}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-colors ${
                        cfg.enabled ? "border-border/80 bg-card" : "border-border/40 bg-muted/10 opacity-60"
                      }`}
                    >
                      <label className="flex items-center gap-2 cursor-pointer font-semibold uppercase text-[11px]">
                        <input
                          type="checkbox"
                          checked={cfg.enabled}
                          onChange={(e) =>
                            setWeeklyHours({
                              ...weeklyHours,
                              [day]: { ...cfg, enabled: e.target.checked },
                            })
                          }
                          className="rounded border-border h-3.5 w-3.5 text-primary accent-primary cursor-pointer"
                        />
                        <span>{day}</span>
                      </label>
                      {cfg.enabled ? (
                        <div className="flex items-center gap-1 font-mono text-[11px]">
                          <input
                            type="time"
                            value={cfg.start}
                            onChange={(e) =>
                              setWeeklyHours({
                                ...weeklyHours,
                                [day]: { ...cfg, start: e.target.value },
                              })
                            }
                            className="bg-background border border-border/80 rounded px-1.5 py-0.5 text-xs"
                          />
                          <span>–</span>
                          <input
                            type="time"
                            value={cfg.end}
                            onChange={(e) =>
                              setWeeklyHours({
                                ...weeklyHours,
                                [day]: { ...cfg, end: e.target.value },
                              })
                            }
                            className="bg-background border border-border/80 rounded px-1.5 py-0.5 text-xs"
                          />
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic">Unavailable</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STEP 4: Email Templates (11 Lifecycle Stages + AI Generator)
          ════════════════════════════════════════════════════════════════════ */}
          {activeStep === 4 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              {/* Header & One-Click AI Generator Banner */}
              <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">4. Candidate Lifecycle Email Templates</span>
                    <Badge variant="outline" className="text-[10px] font-semibold text-primary border-primary/30">
                      11 Lifecycle Stages
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Personalized, short, warm, and human. Uses your HR Profile ({hrName || "Talent Lead"}, {companyName || "Our Company"}) &amp; Tone ({emailTone.replace("_", " ")}).
                  </p>
                </div>

                <Button
                  type="button"
                  onClick={handleGenerateAllWithAI}
                  disabled={isGeneratingAllAI}
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold gap-1.5 shrink-0 shadow-sm"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isGeneratingAllAI ? "animate-spin" : ""}`} />
                  <span>{isGeneratingAllAI ? "Generating 11 Templates..." : "Generate All with AI"}</span>
                </Button>
              </div>

              {/* 11 Stages Pill Navigation (Horizontal Scrollable) */}
              <div className="relative">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                  {LIFECYCLE_TEMPLATES.map((tmpl) => {
                    const isActive = activeTemplateTab === tmpl.key;
                    const hasCustomBody = Boolean(templates[tmpl.key]?.body);
                    return (
                      <button
                        key={tmpl.key}
                        type="button"
                        onClick={() => {
                          setActiveTemplateTab(tmpl.key);
                          setTemplatePreviewMode(false);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 flex items-center gap-1.5 transition-all border ${
                          isActive
                            ? "bg-primary text-primary-foreground border-primary shadow-xs"
                            : "bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground border-border/60"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isActive ? "bg-white" : hasCustomBody ? "bg-emerald-500" : "bg-muted-foreground/40"
                          }`}
                        />
                        <span>{tmpl.shortName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Template Card */}
              {(() => {
                const currentConfig =
                  LIFECYCLE_TEMPLATES.find((t) => t.key === activeTemplateTab) || LIFECYCLE_TEMPLATES[0];
                const tmpl = templates[activeTemplateTab] || { subject: "", body: "" };

                const sampleVars: Record<string, string> = {
                  candidate_name: "Alex Morgan",
                  role: jobTitle || "Senior Software Engineer",
                  company: companyName || "Our Company",
                  hr_name: hrName || "Sarah Jenkins",
                  interview_date: "Thursday, Nov 26",
                  interview_time: "2:30 PM PKT",
                  meet_link: "https://meet.google.com/abc-defg-hij",
                  schedule_link: "https://app.talentflow.ai/schedule/invite-demo",
                  job_details:
                    "Designing scalable microservices, creating high-performance PostgreSQL queries, and deploying cloud services.",
                  booking_link: "https://app.talentflow.ai/schedule/invite-demo",
                  job_title: jobTitle || "Senior Software Engineer",
                  company_name: companyName || "Our Company",
                  signature: signature || `Warm regards,\n${hrName || "Talent Lead"}\n${companyName || "Our Company"}`,
                };

                const resolvedSubject = resolvePreviewText(tmpl.subject, sampleVars);
                const resolvedBody = resolvePreviewText(tmpl.body, sampleVars);

                return (
                  <div className="border border-border/80 rounded-xl bg-card p-3.5 space-y-3">
                    {/* Top row: Stage Name & Action controls */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border/60">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-foreground">{currentConfig.name}</h4>
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            Stage: {activeTemplateTab}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{currentConfig.description}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Regenerate this template with AI */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleRegenerateSingleWithAI(activeTemplateTab)}
                          disabled={regeneratingKey === activeTemplateTab}
                          className="h-7 text-xs px-2.5 gap-1 border-border/80 hover:border-primary/50 text-foreground"
                          title="Regenerate this specific template with AI"
                        >
                          <RefreshCw
                            className={`w-3 h-3 text-primary ${
                              regeneratingKey === activeTemplateTab ? "animate-spin" : ""
                            }`}
                          />
                          <span>
                            {regeneratingKey === activeTemplateTab ? "Regenerating..." : "Regenerate AI"}
                          </span>
                        </Button>

                        {/* Edit vs Preview Toggle */}
                        <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/60 text-xs">
                          <button
                            type="button"
                            onClick={() => setTemplatePreviewMode(false)}
                            className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
                              !templatePreviewMode
                                ? "bg-background text-foreground shadow-xs font-semibold"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setTemplatePreviewMode(true)}
                            className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
                              templatePreviewMode
                                ? "bg-background text-foreground shadow-xs font-semibold"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <Eye className="w-3 h-3" />
                            <span>Preview</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {!templatePreviewMode ? (
                      /* ── EDIT MODE ────────────────────────────────────────── */
                      <div className="space-y-3">
                        {/* Variable insertion chips */}
                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Insert Dynamic Variable:
                          </span>
                          <div className="flex flex-wrap items-center gap-1 text-xs">
                            {VARIABLE_CHIPS.map((chip) => (
                              <button
                                key={chip.token}
                                type="button"
                                onClick={() => handleInsertVariable(chip.token)}
                                className="px-1.5 py-0.5 rounded-md border border-border/80 bg-muted/30 font-mono text-[10px] text-primary hover:bg-primary/10 hover:border-primary/40 transition-colors"
                                title={`Insert ${chip.label} into message body`}
                              >
                                {chip.token}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Subject Line */}
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-foreground">Subject Line</label>
                          <Input
                            value={tmpl.subject}
                            onChange={(e) =>
                              setTemplates({
                                ...templates,
                                [activeTemplateTab]: { ...tmpl, subject: e.target.value },
                              })
                            }
                            placeholder="e.g. Got your application for {role} at {company}!"
                            className="text-xs h-9 bg-background font-medium font-mono"
                          />
                        </div>

                        {/* Message Body */}
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-foreground">Message Body</label>
                          <Textarea
                            rows={8}
                            value={tmpl.body}
                            onChange={(e) =>
                              setTemplates({
                                ...templates,
                                [activeTemplateTab]: { ...tmpl, body: e.target.value },
                              })
                            }
                            placeholder="Write message body with variables..."
                            className="text-xs bg-background leading-relaxed font-sans"
                          />
                        </div>
                      </div>
                    ) : (
                      /* ── PREVIEW MODE ─────────────────────────────────────── */
                      <div className="space-y-2.5 bg-muted/20 rounded-xl p-3 border border-border/60">
                        <div className="flex items-center justify-between text-[11px] pb-2 border-b border-border/50 text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                            Live Candidate View (Variables Interpolated Deterministically)
                          </span>
                          <span className="text-[10px] bg-background px-2 py-0.5 rounded border border-border/60">
                            Sample: Alex Morgan
                          </span>
                        </div>

                        <div className="space-y-1 text-xs">
                          <div className="flex gap-1.5 text-muted-foreground text-[11px]">
                            <span className="font-semibold text-foreground/80 w-14 shrink-0">Subject:</span>
                            <span className="font-medium text-foreground">{resolvedSubject || "(No subject)"}</span>
                          </div>
                          <div className="flex gap-1.5 text-muted-foreground text-[11px]">
                            <span className="font-semibold text-foreground/80 w-14 shrink-0">Recipient:</span>
                            <span>Alex Morgan &lt;alex.morgan@example.com&gt;</span>
                          </div>
                          <div className="flex gap-1.5 text-muted-foreground text-[11px]">
                            <span className="font-semibold text-foreground/80 w-14 shrink-0">Sender:</span>
                            <span>{hrName || "Talent Lead"} &lt;recruiting@{companyName ? companyName.toLowerCase().replace(/\s+/g, '') + '.com' : 'company.com'}&gt;</span>
                          </div>
                        </div>

                        <div className="mt-2 pt-2 border-t border-border/50 bg-background/80 rounded-lg p-3 border border-border/60 text-xs text-foreground font-sans whitespace-pre-wrap leading-relaxed">
                          {resolvedBody || "(No message body content)"}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <p className="text-[11px] text-muted-foreground text-center">
                Sending never calls AI — your configured templates are filled with real candidate data instantly.
              </p>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STEP 5: Activation Screen (All 4 Steps Done)
          ════════════════════════════════════════════════════════════════════ */}
          {activeStep === 5 && (
            <div className="py-6 text-center space-y-5 animate-in fade-in-50 duration-200 max-w-lg mx-auto">
              <div className="h-16 w-16 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center ring-8 ring-emerald-500/5">
                <CheckCircle2 className="h-8 w-8 stroke-[2.5]" />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black text-foreground">
                  Setup Completed Successfully!
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  All 4 configuration steps have been saved to your PostgreSQL database. Your HR profile,
                  requisition, availability, and lifecycle email templates are fully configured.
                </p>
              </div>

              {/* Summary pills */}
              <div className="grid grid-cols-2 gap-2 text-left p-3.5 rounded-xl border border-border/80 bg-muted/20 text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Recruiter</span>
                  <p className="font-bold text-foreground truncate">{hrName || "Configured"}</p>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Company</span>
                  <p className="font-bold text-foreground truncate">{companyName || "Configured"}</p>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Requisition</span>
                  <p className="font-bold text-foreground truncate">{jobTitle || "Configured"}</p>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Timezone</span>
                  <p className="font-bold text-foreground truncate">{timezone}</p>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  size="lg"
                  onClick={() => startAgentMutation.mutate()}
                  disabled={startAgentMutation.isPending}
                  className="w-full h-11 text-sm font-bold gap-2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-400/40"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{startAgentMutation.isPending ? "Activating Agent..." : "Launch Recruiter AI Copilot"}</span>
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Dialog Footer: Navigation Controls ─────────────────────────── */}
        <div className="px-5 py-3 border-t border-border/80 bg-muted/30 flex items-center justify-between shrink-0">
          <div>
            {activeStep > 1 && activeStep <= 4 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveStep((prev) => prev - 1)}
                disabled={isSaving}
                className="h-8 text-xs gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 text-xs text-muted-foreground"
              >
                <span>Resume Later</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeStep <= 4 ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  disabled={isSaving}
                  className="h-8 text-xs"
                >
                  Save &amp; Resume Later
                </Button>

                <Button
                  size="sm"
                  disabled={isSaving}
                  onClick={() => {
                    if (activeStep === 1) saveStep1Mutation.mutate();
                    else if (activeStep === 2) saveStep2Mutation.mutate();
                    else if (activeStep === 3) saveStep3Mutation.mutate();
                    else if (activeStep === 4) saveStep4Mutation.mutate();
                  }}
                  className="h-8 text-xs font-semibold gap-1.5 shadow-xs"
                >
                  <span>{isSaving ? "Saving..." : "Save & Continue"}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="h-8 text-xs"
              >
                Close
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
