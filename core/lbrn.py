"""Draw a LightBurn project (.lbrn2) as a small PNG, for files without a thumbnail.

LightBurn stores a <Thumbnail> only in a file you save. Its autosave and _backup copies,
what a visitor works on before saving, have none: then we draw the shapes ourselves.

The format, as far as needed here:
- <Shape Type="Path" CutIndex="2" VertID=".." PrimID=".."> with <XForm>a b c d e f</XForm>,
  <VertList> ("V x y" per vertex, then c0x/c0y and c1x/c1y control points; "c0x1" alone
  means no control point) and <PrimList> ("L0 1" a line, "B1 2" a bezier from vertex 1 to 2).
  A later shape can reuse a list by its VertID/PrimID without repeating it.
- Rect (W, H, centred), Ellipse (Rx, Ry), Bitmap (W, H: drawn as a grey box), Group with
  <Children>; transforms nest. Y points up, unless the project's MirrorY says the machine's
  origin is at the top; MirrorX puts it on the right (both are set for the HTL's Ruida).
- CutIndex picks the layer colour from LightBurn's palette.
"""
import io
import math
import re
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw

SIZE = 256
PAD = 8
# LightBurn's layer colours C00..C29.
PALETTE = [
    '#000000', '#0000FF', '#FF0000', '#00E000', '#D0D000', '#FF8000', '#00E0E0', '#FF00FF', '#B4B4B4', '#0000A0',
    '#A00000', '#00A000', '#A0A000', '#C08000', '#00A0FF', '#A000A0', '#808080', '#7D87B9', '#BB7784', '#4A6FE3',
    '#D33F6A', '#8CD78C', '#F0B98D', '#F6C4E1', '#FA9ED4', '#500A78', '#B45A00', '#004754', '#86FA88', '#FFDB66',
]
VERT = re.compile(r'V(-?[\d.eE+-]+) (-?[\d.eE+-]+)((?:c[01][xy]-?[\d.eE+-]+)*)')
CTRL = re.compile(r'c([01])([xy])(-?[\d.eE+-]+)')
PRIM = re.compile(r'([LB])(\d+) (\d+)')


def _matrix(el) -> tuple:
    x = el.find('XForm')
    if x is None or not (x.text or '').split():
        return (1, 0, 0, 1, 0, 0)
    return tuple(float(v) for v in x.text.split())


def _mul(m, n) -> tuple:
    """m after n: (a b c d e f) with x' = a x + c y + e, y' = b x + d y + f."""
    a, b, c, d, e, f = m
    A, B, C, D, E, F = n
    return (a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f)


def _apply(m, x, y):
    return m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]


def _verts(text: str) -> list:
    out = []
    for vx, vy, ctrl in VERT.findall(text):
        x, y = float(vx), float(vy)
        c = {'0': {}, '1': {}}
        for i, axis, val in CTRL.findall(ctrl):
            c[i][axis] = float(val)
        # A control point with only an x is a flag for "none": the curve leaves straight from the vertex.
        c0 = (c['0']['x'], c['0']['y']) if 'y' in c['0'] else (x, y)
        c1 = (c['1']['x'], c['1']['y']) if 'y' in c['1'] else (x, y)
        out.append(((x, y), c0, c1))
    return out


def _bezier(p0, p1, p2, p3, n=10) -> list:
    pts = []
    for i in range(1, n + 1):
        t = i / n
        u = 1 - t
        pts.append((u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
                    u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]))
    return pts


def strokes(xml: str) -> tuple[list, bool, bool]:
    """Every shape as (colour index, [points in mm]) polylines, bitmaps as ('bitmap', corners);
    and whether x and y run the other way on the screen (MirrorX, MirrorY)."""
    root = ET.fromstring(xml)
    verts, prims, out = {}, {}, []

    def walk(el, m):
        for shape in el.findall('Shape'):
            mm = _mul(m, _matrix(shape))
            kind, cut = shape.get('Type'), int(shape.get('CutIndex') or 0)
            if kind == 'Group':
                children = shape.find('Children')
                if children is not None:
                    walk(children, mm)
            elif kind == 'Path':
                vl, pl = shape.find('VertList'), shape.find('PrimList')
                if vl is not None and shape.get('VertID'):
                    verts[shape.get('VertID')] = _verts(vl.text or '')
                if pl is not None and shape.get('PrimID'):
                    prims[shape.get('PrimID')] = pl.text or ''
                v = verts.get(shape.get('VertID')) if vl is None else _verts(vl.text or '')
                p = prims.get(shape.get('PrimID')) if pl is None else (pl.text or '')
                if not v:
                    continue
                if not p or p.strip() == 'LineClosed':
                    p = ''.join(f'L{i} {(i + 1) % len(v)}' for i in range(len(v)))
                line = []
                for op, a, b in PRIM.findall(p):
                    a, b = int(a), int(b)
                    if a >= len(v) or b >= len(v):
                        continue
                    start = _apply(mm, *v[a][0])
                    if not line or line[-1] != start:
                        if len(line) > 1:
                            out.append((cut, line))
                        line = [start]
                    if op == 'L':
                        line.append(_apply(mm, *v[b][0]))
                    else:
                        line += [_apply(mm, *q) for q in _bezier(v[a][0], v[a][1], v[b][2], v[b][0])]
                if len(line) > 1:
                    out.append((cut, line))
            elif kind in ('Rect', 'Bitmap'):
                w, h = float(shape.get('W') or 0) / 2, float(shape.get('H') or 0) / 2
                corners = [_apply(mm, x, y) for x, y in ((-w, -h), (w, -h), (w, h), (-w, h), (-w, -h))]
                out.append(('bitmap' if kind == 'Bitmap' else cut, corners))
            elif kind == 'Ellipse':
                rx, ry = float(shape.get('Rx') or 0), float(shape.get('Ry') or 0)
                out.append((cut, [_apply(mm, rx * math.cos(t / 24 * 2 * math.pi), ry * math.sin(t / 24 * 2 * math.pi)) for t in range(25)]))

    walk(root, (1, 0, 0, 1, 0, 0))
    return out, root.get('MirrorX') == 'True', root.get('MirrorY') == 'True'


def render(xml: str) -> bytes | None:
    """The project as a SIZE x SIZE PNG (transparent), fitted to its shapes; None when there is nothing."""
    lines, mirror_x, mirror_y = strokes(xml)
    pts = [p for _, line in lines for p in line]
    if not pts:
        return None
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
    y0, y1 = min(p[1] for p in pts), max(p[1] for p in pts)
    scale = (SIZE - 2 * PAD) / max(x1 - x0, y1 - y0, 1e-6)
    ox = PAD + ((SIZE - 2 * PAD) - (x1 - x0) * scale) / 2
    oy = PAD + ((SIZE - 2 * PAD) - (y1 - y0) * scale) / 2
    # As LightBurn shows it: y up (down in the picture) unless mirrored, x to the right unless mirrored.
    def to_px(x, y):
        return (SIZE - ox - (x - x0) * scale if mirror_x else ox + (x - x0) * scale,
                oy + (y - y0) * scale if mirror_y else SIZE - oy - (y - y0) * scale)
    px = [[to_px(x, y) for x, y in line] for _, line in lines]
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for (cut, _), line in zip(lines, px):
        if cut == 'bitmap':
            draw.polygon(line, fill=(200, 200, 200, 255))
        else:
            draw.line(line, fill=PALETTE[cut % len(PALETTE)], width=1)
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    return buf.getvalue()
