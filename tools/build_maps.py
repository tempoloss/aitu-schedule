"""Convert the aitumap React components into standalone SVG files.

Source: https://github.com/Yuujiso/aitumap (MIT). Geometry is untouched, only the
JSX wrapper is removed and `className` becomes `class`. Colours live in style.css.

    git clone --depth 1 https://github.com/Yuujiso/aitumap.git
    python tools/build_maps.py <path-to-clone>
"""
import os
import re
import sys

FLOOR_VIEWBOX = "0 0 924.69 396.16"
BLOCK_VIEWBOX = {
    "C1_1": "0 0 347.52 354.54",
    "C1_2": "0 0 328.03 329.11",
    "C1_3": "0 0 347.52 354.54",
}

DROP_TAGS = (
    "Stairs",
    "IconsCommon",
    "IconsEscapeFirstSecond",
    "IconsEscapesFirstSecond",
    "IconsEscapesSecondThird",
)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def inner(jsx, tag):
    """Everything between <Tag> and its matching closing tag."""
    open_at = jsx.index("<%s>" % tag) + len(tag) + 2
    return jsx[open_at: jsx.rindex("</%s>" % tag)]


def component_body(path):
    """The <g>...</g> a WALLPAPER_ component returns."""
    src = read(path)
    return src[src.index("<g "): src.rindex("</g>") + 4]


def icon_section(path, flag):
    """ICONS_C1_x either renders {isFirst && (...)} blocks or one common group."""
    src = read(path)
    marker = "{%s && (" % flag
    if marker not in src:
        return component_body(path)
    start = src.index(marker) + len(marker)
    depth, i = 1, start
    while depth:
        if src[i] == "(":
            depth += 1
        elif src[i] == ")":
            depth -= 1
        i += 1
    return src[start:i - 1]


def clean(fragment):
    for tag in DROP_TAGS:
        fragment = re.sub(r"<%s\b[^>]*/>" % tag, "", fragment)
    fragment = re.sub(r"<(?:WALLPAPER|ICONS)_C1_\d\b[^>]*/>", "", fragment)
    fragment = fragment.replace("<>", "").replace("</>", "")
    return fragment.replace("className=", "class=")


def wrap(view_box, *parts):
    body = "\n".join(p for p in parts if p.strip())
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s">\n%s\n</svg>\n' % (view_box, body)


def build(repo, out):
    ui = os.path.join(repo, "src", "shared", "ui")
    os.makedirs(out, exist_ok=True)
    written = []

    wallpaper = clean(component_body(os.path.join(ui, "general", "map", "Wallpaper.jsx")))
    for floor in (1, 2, 3):
        jsx = read(os.path.join(ui, "others", "C1_ALL_%d.jsx" % floor))
        written.append(("F%d.svg" % floor, wrap(FLOOR_VIEWBOX, wallpaper, clean(inner(jsx, "MapLayout")))))

    flags = {1: "isFirst", 2: "isSecond", 3: "isThird"}
    for block in (1, 2, 3):
        key = "C1_%d" % block
        paper = clean(component_body(os.path.join(ui, "general", "minimap", "WALLPAPER_%s.jsx" % key)))
        icons_src = os.path.join(ui, "general", "minimap", "ICONS_%s.jsx" % key)
        for floor in (1, 2, 3):
            jsx = read(os.path.join(ui, "separate", "%s_%d.jsx" % (key, floor)))
            layout = "LayoutMinimapMiddle" if "LayoutMinimapMiddle" in jsx else "LayoutMinimap"
            icons = clean(icon_section(icons_src, flags[floor]))
            svg = wrap(BLOCK_VIEWBOX[key], paper, clean(inner(jsx, layout)), icons)
            written.append(("%s_%d.svg" % (key, floor), svg))

    for name, svg in written:
        with open(os.path.join(out, name), "w", encoding="utf-8") as fh:
            fh.write(svg)
        rooms = len(set(re.findall(r'data-name="([^"]+)"', svg)))
        stray = re.findall(r"<[A-Z][A-Za-z0-9_]*", svg)
        print("%-12s %7d bytes  %3d rooms  %s" % (name, len(svg), rooms, "STRAY " + str(set(stray)) if stray else "ok"))


if __name__ == "__main__":
    repo = sys.argv[1] if len(sys.argv) > 1 else r"C:\tmp\aitumap-src"
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    build(repo, os.path.join(here, "public", "maps"))
