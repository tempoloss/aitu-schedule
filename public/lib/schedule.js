// Loading and room parsing live here rather than in app.js, so the schedule
// view never re-derives them from the DOM.

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
