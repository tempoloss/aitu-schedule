import { minutes, mappable, blockOf, floorOf, loadIndex, loadGroup, toICS, download } from "./lib/schedule.js";

const svgCache = new Map();

let index = null;
let group = null;
let activeDay = 0;
let view = { block: "C1_2", floor: 2, room: null, mode: localStorage.getItem("view") || "grid" };

const el = {};
for (const id of ["title", "subtitle", "meta", "now", "days", "list", "grid", "footNote",
  "groupPick", "ics", "sheet", "sheetRoom", "blocks", "floors", "mapHost",
  "openMap", "closeMap", "gate", "gateList", "viewToggle",
  "det", "detWhen", "detName", "detMeta", "detMap", "detClose"]) {
  el[id] = document.getElementById(id);
}

// First visit has nothing to go on: ask once, remember, and never ask again.
// The header select stays the way to change your mind.
function askGroup() {
  return new Promise((resolve) => {
    el.gate.hidden = false;
    el.gateList.innerHTML = "";
    for (const g of index.groups) {
      const b = document.createElement("button");
      b.className = "gate__pick";
      b.textContent = g.name;
      b.onclick = () => { el.gate.hidden = true; resolve(g.id); };
      el.gateList.appendChild(b);
    }
  });
}

/* ---------------------------- schedule ---------------------------- */

function currentLesson() {
  const dow = new Date().getDay();
  const day = group.days.find((d) => d.dow === dow);
  if (!day) return null;
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  for (const l of day.lessons) {
    if (now >= minutes(l.start) && now <= minutes(l.end)) return { lesson: l, state: "now" };
  }
  for (const l of day.lessons) {
    if (minutes(l.start) > now) return { lesson: l, state: "next", in: minutes(l.start) - now };
  }
  return null;
}

function renderNow() {
  const cur = currentLesson();
  if (!cur) return void (el.now.hidden = true);
  const where = cur.lesson.room || "онлайн";
  el.now.hidden = false;
  el.now.innerHTML = cur.state === "now"
    ? `сейчас идёт <b>${cur.lesson.subject}</b> · ${where} · до ${cur.lesson.end}`
    : `следующая через ${cur.in} мин · <b>${cur.lesson.subject}</b> · ${where} · в ${cur.lesson.start}`;
}

function renderDays() {
  const today = new Date().getDay();
  el.days.innerHTML = "";
  group.days.forEach((d, i) => {
    const b = document.createElement("button");
    b.className = "day" + (i === activeDay ? " is-active" : "") + (d.dow === today ? " is-today" : "");
    b.textContent = d.short;
    b.onclick = () => { activeDay = i; renderDays(); renderList(); };
    el.days.appendChild(b);
  });
}

function renderList() {
  const day = group.days[activeDay];
  el.list.innerHTML = "";
  if (!day || !day.lessons.length) return void (el.list.innerHTML = '<p class="empty">Пар нет</p>');

  const isToday = day.dow === new Date().getDay();
  const now = new Date().getHours() * 60 + new Date().getMinutes();

  for (const l of day.lessons) {
    const row = document.createElement("article");
    row.className = "lesson";
    if (isToday && now >= minutes(l.start) && now <= minutes(l.end)) row.classList.add("is-now");
    row.innerHTML = `
      <div class="lesson__time">
        <div class="lesson__from">${l.start}</div>
        <div class="lesson__to">${l.end}</div>
      </div>
      <div class="lesson__body">
        <div class="lesson__top">
          <span class="lesson__code">${l.code || ""}</span>
          ${!l.room
            ? `<span class="chip chip--online">Онлайн</span>`
            : mappable(l.room)
              ? `<button class="chip chip--room" data-room="${l.room}">${l.room}</button>`
              : `<span class="chip chip--far" title="другой корпус, плана нет">${l.room}</span>`}
        </div>
        <h2 class="lesson__name">${l.subject}</h2>
        <div class="lesson__meta"><span>${l.kind || ""}</span><span>${l.teacher || ""}</span></div>
      </div>`;
    el.list.appendChild(row);
  }
  el.list.querySelectorAll("[data-room]").forEach((b) => {
    b.onclick = () => openMap(b.dataset.room);
  });
}

