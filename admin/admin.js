import { DAYS, loadIndex, download } from "./lib/schedule.js";

const DRAFT = "admin-draft-v1";

const el = {};
for (const id of ["pick", "add", "dup", "del", "save", "dirty", "meta", "week", "outIndex", "outGroup", "outNote"]) {
  el[id] = document.getElementById(id);
}

let state = null; // { default, order:[id], groups:{id:group} }
let current = null;
let dirty = false;

const META = [
  ["title", "Название", "МКС-2601"],
  ["subtitle", "Подпись", "Математические и вычислительные науки · 1 курс"],
  ["year", "Учебный год", "2026–2027 учебный год"],
  ["period", "Период", "1 период · 1 неделя"],
  ["building", "Корпус", "Главный корпус"],
];

const emptyWeek = () => DAYS.map((d) => ({ name: d.name, short: d.short, dow: d.dow, lessons: [] }));

const emptyGroup = (id, title) => ({
  id,
  title,
  subtitle: "",
  year: "2026–2027 учебный год",
  period: "1 период · 1 неделя",
  building: "Главный корпус",
  term: { start: "2026-09-01", end: "2026-12-27", tz: "Asia/Almaty" },
  days: emptyWeek(),
});

// Group id becomes a filename and a ?g= value, so Cyrillic gets transliterated
// rather than percent-escaped into something unreadable.
const CYR = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya", ә: "a", ғ: "g", қ: "q", ң: "n", ө: "o", ұ: "u", ү: "u",
  һ: "h", і: "i",
};

const slug = (s) =>
  [...s.toLowerCase().trim()].map((c) => (c in CYR ? CYR[c] : c)).join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "group";

function touch() {
  dirty = true;
  el.dirty.hidden = false;
  localStorage.setItem(DRAFT, JSON.stringify(state));
  renderOutput();
}

/* ------------------------------- load ------------------------------- */

async function boot() {
  const draft = localStorage.getItem(DRAFT);
  if (draft) {
    try {
      state = JSON.parse(draft);
      dirty = true;
      el.dirty.hidden = false;
    } catch { state = null; }
  }
  if (!state) {
    const index = await loadIndex();
    state = { default: index.default, order: [], groups: {} };
    for (const g of index.groups) {
      const data = await (await fetch("data/" + g.file)).json();
      data.id = data.id || g.id;
      state.order.push(data.id);
      state.groups[data.id] = data;
    }
  }
  current = state.order[0];
  renderAll();
}

/* ------------------------------ render ------------------------------ */

function renderAll() {
  renderPicker();
  renderMeta();
  renderWeek();
  renderOutput();
}

function renderPicker() {
  el.pick.innerHTML = "";
  for (const id of state.order) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = state.groups[id].title + (id === state.default ? "  (по умолчанию)" : "");
    if (id === current) o.selected = true;
    el.pick.appendChild(o);
  }
}

function field(label, value, oninput, type = "text") {
  const wrap = document.createElement("label");
  wrap.className = "adm__field";
  wrap.innerHTML = `<span>${label}</span>`;
  const inp = document.createElement("input");
  inp.type = type;
  inp.value = value ?? "";
  inp.oninput = () => { oninput(inp.value); touch(); };
  wrap.appendChild(inp);
  return wrap;
}

function renderMeta() {
  const g = state.groups[current];
  el.meta.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "adm__grid";

  grid.appendChild(field("id (имя файла)", g.id, (v) => {
    const old = g.id;
    const next = slug(v);
    if (!next || next === old) return;
    delete state.groups[old];
    g.id = next;
    state.groups[next] = g;
    state.order[state.order.indexOf(old)] = next;
    if (state.default === old) state.default = next;
    current = next;
    renderPicker();
  }));

  for (const [key, label] of META) grid.appendChild(field(label, g[key], (v) => { g[key] = v; }));

  g.term = g.term || { start: "", end: "", tz: "Asia/Almaty" };
  grid.appendChild(field("Начало семестра", g.term.start, (v) => { g.term.start = v; }, "date"));
  grid.appendChild(field("Конец семестра", g.term.end, (v) => { g.term.end = v; }, "date"));

  const def = document.createElement("label");
  def.className = "adm__check";
  def.innerHTML = `<input type="checkbox" ${state.default === g.id ? "checked" : ""}><span>показывать по умолчанию</span>`;
  def.querySelector("input").onchange = (e) => {
    if (e.target.checked) state.default = g.id;
    touch();
    renderPicker();
  };

  el.meta.appendChild(grid);
  el.meta.appendChild(def);
}

