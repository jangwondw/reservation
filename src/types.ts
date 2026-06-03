export type LinkCategory = "general" | "weekend_holiday" | "weekday_evening";

export type OpenRule = {
  id: string;
  label: string;
  dayOfMonth: number;
  hour: number;
  minute: number;
  windowEnd?: {
    hour: number;
    minute: number;
  };
  targetPeriod?: string;
};

export type ReservationLink = {
  id: string;
  label: string;
  court?: string;
  category: LinkCategory;
  url: string;
  source: string;
};

export type Venue = {
  id: string;
  name: string;
  area: string;
  openRules: OpenRule[];
  links: ReservationLink[];
};

export type UpcomingOpen = {
  id: string;
  venue: Venue;
  rule: OpenRule;
  opensAt: Date;
  closesAt: Date;
  isOpen: boolean;
};
