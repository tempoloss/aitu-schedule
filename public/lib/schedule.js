// Loading, event shapes and room parsing live here rather than in app.js, so a
// future Google Calendar sync never has to re-derive events from the DOM.

export const DAYS = [
  { name: "Понедельник", short: "Пн", dow: 1 },
  { name: "Вторник", short: "Вт", dow: 2 },
  { name: "Среда", short: "Ср", dow: 3 },
  { name: "Четверг", short: "Чт", dow: 4 },
  { name: "Пятница", short: "Пт", dow: 5 },
  { name: "Суббота", short: "Сб", dow: 6 },
];

export const minutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// C1.2.240K -> block C1_2, floor 2. Same rule the university map uses.
// Only the main building follows it; IEC rooms are a different building with no plan here.
export const mappable = (room) => /^C1\.[1-3]\.\d/.test(room || "");
export const blockOf = (room) => "C1_" + room.split(".")[1];
export const floorOf = (room) => Number(room.split(".")[2].charAt(0));

export async function loadIndex() {
  const res = await fetch("data/groups.json");
  if (!res.ok) throw new Error("нет data/groups.json");
  return res.json();
}

export async function loadGroup(index, id) {
  const entry = index.groups.find((g) => g.id === id) || index.groups.find((g) => g.id === index.default) || index.groups[0];
  if (!entry) throw new Error("в индексе нет ни одной группы");
  const res = await fetch("data/" + entry.file);
  if (!res.ok) throw new Error("нет data/" + entry.file);
  const group = await res.json();
  return { entry, group };
}

/* ------------------------------ calendar ------------------------------ */

// One entry per lesson, already resolved to a concrete first date and a weekly
// rule. Both the .ics writer and a future Calendar API call consume this.
export function toEvents(group) {
  const term = group.term || {};
  const start = new Date((term.start || todayISO()) + "T00:00:00");
  const events = [];

  group.days.forEach((day, di) => {
    day.lessons.forEach((lesson, li) => {
      events.push({
        uid: `${group.id}-${di}-${li}@schedule.an8kk.dev`,
        summary: lesson.subject,
        location: lesson.room ? `${lesson.room} (${group.building})` : "Онлайн",
        description: [lesson.kind, lesson.teacher, lesson.code].filter(Boolean).join(" · "),
        first: firstDateOn(start, day.dow),
        start: lesson.start,
        end: lesson.end,
        until: term.end || null,
        online: !lesson.room,
        room: lesson.room || null,
      });
    });
  });
  return events;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function firstDateOn(from, dow) {
  const d = new Date(from);
  const shift = (dow - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + shift);
  return d;
}

const pad = (n) => String(n).padStart(2, "0");
const stamp = (d, hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(h)}${pad(m)}00`;
};

// Kazakhstan is UTC+5 all year, so a fixed-offset VTIMEZONE is honest here and
// avoids shipping a whole tzdata block. Revisit if the country adds DST again.
function vtimezone(tz) {
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${tz}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0500",
    "TZOFFSETTO:+0500",
    "TZNAME:+05",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

const escape = (s) => String(s).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");

// RFC 5545 wants lines folded at 75 octets.
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let cur = "";
  for (const ch of line) {
    const next = cur + ch;
    if (new TextEncoder().encode(next).length > 73 && cur) {
      out.push(cur);
      cur = " " + ch;
    } else {
      cur = next;
    }
  }
  out.push(cur);
  return out.join("\r\n");
}

export function toICS(group) {
  const tz = (group.term && group.term.tz) || "Asia/Almaty";
  const now = new Date();
  const dtstamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//schedule.an8kk.dev//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(group.title)}`,
    `X-WR-TIMEZONE:${tz}`,
    ...vtimezone(tz),
  ];

  for (const e of toEvents(group)) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=${tz}:${stamp(e.first, e.start)}`,
      `DTEND;TZID=${tz}:${stamp(e.first, e.end)}`,
      e.until ? `RRULE:FREQ=WEEKLY;UNTIL=${e.until.replace(/-/g, "")}T235959Z` : "RRULE:FREQ=WEEKLY",
      `SUMMARY:${escape(e.summary)}`,
      `LOCATION:${escape(e.location)}`,
      `DESCRIPTION:${escape(e.description)}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function download(name, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: type + ";charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
