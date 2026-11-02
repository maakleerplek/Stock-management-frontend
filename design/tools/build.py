"""Turn page captures (capture.js output) into a FigCraft run script.

Usage: python3 build.py layout.json out-script.json
layout.json: {"pages": [{"name": "Public", "rows": [{"label": "Checkout", "caps": ["cap/pub-checkout-1440.json", ...]}]}]}
Each row becomes one line of frames, one per capture (sizes side by side).
"""
import base64
import json
import re
import sys
from pathlib import Path

MONO = "DejaVu Sans Mono"  # ui-monospace; common on Linux, falls back elsewhere
WEIGHT = {100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black"}
GAP = 200


def hexcol(c):
    if c and c.startswith("#"):
        return c
    m = re.match(r"rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)", c or "")
    if not m:
        return None
    r, g, b = (round(float(v)) for v in m.groups()[:3])
    a = m.group(4)
    h = f"#{r:02X}{g:02X}{b:02X}"
    return h + f"{round(float(a) * 255):02X}" if a is not None and float(a) < 1 else h


def shadow(s):
    # first shadow only: "rgba(0, 0, 0, 0.1) 0px 1px 3px 0px"
    m = re.match(r"(rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?(\s+inset)?", s or "")
    if not m or m.group(6):
        return None
    return [{"type": "dropShadow", "color": hexcol(m.group(1)), "offset": [float(m.group(2)), float(m.group(3))], "radius": float(m.group(4)), "spread": float(m.group(5) or 0)}]


class Script:
    def __init__(self):
        self.steps, self.n = [], 0

    def ref(self):
        self.n += 1
        return f"n{self.n}"

    def add(self, command, params, ref=None):
        s = {"command": command, "params": params}
        if ref:
            s["as"] = ref
        self.steps.append(s)

    def frame(self, node, parent, px, py):
        ref = self.ref()
        props = {"fill": hexcol(node.get("bg")) or "none", "clip": bool(node.get("clip"))}
        r = node.get("r") or [0, 0, 0, 0]
        if any(r):
            props["cornerRadius"] = r if len(set(r)) > 1 else r[0]
        if node.get("bw"):
            bw, bc = node["bw"], node["bc"]
            visible = [i for i in range(4) if bw[i] > 0]
            props["stroke"] = hexcol(bc[visible[0]])
            props["strokeAlign"] = "inside"
            if len(set(bw)) == 1:
                props["strokeWeight"] = bw[0]
            else:
                for i, side in enumerate(["Top", "Right", "Bottom", "Left"]):
                    props[f"stroke{side}Weight"] = bw[i]
        fx = shadow(node.get("shadow"))
        if fx:
            props["effects"] = fx
        if node.get("op", 1) < 1:
            props["opacity"] = node["op"]
        self.add("node.create", {"type": "frame", "parent": parent, "x": node["x"] - px, "y": node["y"] - py,
                                 "width": max(node["w"], 1), "height": max(node["h"], 1), "name": node.get("name") or "frame",
                                 "props": props, "select": False}, ref)
        for k in node.get("kids", []):
            self.node(k, {"$ref": ref}, node["x"], node["y"])

    def text(self, node, parent, px, py):
        f = node["font"]
        fam = MONO if "mono" in f["f"].lower() else f["f"]
        txt = node["txt"]
        if f.get("tt") == "uppercase":
            txt = txt.upper()
        props = {"fontFamily": fam, "fontStyle": WEIGHT.get(int(f["w"]), "Regular"), "fontSize": f["s"], "fill": hexcol(f["c"]) or "#000000"}
        if f["lh"].endswith("px"):
            props["lineHeight"] = float(f["lh"][:-2])
        if f["al"] in ("center", "right"):
            props["textAlign"] = f["al"]
        if node.get("lines", 1) > 1:
            props["textAutoResize"] = "height"
            props["width"] = node["w"] + 1
        self.add("node.create", {"type": "text", "parent": parent, "x": node["x"] - px, "y": node["y"] - py,
                                 "text": txt, "name": txt[:40], "props": props, "select": False})

    def svg(self, node, parent, px, py):
        ref = self.ref()
        self.add("file.import", {"data": base64.b64encode(node["svg"].encode()).decode(), "name": f"{node.get('name') or 'icon'}.svg"}, ref)
        self.add("node.reparent", {"ids": [{"$ref": ref}], "parent": parent})
        self.add("node.set", {"ids": [{"$ref": ref}], "props": {"x": node["x"] - px, "y": node["y"] - py, "name": node.get("name") or "icon"}})

    def image(self, node, parent, px, py):
        if not node.get("src"):
            self.add("node.create", {"type": "rectangle", "parent": parent, "x": node["x"] - px, "y": node["y"] - py, "width": node["w"], "height": node["h"],
                                     "name": node["name"], "props": {"fill": "#E3E1DB"}, "select": False})
            return
        head, data = node["src"].split(",", 1)
        if "svg" in head:  # an <img> of an .svg file: import it as editable vectors
            ref = self.ref()
            self.add("file.import", {"data": data, "name": f"{node['name']}.svg"}, ref)
            self.add("node.reparent", {"ids": [{"$ref": ref}], "parent": parent})
            self.add("node.set", {"ids": [{"$ref": ref}], "props": {"x": node["x"] - px, "y": node["y"] - py, "width": node["w"], "height": node["h"], "name": node["name"]}})
            return
        self.add("image.place", {"data": data, "parent": parent, "x": node["x"] - px, "y": node["y"] - py, "width": node["w"], "height": node["h"],
                                 "name": node["name"], "mode": "fit" if node.get("fit") == "contain" else "fill"})

    def node(self, node, parent, px, py):
        {"f": self.frame, "x": self.text, "s": self.svg, "i": self.image}[node["t"]](node, parent, px, py)


def load(path):
    d = json.loads(Path(path).read_text())
    return json.loads(d) if isinstance(d, str) else d


def main(layout_path, out):
    base = Path(layout_path).parent
    layout = json.loads(Path(layout_path).read_text())
    s = Script()
    if layout.get("variables"):
        s.add("variable.createCollection", {"name": "Maakleerplek"})
        for name, value in layout["variables"].items():
            s.add("variable.create", {"collection": "Maakleerplek", "name": name, "type": "color", "value": value})
    for pi, page in enumerate(layout["pages"]):
        if pi == 0:
            s.add("page.rename", {"name": page["name"]})
        else:
            s.add("page.add", {"name": page["name"]})
        y = 0
        for row in page["rows"]:
            x, row_h = 0, 0
            for cap_path in row["caps"]:
                if cap_path.endswith(".png"):  # a screenshot (the Slint kiosk has no DOM): one image layer in a frame
                    png = (base / cap_path).read_bytes()
                    w, h = int.from_bytes(png[16:20], "big"), int.from_bytes(png[20:24], "big")
                    ref = s.ref()
                    s.add("node.create", {"type": "frame", "x": x, "y": y, "width": w, "height": h, "name": "Kiosk / " + Path(cap_path).stem[3:].replace("-", " "), "props": {"clip": True}, "select": False}, ref)
                    s.add("image.place", {"data": base64.b64encode(png).decode(), "parent": {"$ref": ref}, "x": 0, "y": 0, "width": w, "height": h, "name": "screenshot"})
                    x += w + GAP
                    row_h = max(row_h, h)
                    continue
                cap = load(base / cap_path)
                ref = s.ref()
                s.add("node.create", {"type": "frame", "x": x, "y": y, "width": cap["w"], "height": cap["h"],
                                      "name": f"{row['label']} — {cap['w']}", "props": {"fill": hexcol(cap["bg"]) or "#FFFFFF", "clip": True}, "select": False}, ref)
                for k in cap["kids"]:
                    s.node(k, {"$ref": ref}, 0, 0)
                x += cap["w"] + GAP
                row_h = max(row_h, cap["h"])
            y += row_h + GAP
    Path(out).write_text(json.dumps(s.steps))
    print(f"{len(s.steps)} steps")


if __name__ == "__main__":
    main(*sys.argv[1:3])