function renderGroupPicker() {
  if (index.groups.length < 2) return void (el.groupPick.hidden = true);
  el.groupPick.hidden = false;
  el.groupPick.innerHTML = "";
  for (const g of index.groups) {
    const o = document.createElement("option");
    o.value = g.id;
    o.textContent = g.name;
    if (g.id === group.id) o.selected = true;
    el.groupPick.appendChild(o);
  }
  el.groupPick.onchange = () => switchGroup(el.groupPick.value);
}

/* ------------------------------- map ------------------------------- */

async function fetchSvg(name) {
  if (!svgCache.has(name)) svgCache.set(name, await (await fetch(`maps/${name}.svg`)).text());
  return svgCache.get(name);
}

function pinFor(g) {
  const b = g.getBBox();
  const ns = "http://www.w3.org/2000/svg";
  const pin = document.createElementNS(ns, "g");
  pin.setAttribute("class", "pin");
  pin.setAttribute("transform", `translate(${b.x + b.width / 2} ${b.y + b.height / 2})`);
  pin.innerHTML =
    '<circle class="pin__pulse" r="7"/>' +
    '<path class="pin__body" d="M0 2c-4.6-6.2-7-8.6-7-12.2a7 7 0 1 1 14 0C7-6.6 4.6-4.2 0 2z"/>' +
    '<circle class="pin__dot" cy="-10.2" r="2.6"/>';
  return pin;
}

async function draw() {
  const name = view.block === "ALL" ? `F${view.floor}` : `${view.block}_${view.floor}`;
  el.mapHost.innerHTML = await fetchSvg(name);
  const svg = el.mapHost.querySelector("svg");
  attachPanZoom(svg);

  if (view.room) {
    const g = svg.querySelector(`[data-name="${CSS.escape(view.room)}"]`);
    if (g) {
      g.classList.add("is-target");
      svg.appendChild(pinFor(g));
      el.sheetRoom.textContent = view.room;
    } else {
      el.sheetRoom.textContent = `${view.room} · нет на этом плане`;
    }
  } else {
    el.sheetRoom.textContent = "Карта корпуса";
  }
  renderControls();
}

function renderControls() {
  el.blocks.innerHTML = "";
  for (const [id, label] of [["C1_1", "C1.1"], ["C1_2", "C1.2"], ["C1_3", "C1.3"], ["ALL", "весь"]]) {
    const b = document.createElement("button");
    b.className = "seg" + (view.block === id ? " is-active" : "");
    b.textContent = label;
    b.onclick = () => { view.block = id; draw(); };
    el.blocks.appendChild(b);
  }
  el.floors.innerHTML = "";
  for (const f of [1, 2, 3]) {
    const b = document.createElement("button");
    b.className = "seg" + (view.floor === f ? " is-active" : "");
    b.textContent = f + "\u00A0эт";
    b.onclick = () => { view.floor = f; draw(); };
    el.floors.appendChild(b);
  }
}

function openMap(room) {
  el.sheet.hidden = false;
  view.room = room;
  if (room) {
    view.block = blockOf(room);
    view.floor = floorOf(room);
  }
  draw();
}

