import { Bell, BellOff, CalendarPlus, ChevronDown, Clock, ExternalLink, MapPin, Timer } from "lucide-react";
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

function formatRemainingLabel(event: UpcomingOpen, now: Date) {
  if (event.isOpen) {
    return "오픈 중";
  }

  const totalMinutes = Math.max(0, Math.ceil((event.opensAt.getTime() - now.getTime()) / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}일 ${hours}시간 ${minutes}분 남음`;
  }

  if (hours > 0) {
    return `${hours}시간 ${minutes}분 남음`;
  }

  return `${minutes}분 남음`;
}

function getStoredAlertEnabled() {
  return window.localStorage.getItem("tennis.alertEnabled") === "true" && getNotificationState() === "granted";
}

function App() {
  const [now, setNow] = useState(() => new Date());
  const [expandedVenueId, setExpandedVenueId] = useState("");
  const [notificationState, setNotificationState] = useState<NotificationState>(() => getNotificationState());
  const [alertEnabled, setAlertEnabled] = useState(() => getStoredAlertEnabled());
  const notificationTimeoutsRef = useRef<number[]>([]);
  const activeNotificationsRef = useRef<Notification[]>([]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const upcomingOpens = useMemo(() => getUpcomingOpens(venues, now), [now]);
  const primaryOpen = upcomingOpens[0];
  const primaryLinks = primaryOpen.venue.links;
  const primaryOpenTime = primaryOpen.opensAt.getTime();
  const primaryOpenTarget = primaryOpen.rule.targetPeriod ?? primaryOpen.rule.label;

  useEffect(() => {
    window.localStorage.setItem("tennis.alertEnabled", String(alertEnabled));
  }, [alertEnabled]);

  useEffect(() => {
    function clearScheduledNotifications() {
      notificationTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      notificationTimeoutsRef.current = [];
      activeNotificationsRef.current.forEach((notification) => notification.close());
      activeNotificationsRef.current = [];
    }

    clearScheduledNotifications();

    if (!alertEnabled || notificationState !== "granted" || primaryOpen.isOpen) {
      return clearScheduledNotifications;
    }

    const reminderAt = primaryOpen.opensAt.getTime() - 10 * 60 * 1000;
    const delay = Math.max(0, reminderAt - Date.now());
    const timeoutId = window.setTimeout(() => {
      const notification = new Notification(`${primaryOpen.venue.name} 예약 10분 전`, {
        body: `${formatDateTime(new Date(primaryOpenTime))} 오픈 · ${primaryOpenTarget}`,
      });

      notification.onclick = () => window.focus();
      activeNotificationsRef.current.push(notification);
      notificationTimeoutsRef.current = notificationTimeoutsRef.current.filter((id) => id !== timeoutId);
    }, delay);

    notificationTimeoutsRef.current = [timeoutId];

    return clearScheduledNotifications;
  }, [
    alertEnabled,
    notificationState,
    primaryOpen.id,
    primaryOpen.isOpen,
    primaryOpen.venue.name,
    primaryOpenTime,
    primaryOpenTarget,
  ]);

  async function toggleNotifications() {
    if (alertEnabled) {
      setAlertEnabled(false);
      return;
    }

    if (!("Notification" in window)) {
      setNotificationState("unsupported");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationState(permission as NotificationState);

    if (permission === "granted") {
      setAlertEnabled(true);
    }
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
            className={alertEnabled ? "utility-button utility-button-active" : "utility-button"}
            type="button"
            onClick={toggleNotifications}
            disabled={notificationState === "denied" || notificationState === "unsupported"}
          >
            {alertEnabled ? <Bell aria-hidden="true" size={18} /> : <BellOff aria-hidden="true" size={18} />}
            {alertEnabled ? "알림 켜짐" : "알림 꺼짐"}
          </button>
        </div>
      </section>

      <section className="section-block" aria-label="장소별 예약">
        <div className="section-heading">
          <h2>장소별 예약</h2>
        </div>

        <div className="section-list">
          {venues.map((venue) => (
            <VenueAccordion
              key={venue.id}
              venue={venue}
              now={now}
              isExpanded={expandedVenueId === venue.id}
              onToggle={() => setExpandedVenueId((current) => (current === venue.id ? "" : venue.id))}
            />
          ))}
        </div>
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
        </span>
        <span className="venue-countdown">
          <span>{formatRemainingLabel(nextOpen, now)}</span>
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
