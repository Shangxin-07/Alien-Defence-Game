/** Geoscape time steps from the original game: game seconds that pass per real second. */
export const TIME_SPEEDS = [
  { label: "Pause", rate: 0 },
  { label: "5 sec", rate: 5 },
  { label: "1 min", rate: 60 },
  { label: "5 min", rate: 300 },
  { label: "30 min", rate: 1800 },
  { label: "1 hour", rate: 3600 },
  { label: "1 day", rate: 86_400 },
] as const;

export const CAMPAIGN_START = Date.UTC(2031, 2, 14, 6, 0, 0);

export class GameClock {
  /** Current game time as UTC milliseconds. */
  time: number;
  /** Game seconds per real second. */
  rate: number;

  constructor(start = CAMPAIGN_START, rate = 60) {
    this.time = start;
    this.rate = rate;
  }

  /** Advances by a real-time delta in seconds. */
  tick(realSeconds: number): void {
    this.time += this.rate * realSeconds * 1000;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function formatClock(utcMs: number): { time: string; date: string } {
  const d = new Date(utcMs);
  return {
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`,
    date: `${DAYS[d.getUTCDay()]} ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
  };
}