// Pointer events cover mouse and touch, but the two need different gestures:
// a mouse has a wheel, a finger has a second finger. Both end up mutating the
// same viewBox.
function attachPanZoom(svg) {
  const [x, y, w, h] = svg.getAttribute("viewBox").split(/\s+/).map(Number);
  const home = { x, y, w, h };
  const MIN = home.w / 25;
  const MAX = home.w * 1.4;
  let vb = { ...home };

  const apply = () => svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const clampW = (v) => Math.min(MAX, Math.max(MIN, v));
  const rect = () => svg.getBoundingClientRect();

  function reset() {
    vb = { ...home };
    apply();
  }

  // Keep the point under the cursor or under the pinch centre in place.
  function zoomTo(width, clientX, clientY, anchor) {
    const r = rect();
    const nw = clampW(width);
    const nh = nw * (vb.h / vb.w);
    vb = {
      x: anchor.x - nw * ((clientX - r.left) / r.width),
      y: anchor.y - nh * ((clientY - r.top) / r.height),
      w: nw,
      h: nh,
    };
    apply();
  }

  const atClient = (cx, cy, base) => {
    const r = rect();
    return {
      x: base.x + ((cx - r.left) / r.width) * base.w,
      y: base.y + ((cy - r.top) / r.height) * base.h,
    };
  };

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const anchor = atClient(e.clientX, e.clientY, vb);
    zoomTo(vb.w * (e.deltaY > 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY, anchor);
  }, { passive: false });

  const live = new Map();
  let pan = null;
  let pinch = null;
  let lastTap = 0;

  const two = () => [...live.values()];
  const spread = ([a, b]) => Math.hypot(a.x - b.x, a.y - b.y);
  const centre = ([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  svg.addEventListener("pointerdown", (e) => {
    svg.setPointerCapture(e.pointerId);
    live.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (live.size === 2) {
      const pts = two();
      const mid = centre(pts);
      pinch = { dist: spread(pts) || 1, vb: { ...vb }, anchor: atClient(mid.x, mid.y, vb) };
      pan = null;
      svg.classList.remove("is-panning");
    } else if (live.size === 1) {
      pan = { x: e.clientX, y: e.clientY, vb: { ...vb } };
      svg.classList.add("is-panning");
    }
  });

  svg.addEventListener("pointermove", (e) => {
    if (!live.has(e.pointerId)) return;
    live.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch && live.size >= 2) {
      const pts = two();
      const mid = centre(pts);
      zoomTo(pinch.vb.w * (pinch.dist / (spread(pts) || 1)), mid.x, mid.y, pinch.anchor);
      return;
    }
    if (pan) {
      const r = rect();
      vb.x = pan.vb.x - ((e.clientX - pan.x) / r.width) * pan.vb.w;
      vb.y = pan.vb.y - ((e.clientY - pan.y) / r.height) * pan.vb.h;
      apply();
    }
  });

  function lift(e) {
    live.delete(e.pointerId);
    if (live.size < 2) pinch = null;
    if (live.size === 0) {
      pan = null;
      svg.classList.remove("is-panning");
    } else if (live.size === 1) {
      // Second finger left mid-pinch: keep panning from where the first one is.
      const [p] = two();
      pan = { x: p.x, y: p.y, vb: { ...vb } };
    }
  }

  svg.addEventListener("pointerup", (e) => {
    const moved = pan && Math.hypot(e.clientX - pan.x, e.clientY - pan.y) > 12;
    lift(e);
    // dblclick does not fire reliably on touch, so tap twice is detected here.
    if (!moved && live.size === 0) {
      const now = Date.now();
      if (now - lastTap < 320) {
        reset();
        lastTap = 0;
      } else {
        lastTap = now;
      }
    }
  });
  svg.addEventListener("pointercancel", lift);
}

/* ------------------------------- boot ------------------------------- */

/* ------------------------------- grid ------------------------------- */

// Two consecutive slots of the same pair read as one block, which is what the
// week actually looks like and halves the number of cells on screen.
function merged(day) {
  const out = [];
  for (const l of day.lessons) {
    const prev = out[out.length - 1];
    const same = prev && prev.subject === l.subject && prev.room === l.room && prev.kind === l.kind;
    if (same && minutes(l.start) - minutes(prev.end) <= 15) {
      prev.end = l.end;
      prev.span += 1;
    } else {
      out.push({ ...l, span: 1 });
    }
  }
  return out;
}

function slots(g) {
  const set = new Set();
  g.days.forEach((d) => d.lessons.forEach((l) => set.add(l.start)));
  return [...set].sort((a, b) => minutes(a) - minutes(b));
}

function renderGrid() {
  const times = slots(group);
  const rowOf = new Map(times.map((t, i) => [t, i + 2]));
  const today = new Date().getDay();
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();

  el.grid.style.setProperty("--rows", times.length);
  el.grid.innerHTML = "";

  el.grid.appendChild(cell("g__corner", "", 1, 1));
  group.days.forEach((d, i) => {
    const h = cell("g__day" + (d.dow === today ? " is-today" : ""), d.short, 1, i + 2);
    el.grid.appendChild(h);
  });
  times.forEach((t, i) => el.grid.appendChild(cell("g__time", t, i + 2, 1)));

  group.days.forEach((day, di) => {
    for (const l of merged(day)) {
      const c = document.createElement("button");
      c.className = "g__cell" + (l.room ? "" : " is-online");
      if (day.dow === today && nowM >= minutes(l.start) && nowM <= minutes(l.end)) c.classList.add("is-now");
      c.style.gridRow = `${rowOf.get(l.start)} / span ${l.span}`;
      c.style.gridColumn = di + 2;
      c.innerHTML =
        `<span class="g__abbr">${(group.short && group.short[l.subject]) || l.subject}</span>` +
        `<span class="g__room">${l.room ? l.room.replace(/^C1\./, "") : "онлайн"}</span>`;
      if (l.room && !mappable(l.room)) c.classList.add("is-far");
      c.onclick = () => showDetail(l);
      el.grid.appendChild(c);
    }
  });
}

