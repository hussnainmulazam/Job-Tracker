"use client";

import React, { useRef, useState, useMemo, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import listPlugin from "@fullcalendar/react/list";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCw,
  Video,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarEventItem,
  CalendarEventsResponse,
  BusinessHourPeriod,
} from "@/lib/api";

interface GoogleCalendarComponentProps {
  data: CalendarEventsResponse;
  onEventClick: (event: CalendarEventItem) => void;
  onDatesChange: (start: string, end: string) => void;
  onRefresh?: () => void;
  isRefetching?: boolean;
}

type CalendarViewMode = "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek";

const FullCalendarAny = FullCalendar as any;

export default function GoogleCalendarComponent({
  data,
  onEventClick,
  onDatesChange,
  onRefresh,
  isRefetching = false,
}: GoogleCalendarComponentProps) {
  const calendarRef = useRef<any>(null);

  // View state and title
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentView, setCurrentView] = useState<CalendarViewMode>("timeGridWeek");

  // User 12h vs 24h setting
  const [is24Hour, setIs24Hour] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("calendar_time_format") === "24h";
    }
    return false;
  });

  const toggleTimeFormat = () => {
    setIs24Hour((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("calendar_time_format", next ? "24h" : "12h");
      }
      return next;
    });
  };

  // Convert API events to FullCalendar event input format
  const fcEvents = useMemo(() => {
    return data.events.map((evt) => ({
      id: evt.id,
      title: evt.title,
      start: evt.start,
      end: evt.end,
      allDay: evt.all_day,
      backgroundColor: evt.is_interview ? `${evt.color}15` : `${evt.color}20`,
      borderColor: evt.color,
      textColor: evt.color,
      extendedProps: evt,
    }));
  }, [data.events]);

  // Convert business hours for working-hours shading
  const fcBusinessHours = useMemo(() => {
    if (!data.business_hours || data.business_hours.length === 0) {
      return [{ daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "17:00" }];
    }
    return data.business_hours.map((bh: BusinessHourPeriod) => ({
      daysOfWeek: bh.days_of_week,
      startTime: bh.start_time,
      endTime: bh.end_time,
    }));
  }, [data.business_hours]);

  // Custom FullCalendar event card renderer
  const renderEventContent = (eventInfo: any) => {
    const rawEvt: CalendarEventItem = eventInfo.event.extendedProps;
    const isInterview = rawEvt?.is_interview;
    const round = rawEvt?.interview_data?.round;

    if (eventInfo.view.type === "listWeek") {
      return (
        <div className="flex items-center justify-between w-full py-0.5">
          <div className="flex items-center gap-2 truncate">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: rawEvt.color }}
            />
            <span className="font-semibold text-xs text-foreground truncate">
              {eventInfo.event.title}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {isInterview && round && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {round}
              </span>
            )}
            {rawEvt.meet_link && <Video className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
          </div>
        </div>
      );
    }

    return (
      <div
        className="w-full h-full px-1.5 py-1 rounded-md border-l-3 overflow-hidden flex flex-col justify-between text-[11px] leading-tight transition-all hover:brightness-95 shadow-2xs"
        style={{
          borderLeftColor: rawEvt.color,
          backgroundColor: isInterview ? `${rawEvt.color}20` : `${rawEvt.color}15`,
        }}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="font-bold truncate text-foreground text-[10.5px]">
            {eventInfo.event.title}
          </span>
          {rawEvt.meet_link && (
            <Video className="w-3 h-3 text-emerald-600 shrink-0 opacity-80" />
          )}
        </div>

        <div className="flex items-center justify-between gap-1 text-[9.5px] mt-0.5">
          <span className="font-mono text-muted-foreground font-medium truncate">
            {eventInfo.timeText}
          </span>
          {isInterview && round && (
            <span
              className="text-[9px] font-bold px-1 rounded uppercase tracking-wider shrink-0 text-white"
              style={{ backgroundColor: rawEvt.color }}
            >
              {round}
            </span>
          )}
        </div>
      </div>
    );
  };

  // Synchronize title on view/range change
  const handleDatesSet = (arg: any) => {
    setCurrentTitle(arg.view.title);
    setCurrentView(arg.view.type as CalendarViewMode);
    if (onDatesChange) {
      onDatesChange(arg.startStr, arg.endStr);
    }
  };

  const changeView = (view: CalendarViewMode) => {
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      api.changeView(view);
      setCurrentView(view);
    }
  };

  const navPrev = () => {
    if (calendarRef.current) {
      calendarRef.current.getApi().prev();
    }
  };

  const navNext = () => {
    if (calendarRef.current) {
      calendarRef.current.getApi().next();
    }
  };

  const navToday = () => {
    if (calendarRef.current) {
      calendarRef.current.getApi().today();
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border/70 dark:border-white/[0.08] p-3 sm:p-4 space-y-3 shadow-xs">
      {/* ── Google Calendar-Style Controls Toolbar ─────────────────── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pb-3 border-b border-border/60">
        {/* Left: Navigation and Title */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={navToday}
            className="h-8 px-3 text-xs font-semibold rounded-lg border-border/80 hover:bg-muted/60"
          >
            Today
          </Button>

          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={navPrev}
              className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground"
              title="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={navNext}
              className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground"
              title="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <h2 className="text-sm sm:text-base font-bold text-foreground ml-1 tracking-tight truncate">
            {currentTitle}
          </h2>
        </div>

        {/* Right: Time format toggle, Refresh, and View Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 12h vs 24h Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={toggleTimeFormat}
            className="h-8 px-2.5 text-[11px] font-mono font-semibold rounded-lg text-muted-foreground hover:text-foreground gap-1 border-border/70"
            title="Toggle between 12-hour (AM/PM) and 24-hour time format"
          >
            <Clock className="w-3 h-3" />
            <span>{is24Hour ? "24h" : "12h"}</span>
          </Button>

          {/* Refresh / Invalidate Button */}
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefetching}
              className="h-8 w-8 p-0 rounded-lg border-border/70 text-muted-foreground hover:text-foreground"
              title="Re-query Google Calendar"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            </Button>
          )}

          {/* View Mode Buttons: Month, Week, Day, Agenda */}
          <div className="flex bg-muted/50 p-0.5 rounded-xl border border-border/70 h-8 items-center">
            <button
              type="button"
              onClick={() => changeView("dayGridMonth")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                currentView === "dayGridMonth"
                  ? "bg-background text-foreground shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => changeView("timeGridWeek")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                currentView === "timeGridWeek"
                  ? "bg-background text-foreground shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => changeView("timeGridDay")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                currentView === "timeGridDay"
                  ? "bg-background text-foreground shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => changeView("listWeek")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                currentView === "listWeek"
                  ? "bg-background text-foreground shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Agenda
            </button>
          </div>
        </div>
      </div>

      {/* ── FullCalendar Core View ──────────────────────────────────── */}
      <div className="fullcalendar-google-theme min-h-[640px]">
        <FullCalendarAny
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView="timeGridWeek"
          headerToolbar={false} // Managed via our custom toolbar above
          timeZone={data.time_zone || "local"}
          events={fcEvents}
          eventContent={renderEventContent}
          eventClick={(info: any) => {
            info.jsEvent.preventDefault();
            const rawEvt = info.event.extendedProps as CalendarEventItem;
            onEventClick(rawEvt);
          }}
          datesSet={handleDatesSet}
          nowIndicator={true}
          businessHours={fcBusinessHours}
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          allDaySlot={true}
          expandRows={true}
          navLinks={true}
          editable={false}
          selectable={false}
          slotLabelFormat={{
            hour: is24Hour ? "2-digit" : "numeric",
            minute: "2-digit",
            hour12: !is24Hour,
            meridiem: is24Hour ? false : "short",
          }}
          eventTimeFormat={{
            hour: is24Hour ? "2-digit" : "numeric",
            minute: "2-digit",
            hour12: !is24Hour,
            meridiem: is24Hour ? false : "short",
          }}
          height="auto"
        />
      </div>

      {/* ── Global Styles for Google Calendar Aesthetics ────────────── */}
      <style jsx global>{`
        .fullcalendar-google-theme .fc {
          font-family: inherit;
          --fc-border-color: hsl(var(--border) / 0.6);
          --fc-today-bg-color: hsl(var(--primary) / 0.04);
          --fc-non-business-color: hsl(var(--muted) / 0.35);
        }

        .fullcalendar-google-theme .fc-theme-standard th {
          border-color: hsl(var(--border) / 0.6);
          padding: 8px 0;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: hsl(var(--muted-foreground));
          background: hsl(var(--muted) / 0.2);
        }

        .fullcalendar-google-theme .fc-theme-standard td {
          border-color: hsl(var(--border) / 0.5);
        }

        .fullcalendar-google-theme .fc-timegrid-slot {
          height: 38px !important;
          border-bottom: 1px dashed hsl(var(--border) / 0.4) !important;
        }

        .fullcalendar-google-theme .fc-timegrid-slot-label {
          font-family: monospace;
          font-size: 10px;
          color: hsl(var(--muted-foreground));
        }

        .fullcalendar-google-theme .fc-event {
          cursor: pointer;
          border: none !important;
          background: transparent !important;
          padding: 1px !important;
        }

        .fullcalendar-google-theme .fc-timegrid-now-indicator-line {
          border-color: #ea4335 !important;
          border-width: 2px !important;
        }

        .fullcalendar-google-theme .fc-timegrid-now-indicator-arrow {
          border-top-color: #ea4335 !important;
          border-bottom-color: #ea4335 !important;
        }

        .fullcalendar-google-theme .fc-daygrid-day-number {
          font-size: 11px;
          font-weight: 600;
          padding: 4px 6px;
          color: hsl(var(--foreground));
        }

        .fullcalendar-google-theme .fc-daygrid-day.fc-day-today .fc-daygrid-day-number {
          background-color: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          border-radius: 9999px;
          width: 22px;
          height: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin: 2px;
        }

        .fullcalendar-google-theme .fc-list-event:hover td {
          background-color: hsl(var(--muted) / 0.5) !important;
          cursor: pointer;
        }

        .fullcalendar-google-theme .fc-list-day-cushion {
          background-color: hsl(var(--muted) / 0.3) !important;
          font-weight: 700;
          font-size: 11px;
        }
      `}</style>
    </div>
  );
}
