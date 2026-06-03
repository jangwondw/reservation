import type { OpenRule, UpcomingOpen, Venue } from "./types";

const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"];

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function buildRuleDate(rule: OpenRule, year: number, month: number) {
  const date = new Date(year, month, rule.dayOfMonth, rule.hour, rule.minute, 0, 0);
  if (date.getMonth() !== month) {
    return null;
  }

  return date;
}

function buildCloseDate(rule: OpenRule, opensAt: Date) {
  if (!rule.windowEnd) {
    return addMinutes(opensAt, 30);
  }

  const closesAt = new Date(opensAt);
  closesAt.setHours(rule.windowEnd.hour, rule.windowEnd.minute, 0, 0);

  if (closesAt <= opensAt) {
    return addMinutes(opensAt, 30);
  }

  return closesAt;
}

export function getNextOpen(venue: Venue, rule: OpenRule, now: Date): UpcomingOpen {
  for (let offset = 0; offset < 18; offset += 1) {
    const monthCursor = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const opensAt = buildRuleDate(rule, monthCursor.getFullYear(), monthCursor.getMonth());

    if (!opensAt) {
      continue;
    }

    const closesAt = buildCloseDate(rule, opensAt);

    if (closesAt >= now) {
      return {
        id: `${venue.id}-${rule.id}-${opensAt.getFullYear()}-${opensAt.getMonth() + 1}`,
        venue,
        rule,
        opensAt,
        closesAt,
        isOpen: opensAt <= now && closesAt >= now,
      };
    }
  }

  throw new Error(`No upcoming opening found for ${venue.name} / ${rule.label}`);
}

export function getUpcomingOpens(venues: Venue[], now: Date) {
  return venues
    .flatMap((venue) => venue.openRules.map((rule) => getNextOpen(venue, rule, now)))
    .sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime());
}

export function formatDateTime(date: Date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = weekdayNames[date.getDay()];
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${month}월 ${day}일(${weekday}) ${hour}:${minute}`;
}

export function formatTimeWindow(event: UpcomingOpen) {
  const start = `${String(event.opensAt.getHours()).padStart(2, "0")}:${String(
    event.opensAt.getMinutes(),
  ).padStart(2, "0")}`;
  const end = `${String(event.closesAt.getHours()).padStart(2, "0")}:${String(
    event.closesAt.getMinutes(),
  ).padStart(2, "0")}`;

  return event.rule.windowEnd ? `${start}-${end}` : start;
}

export function formatCountdown(target: Date, now: Date, isOpen: boolean) {
  if (isOpen) {
    return "오픈 중";
  }

  const diff = Math.max(0, target.getTime() - now.getTime());
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}일 ${hours}시간 ${minutes}분`;
  }

  if (hours > 0) {
    return `${hours}시간 ${minutes}분 ${seconds}초`;
  }

  return `${minutes}분 ${seconds}초`;
}

function formatIcsDate(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function escapeIcsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

export function createCalendarFile(event: UpcomingOpen) {
  const title = `${event.venue.name} 예약 오픈`;
  const description = `${event.rule.label}${event.rule.targetPeriod ? ` / ${event.rule.targetPeriod}` : ""}`;
  const uid = `${event.id}@tennis-reservation-links`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tennis Reservation Links//KO",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(event.opensAt)}`,
    `DTEND:${formatIcsDate(event.closesAt)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "BEGIN:VALARM",
    "TRIGGER;RELATED=START:-PT10M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(`${title} 10분 전`)}`,
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER;RELATED=START:PT0M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(`${title} 지금`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