function cell(cls, text, row, col) {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text;
  d.style.gridRow = row;
  d.style.gridColumn = col;
  return d;
}

function showDetail(l) {
  el.det.hidden = false;
  el.detWhen.textContent = `${l.start} — ${l.end}`;
  el.detName.textContent = l.subject;
  el.detMeta.textContent = [l.kind, l.teacher, l.code, l.room || "Онлайн"].filter(Boolean).join(" · ");
  el.detMap.hidden = !mappable(l.room);
  el.detMap.onclick = () => { el.det.hidden = true; openMap(l.room); };
}

function setView(next) {
  view.mode = next;
  localStorage.setItem("view", next);
  const isGrid = next === "grid";
  el.grid.hidden = !isGrid;
  el.list.hidden = isGrid;
  el.days.hidden = isGrid;
  el.viewToggle.textContent = isGrid ? "список" : "сетка";
  if (isGrid) renderGrid(); else renderList();
}

// Дата окончания занятий важнее остальных: по ней обрезается календарь, и по
// ней же видно, что после 14 ноября пар в расписании быть не должно.
const DMY = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

function termLine(g) {
  const t = g.term;
  if (!t || !t.end) return "";
  const parts = [`занятия до ${DMY(t.end)}`];
  if (t.exams) parts.push(`сессия ${DMY(t.exams.start)} — ${DMY(t.exams.end)}`);
  return parts.join(" · ");
}

function paint() {
  el.title.textContent = group.title;
  el.subtitle.textContent = group.subtitle || "";
  el.meta.textContent = [group.year, group.period, group.building, termLine(group)]
    .filter(Boolean).join(" · ");

  const rooms = new Set();
  group.days.forEach((d) => d.lessons.forEach((l) => l.room && rooms.add(l.room)));
  el.footNote.textContent = `${rooms.size} аудиторий за неделю`;

  const today = group.days.findIndex((d) => d.dow === new Date().getDay());
  activeDay = today === -1 ? 0 : today;
  renderGroupPicker();
  renderDays();
  setView(view.mode);
  renderNow();
}

async function switchGroup(id) {
  ({ group } = await loadGroup(index, id));
  localStorage.setItem("group", group.id);
  const url = new URL(location.href);
  url.searchParams.set("g", group.id);
  history.replaceState(null, "", url);
  paint();
}

// The admin page is excluded from the deploy by public/.assetsignore, so the
// link is only worth showing where the file actually exists.
if (["localhost", "127.0.0.1"].includes(location.hostname)) {
  const links = document.getElementById("footLinks");
  links.insertAdjacentHTML("afterbegin", '<a href="admin.html">админка</a> · ');
}

// Nobody on a phone has a wheel or a double click.
if (matchMedia("(hover: none)").matches) {
  document.getElementById("mapHint").textContent =
    "два пальца — зум, один — сдвиг, двойное касание — сброс";
}

el.openMap.onclick = () => openMap(null);
el.closeMap.onclick = () => { el.sheet.hidden = true; };
el.ics.onclick = () => download(`${group.id}.ics`, toICS(group), "text/calendar");
el.viewToggle.onclick = () => setView(view.mode === "grid" ? "list" : "grid");
el.detClose.onclick = () => { el.det.hidden = true; };
el.det.onclick = (e) => { if (e.target === el.det) el.det.hidden = true; };
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  el.sheet.hidden = true;
  el.det.hidden = true;
});

(async function init() {
  index = await loadIndex();
  let wanted = new URL(location.href).searchParams.get("g") || localStorage.getItem("group");
  if (!wanted && index.groups.length > 1) wanted = await askGroup();
  ({ group } = await loadGroup(index, wanted || index.default));
  localStorage.setItem("group", group.id);
  paint();
  setInterval(() => { renderNow(); setView(view.mode); }, 60000);
})();
