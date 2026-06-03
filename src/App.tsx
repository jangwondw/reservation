import { Bell, CalendarPlus, ChevronDown, Clock, ExternalLink, MapPin, Timer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { venues } from "./data";
import {
  createCalendarFile,
  formatCountdown,
  formatDateTime,
  formatTimeWindow,
  getUpcomingOpens,
} from "./dateUtils";
import type { LinkCategory, ReservationLink, UpcomingOpen, Venue } from "./types";

type NotificationState = "unsupported" | "default" | "granted" | "denied";

const categoryLabels: Record<LinkCategory, string> = {
  general: "일반",
  weekend_holiday: "주말·공휴일",
  weekday_evening: "평일 저녁",
};

const sourceClassNames: Record<string, string> = {
  서울시: "source source-seoul",
  네이버: "source source-naver",
  강동구: "source source-gangdong",
};

function getNotificationState(): NotificationState {
  if (!("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission as NotificationState;
}

function downloadCalendar(event: UpcomingOpen) {
  const file = createCalendarFile(event);
  const blob = new Blob([file], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${event.venue.name}-예약오픈.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getLinksByCategory(links: ReservationLink[]) {
  return (Object.keys(categoryLabels) as LinkCategory[])
    .map((category) => ({
      category,
      links: links.filter((link) => link.category === category),
    }))
    .filter((group) => group.links.length > 0);
}

function App() {
  const [now, setNow] = useState(() => new Date());
  const [expandedVenueId, setExpandedVenueId] = useState(venues[0]?.id ?? "");
  const [notificationState, setNotificationState] = useState<NotificationState>(() => getNotificationState());
  const notifiedEventIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const upcomingOpens = useMemo(() => getUpcomingOpens(venues, now), [now]);
  const primaryOpen = upcomingOpens[0];
  const primaryLinks = primaryOpen.venue.links.slice(0, 3);

  useEffect(() => {
    setExpandedVenueId(primaryOpen.venue.id);
  }, [primaryOpen.venue.id]);

  useEffect(() => {
    if (notificationState !== "granted") {
      return;
    }

    upcomingOpens.slice(0, 3).forEach((event) => {
      const diff = event.opensAt.getTime() - now.getTime();
      const isWithinWindow = diff > 0 && diff <= 10 * 60 * 1000;

      if (!isWithinWindow || notifiedEventIds.current.has(event.id)) {
        return;
      }

      new Notification(`${event.venue.name} 예약 오픈`, {
        body: `${formatDateTime(event.opensAt)} · ${event.rule.targetPeriod ?? event.rule.label}`,
      });
      notifiedEventIds.current.add(event.id);
    });
  }, [notificationState, now, upcomingOpens]);

  async function requestNotifications() {
    if (!("Notification" in window)) {
      setNotificationState("unsupported");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationState(permission as NotificationState);
  }

  return (
    <main className="app-shell">
      <section className="hero-card" aria-label="다음 예약 오픈">
        <div className="hero-top">
          <p className="section-label">다음 예약 오픈</p>
          <span className={primaryOpen.isOpen ? "status status-live" : "status"}>
            {primaryOpen.isOpen ? "오픈 중" : "대기"}
          </span>
        </div>

        <h1>{primaryOpen.venue.name}</h1>

        <div className="countdown">
          <Timer aria-hidden="true" size={30} />
          <strong>{formatCountdown(primaryOpen.opensAt, now, primaryOpen.isOpen)}</strong>
        </div>

        <dl className="hero-details">
          <div>
            <dt>오픈일</dt>
            <dd>{formatDateTime(primaryOpen.opensAt)}</dd>
          </div>
          <div>
            <dt>시간</dt>
            <dd>{formatTimeWindow(primaryOpen)}</dd>
          </div>
          <div>
            <dt>대상</dt>
            <dd>{primaryOpen.rule.targetPeriod ?? primaryOpen.rule.label}</dd>
          </div>
        </dl>

        <div className="quick-action-list">
          {primaryLinks.map((link) => (
            <ReservationButton key={link.id} link={link} variant="dark" />
          ))}
        </div>

        <div className="utility-row">
          <button className="utility-button" type="button" onClick={() => downloadCalendar(primaryOpen)}>
            <CalendarPlus aria-hidden="true" size={18} />
            캘린더
          </button>
          <button
            className="utility-button"
            type="button"
            onClick={requestNotifications}
            disabled={notificationState === "denied" || notificationState === "unsupported"}
          >
            <Bell aria-hidden="true" size={18} />
            {notificationState === "granted" ? "알림 켜짐" : "알림"}
          </button>
        </div>
      </section>

      <section className="section-block" aria-label="곧 열리는 예약">
        <div className="section-heading">
          <h2>곧 열림</h2>
        </div>
        <ol className="timeline-list">
          {upcomingOpens.slice(1, 5).map((event) => (
            <li key={event.id}>
              <div className="timeline-marker" aria-hidden="true" />
              <div>
                <strong>{event.venue.name}</strong>
                <span>{event.rule.targetPeriod ?? event.rule.label}</span>
              </div>
              <time>{formatDateTime(event.opensAt)}</time>
            </li>
          ))}
        </ol>
      </section>

      <section className="section-block venue-stack" aria-label="장소별 예약">
        <div className="section-heading">
          <h2>장소별 예약</h2>
        </div>

        {venues.map((venue) => (
          <VenueAccordion
            key={venue.id}
            venue={venue}
            now={now}
            isExpanded={expandedVenueId === venue.id}
            onToggle={() => setExpandedVenueId((current) => (current === venue.id ? "" : venue.id))}
          />
        ))}
      </section>
    </main>
  );
}

type VenueAccordionProps = {
  venue: Venue;
  now: Date;
  isExpanded: boolean;
  onToggle: () => void;
};

function VenueAccordion({ venue, now, isExpanded, onToggle }: VenueAccordionProps) {
  const nextOpen = getUpcomingOpens([venue], now)[0];

  return (
    <article className="venue-accordion">
      <button className="venue-toggle" type="button" onClick={onToggle} aria-expanded={isExpanded}>
        <span className="venue-info">
          <span className="venue-area">
            <MapPin aria-hidden="true" size={14} />
            {venue.area}
          </span>
          <strong>{venue.name}</strong>
          <time>{formatDateTime(nextOpen.opensAt)}</time>
        </span>
        <span className="venue-countdown">
          <span>{formatCountdown(nextOpen.opensAt, now, nextOpen.isOpen)}</span>
          <ChevronDown aria-hidden="true" size={20} />
        </span>
      </button>

      {isExpanded && (
        <div className="venue-content">
          <div className="rule-row">
            {venue.openRules.map((rule) => (
              <span key={rule.id} className="rule-chip">
                <Clock aria-hidden="true" size={14} />
                {rule.label}
                {rule.targetPeriod ? ` · ${rule.targetPeriod}` : ""}
              </span>
            ))}
          </div>

          {getLinksByCategory(venue.links).map((group) => (
            <div key={group.category} className="link-group">
              <h3>{categoryLabels[group.category]}</h3>
              <div className="reservation-list">
                {group.links.map((link) => (
                  <ReservationButton key={link.id} link={link} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function ReservationButton({
  link,
  variant = "light",
}: {
  link: ReservationLink;
  variant?: "light" | "dark";
}) {
  return (
    <a className={variant === "dark" ? "reservation-link dark-link" : "reservation-link"} href={link.url} target="_blank">
      <span>
        <span className={sourceClassNames[link.source] ?? "source"}>{link.source}</span>
        <strong>{link.label}</strong>
      </span>
      <ExternalLink aria-hidden="true" size={18} />
    </a>
  );
}

export default App;
