import {
  Bell,
  CalendarPlus,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  MapPin,
  Search,
  Star,
  Timer,
} from "lucide-react";
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

type CategoryFilter = "all" | LinkCategory;
type NotificationState = "unsupported" | "default" | "granted" | "denied";

const categoryLabels: Record<CategoryFilter, string> = {
  all: "전체",
  general: "일반",
  weekend_holiday: "주말·공휴일",
  weekday_evening: "평일 저녁",
};

const sourceClassNames: Record<string, string> = {
  서울시: "source source-seoul",
  네이버: "source source-naver",
  강동구: "source source-gangdong",
};

function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    const stored = window.localStorage.getItem(key);
    if (!stored) {
      return fallback;
    }

    try {
      return JSON.parse(stored) as T;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

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

function normalizeText(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function getVenueLinks(venue: Venue, category: CategoryFilter, favoriteIds: string[], favoritesOnly: boolean) {
  return venue.links.filter((link) => {
    const categoryMatches = category === "all" || link.category === category;
    const favoriteMatches = !favoritesOnly || favoriteIds.includes(link.id);
    return categoryMatches && favoriteMatches;
  });
}

function App() {
  const [now, setNow] = useState(() => new Date());
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [selectedVenue, setSelectedVenue] = useState("all");
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useStoredState<string[]>("tennis.favoriteLinks", []);
  const [notes, setNotes] = useStoredState<Record<string, string>>("tennis.venueNotes", {});
  const [notificationState, setNotificationState] = useState<NotificationState>(() => getNotificationState());
  const notifiedEventIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const upcomingOpens = useMemo(() => getUpcomingOpens(venues, now), [now]);
  const primaryOpen = upcomingOpens[0];
  const normalizedQuery = normalizeText(query);

  const filteredVenues = useMemo(() => {
    return venues.filter((venue) => {
      if (selectedVenue !== "all" && venue.id !== selectedVenue) {
        return false;
      }

      const links = getVenueLinks(venue, category, favoriteIds, favoritesOnly);

      if (links.length === 0) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchable = normalizeText(
        [
          venue.name,
          venue.area,
          venue.openRules.map((rule) => `${rule.label} ${rule.targetPeriod ?? ""}`).join(" "),
          links.map((link) => `${link.label} ${link.court ?? ""} ${link.source}`).join(" "),
        ].join(" "),
      );

      return searchable.includes(normalizedQuery);
    });
  }, [category, favoriteIds, favoritesOnly, normalizedQuery, selectedVenue]);

  const totalLinks = venues.reduce((sum, venue) => sum + venue.links.length, 0);
  const favoriteCount = favoriteIds.length;
  const primaryLinks = getVenueLinks(primaryOpen.venue, "all", favoriteIds, false);

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

  function toggleFavorite(linkId: string) {
    setFavoriteIds((current) =>
      current.includes(linkId) ? current.filter((id) => id !== linkId) : [...current, linkId],
    );
  }

  function updateNote(venueId: string, note: string) {
    setNotes((current) => ({
      ...current,
      [venueId]: note,
    }));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Asia/Seoul 기준</p>
          <h1>테니스 예약 링크</h1>
        </div>
        <div className="topbar-meta">
          <Clock aria-hidden="true" size={18} />
          <span>{formatDateTime(now)}</span>
        </div>
      </header>

      <section className="summary-grid" aria-label="예약 요약">
        <div className="primary-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">다음 예약 오픈</p>
              <h2>{primaryOpen.venue.name}</h2>
            </div>
            <span className={primaryOpen.isOpen ? "status status-live" : "status"}>
              {primaryOpen.isOpen ? "지금" : "예정"}
            </span>
          </div>

          <div className="countdown-row">
            <Timer aria-hidden="true" size={28} />
            <strong>{formatCountdown(primaryOpen.opensAt, now, primaryOpen.isOpen)}</strong>
          </div>

          <dl className="open-details">
            <div>
              <dt>오픈</dt>
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

          <div className="quick-links">
            {primaryLinks.slice(0, 3).map((link) => (
              <ReservationButton key={link.id} link={link} compact />
            ))}
          </div>

          <div className="action-row">
            <button className="control-button" type="button" onClick={() => downloadCalendar(primaryOpen)}>
              <CalendarPlus aria-hidden="true" size={18} />
              캘린더
            </button>
            <button
              className="control-button"
              type="button"
              onClick={requestNotifications}
              disabled={notificationState === "denied" || notificationState === "unsupported"}
            >
              <Bell aria-hidden="true" size={18} />
              {notificationState === "granted" ? "알림 켜짐" : "알림"}
            </button>
          </div>
        </div>

        <div className="metric-panel">
          <span className="metric-label">등록 링크</span>
          <strong>{totalLinks}</strong>
          <span>서울시·네이버·강동구</span>
        </div>
        <div className="metric-panel">
          <span className="metric-label">즐겨찾기</span>
          <strong>{favoriteCount}</strong>
          <span>{favoritesOnly ? "즐겨찾기만 표시" : "전체 표시"}</span>
        </div>
      </section>

      <section className="toolbar" aria-label="예약 필터">
        <label className="search-field">
          <Search aria-hidden="true" size={18} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="장소, 코트, 지역 검색"
          />
        </label>

        <label className="select-field">
          <MapPin aria-hidden="true" size={18} />
          <select value={selectedVenue} onChange={(event) => setSelectedVenue(event.target.value)}>
            <option value="all">모든 장소</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        </label>

        <div className="segmented-control" role="group" aria-label="코트 유형">
          {(Object.keys(categoryLabels) as CategoryFilter[]).map((key) => (
            <button
              key={key}
              className={category === key ? "active" : ""}
              type="button"
              onClick={() => setCategory(key)}
            >
              {categoryLabels[key]}
            </button>
          ))}
        </div>

        <button
          className={favoritesOnly ? "control-button active-control" : "control-button"}
          type="button"
          onClick={() => setFavoritesOnly((value) => !value)}
        >
          <Filter aria-hidden="true" size={18} />
          즐겨찾기
        </button>
      </section>

      <div className="content-layout">
        <section className="venue-list" aria-label="예약 링크 목록">
          {filteredVenues.map((venue) => (
            <VenueSection
              key={venue.id}
              venue={venue}
              category={category}
              favoriteIds={favoriteIds}
              favoritesOnly={favoritesOnly}
              note={notes[venue.id] ?? ""}
              now={now}
              onFavorite={toggleFavorite}
              onNoteChange={updateNote}
            />
          ))}

          {filteredVenues.length === 0 && (
            <div className="empty-state">
              <Search aria-hidden="true" size={22} />
              <strong>표시할 예약 링크가 없습니다.</strong>
            </div>
          )}
        </section>

        <aside className="upcoming-panel" aria-label="다가오는 예약 오픈">
          <div className="side-heading">
            <h2>다가오는 오픈</h2>
            <span>{upcomingOpens.length}개</span>
          </div>
          <ol className="upcoming-list">
            {upcomingOpens.slice(0, 8).map((event) => (
              <li key={event.id}>
                <div>
                  <strong>{event.venue.name}</strong>
                  <span>{event.rule.targetPeriod ?? event.rule.label}</span>
                </div>
                <time>{formatDateTime(event.opensAt)}</time>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </main>
  );
}

type VenueSectionProps = {
  venue: Venue;
  category: CategoryFilter;
  favoriteIds: string[];
  favoritesOnly: boolean;
  note: string;
  now: Date;
  onFavorite: (linkId: string) => void;
  onNoteChange: (venueId: string, note: string) => void;
};

function VenueSection({
  venue,
  category,
  favoriteIds,
  favoritesOnly,
  note,
  now,
  onFavorite,
  onNoteChange,
}: VenueSectionProps) {
  const links = getVenueLinks(venue, category, favoriteIds, favoritesOnly);
  const nextOpen = getUpcomingOpens([venue], now)[0];

  return (
    <article className="venue-section">
      <div className="venue-header">
        <div>
          <span className="venue-area">{venue.area}</span>
          <h2>{venue.name}</h2>
        </div>
        <div className="venue-next">
          <span>{formatCountdown(nextOpen.opensAt, now, nextOpen.isOpen)}</span>
          <time>{formatDateTime(nextOpen.opensAt)}</time>
        </div>
      </div>

      <div className="rule-row">
        {venue.openRules.map((rule) => (
          <span key={rule.id} className="rule-chip">
            <Clock aria-hidden="true" size={14} />
            {rule.label}
            {rule.targetPeriod ? ` · ${rule.targetPeriod}` : ""}
          </span>
        ))}
      </div>

      <div className="link-grid">
        {links.map((link) => (
          <LinkCard
            key={link.id}
            link={link}
            isFavorite={favoriteIds.includes(link.id)}
            onFavorite={onFavorite}
          />
        ))}
      </div>

      <label className="note-field">
        <span>메모</span>
        <textarea
          value={note}
          onChange={(event) => onNoteChange(venue.id, event.target.value)}
          placeholder="선호 시간, 로그인 상태, 주의할 점"
          rows={2}
        />
      </label>
    </article>
  );
}

type LinkCardProps = {
  link: ReservationLink;
  isFavorite: boolean;
  onFavorite: (linkId: string) => void;
};

function LinkCard({ link, isFavorite, onFavorite }: LinkCardProps) {
  return (
    <div className="link-card">
      <div className="link-card-top">
        <div>
          <span className={sourceClassNames[link.source] ?? "source"}>{link.source}</span>
          <h3>{link.label}</h3>
        </div>
        <button
          className={isFavorite ? "icon-button favorite-active" : "icon-button"}
          type="button"
          onClick={() => onFavorite(link.id)}
          aria-label={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
        >
          <Star aria-hidden="true" size={18} />
        </button>
      </div>
      <div className="link-meta">
        <span>{categoryLabels[link.category]}</span>
        {link.court && <span>{link.court}</span>}
      </div>
      <ReservationButton link={link} />
    </div>
  );
}

function ReservationButton({ link, compact = false }: { link: ReservationLink; compact?: boolean }) {
  return (
    <a className={compact ? "reservation-button compact" : "reservation-button"} href={link.url} target="_blank">
      <ExternalLink aria-hidden="true" size={17} />
      {compact ? link.label : "예약 열기"}
    </a>
  );
}

export default App;
