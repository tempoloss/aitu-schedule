# schedule.an8kk.dev

Weekly timetable for AITU student groups, with a floor plan of the campus. Click a room and the map opens the right block and floor and drops a pin on the room.

No dependencies, no build step. Static files served from Cloudflare Workers.

## Run and deploy

```
python tools/serve.py        # local server for public/, no-store caching
npx wrangler deploy          # only public/ is uploaded
```

http://127.0.0.1:8777/ · https://schedule.an8kk.dev

## Layout

```
public/index.html            timetable page
public/app.js                timetable view, room pin, map pan and zoom
public/lib/schedule.js       shared code: group loading, room parsing
public/style.css             light and dark theme tokens, including the SVG map palette
public/fonts/                Inter and JetBrains Mono, Latin and Cyrillic
public/data/groups.json      group index and default group
public/data/groups/<id>.json weekly timetable for one group
public/maps/F1..F3.svg       whole floor, all three blocks
public/maps/C1_B_F.svg       block B on floor F, nine files
tools/serve.py               local server for public/ with no-store
tools/build_maps.py          generates all twelve SVG maps from the aitumap sources
wrangler.toml                deployment and custom domain
```

`public/` is exactly what gets published. Everything else (`wrangler.toml`, `tools/`) stays off the edge.

The look uses the same design language as roadrage: oklch tokens, cards with an inner ring, segmented switches, and a monospace face for times and room numbers. The theme follows the system setting. An inline script in `<head>` sets `data-theme` before the first paint, and a `matchMedia(...).addEventListener("change", …)` listener switches the page live while it is open.

## Groups

`data/groups.json` is a flat index: `default` plus a list of `{id, name, file}`. Each group file is self-contained and holds its metadata and the weekly grid.

On the first visit, if there is more than one group, a picker is shown. The answer is stored in `localStorage` and not asked again. Group resolution order: `?g=<id>` in the URL → `localStorage` → picker → `default`.

When there is more than one group, a group selector appears in the header and switches groups without a reload. A link such as `schedule.an8kk.dev/?g=mks-2602` can be shared as is and skips the picker.

Ids are transliterated from the name: `МКС-2602` → `mks-2602`. The id is also the file name and the `?g=` value, so it must not contain Cyrillic.

Rooms of the form `C1.<block>.<floor>NN` are clickable and highlighted on the plan. Everything else, such as `IEC-302` and other buildings, is shown as a dashed chip without a map button, because there are no plans for those buildings here. The check lives in `mappable()` in `lib/schedule.js`. Without it, `blockOf` returned `C1_undefined` and `floorOf` threw.

## Map

Rooms are marked with a `data-name` attribute (`C1.2.240K`). Everything else is derived from it: `C1.2` is the block, and the first digit of the number is the floor. This is the same rule the original map uses.

By default the map opens on a **block** plan rather than a whole floor. A whole floor is 924×396 units, and on a phone the room numbers are unreadable at that width. The pin is drawn at the center of the target group's bounding box and the room is filled in blue. There is no zoom needed: both the room and its neighbours are visible. The full floor is available through the "весь" (whole) button.

## Where the plans come from

The plans come from [Yuujiso/aitumap](https://github.com/Yuujiso/aitumap), MIT. The author asks for attribution, so this is it. `tools/build_maps.py` takes a clone of that repository and extracts the JSX components: `others/C1_ALL_*` for floors, `separate/C1_*_*` for blocks, plus `WALLPAPER_*` and `ICONS_*`. It then converts `className` to `class`, removes the React wrappers, and wraps the result in `<svg viewBox>`. The geometry is unchanged; only the colours are changed, through this site's own CSS.

```
git clone --depth 1 https://github.com/Yuujiso/aitumap.git
python tools/build_maps.py ../aitumap
```

The original does not offer a direct link to a room: its state lives only in React, with no URL parameters. That is why the plans are rendered here rather than embedded in an iframe.

## Known gaps

- Two course codes are truncated in the source screenshots: `CAL52-EN-P2…` and `HK(STATEE)5…`. They are stored in the group file as they are.
- Only week 1 of period 1 is loaded. If the period has a second week, it is not here.
- The semester dates in `term` are estimates.
