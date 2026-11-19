import type { PlanResult } from "./rules";

// Extra all-day events that are exported but are not plan/action items (for
// example the Form I-539 extension dates). They carry no completion state.
export type CalendarEvent = {
  id: string;
  dueDate: string;
  title: string;
  description: string;
  source: { url: string };
};

// All-day dates avoid timezone shifts. This is a snapshot, not a calendar subscription.
export function calendarFile(plan: Pick<PlanResult, "items">, extraEvents: CalendarEvent[] = []) {
  const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Immigrant OS//Action plan//EN", "CALSCALE:GREGORIAN"];
  const events = [...plan.items.filter((item) => item.dueDate && !item.completed), ...extraEvents];
  for (const item of events) {
    const end = new Date(`${item.dueDate}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    lines.push("BEGIN:VEVENT", `UID:${encodeURIComponent(item.id)}@immigrantos`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${item.dueDate!.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, "")}`,
      `SUMMARY:${escape(item.title)}`, `DESCRIPTION:${escape(`${item.description}\n${item.source.url}`)}`,
      "TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  // Fold at 75 UTF-8 octets, as required by iCalendar.
  return lines.map((line) => {
    let result = "", width = 0;
    for (const char of line) {
      const size = new TextEncoder().encode(char).length;
      if (width + size > 75) { result += "\r\n "; width = 1; }
      result += char; width += size;
    }
    return result;
  }).join("\r\n") + "\r\n";
}