function renderWeek() {
  const g = state.groups[current];
  el.week.innerHTML = "";

  g.days.forEach((day) => {
    const box = document.createElement("section");
    box.className = "adm__day";
    box.innerHTML = `<h2 class="adm__h2">${day.name} <span class="adm__count">${day.lessons.length}</span></h2>`;

    day.lessons.forEach((lesson, i) => box.appendChild(lessonRow(day, lesson, i)));

    const add = document.createElement("button");
    add.className = "head__btn";
    add.textContent = "+ пара";
    add.onclick = () => {
      day.lessons.push({ start: "09:00", end: "09:50", code: "", subject: "", kind: "Практические занятия", teacher: "", room: null });
      touch();
      renderWeek();
    };
    box.appendChild(add);
    el.week.appendChild(box);
  });
}

function lessonRow(day, lesson, i) {
  const row = document.createElement("div");
  row.className = "adm__row";

  const put = (ph, key, cls) => {
    const inp = document.createElement("input");
    inp.placeholder = ph;
    inp.value = lesson[key] ?? "";
    if (cls) inp.className = cls;
    inp.oninput = () => { lesson[key] = inp.value; touch(); };
    row.appendChild(inp);
    return inp;
  };

  put("08:00", "start", "adm__t");
  put("08:50", "end", "adm__t");
  put("предмет", "subject", "adm__grow");
  put("вид", "kind");
  put("препод", "teacher");
  put("код", "code");

  const room = document.createElement("input");
  room.placeholder = "C1.2.240K";
  room.className = "adm__room";
  room.value = lesson.room ?? "";
  room.disabled = lesson.room === null;
  room.oninput = () => { lesson.room = room.value.trim().toUpperCase() || null; touch(); };
  row.appendChild(room);

  const online = document.createElement("label");
  online.className = "adm__check adm__check--tight";
  online.innerHTML = `<input type="checkbox" ${lesson.room === null ? "checked" : ""}><span>онлайн</span>`;
  online.querySelector("input").onchange = (e) => {
    lesson.room = e.target.checked ? null : (room.value.trim().toUpperCase() || "C1.1.101");
    touch();
    renderWeek();
  };
  row.appendChild(online);

  const kill = document.createElement("button");
  kill.className = "adm__x";
  kill.textContent = "×";
  kill.title = "удалить пару";
  kill.onclick = () => { day.lessons.splice(i, 1); touch(); renderWeek(); };
  row.appendChild(kill);

  return row;
}

function buildIndex() {
  return {
    default: state.default,
    groups: state.order.map((id) => ({ id, name: state.groups[id].title, file: `groups/${id}.json` })),
  };
}

function renderOutput() {
  el.outIndex.textContent = JSON.stringify(buildIndex(), null, 2);
  el.outGroup.textContent = JSON.stringify(state.groups[current], null, 2);
  el.outNote.textContent =
    `${state.order.length} групп · файлы кладутся в public/data/, ` +
    `группа — в public/data/groups/${current}.json`;
}

/* ------------------------------ actions ------------------------------ */

el.pick.onchange = () => { current = el.pick.value; renderMeta(); renderWeek(); renderOutput(); };

el.add.onclick = () => {
  const name = prompt("Название группы", "МКС-2602");
  if (!name) return;
  const id = slug(name);
  if (state.groups[id]) return alert("Такая группа уже есть");
  state.groups[id] = emptyGroup(id, name);
  state.order.push(id);
  current = id;
  touch();
  renderAll();
};

el.dup.onclick = () => {
  const name = prompt("Название копии", state.groups[current].title + " копия");
  if (!name) return;
  const id = slug(name);
  if (state.groups[id]) return alert("Такая группа уже есть");
  const copy = JSON.parse(JSON.stringify(state.groups[current]));
  copy.id = id;
  copy.title = name;
  state.groups[id] = copy;
  state.order.push(id);
  current = id;
  touch();
  renderAll();
};

el.del.onclick = () => {
  if (state.order.length === 1) return alert("Последнюю группу удалить нельзя");
  if (!confirm(`Удалить ${state.groups[current].title}?`)) return;
  delete state.groups[current];
  state.order = state.order.filter((x) => x !== current);
  if (state.default === current) state.default = state.order[0];
  current = state.order[0];
  touch();
  renderAll();
};

el.save.onclick = () => {
  download("groups.json", JSON.stringify(buildIndex(), null, 2), "application/json");
  for (const id of state.order) {
    setTimeout(() => download(`${id}.json`, JSON.stringify(state.groups[id], null, 2), "application/json"), 150);
  }
  localStorage.removeItem(DRAFT);
  dirty = false;
  el.dirty.hidden = true;
};

boot();
