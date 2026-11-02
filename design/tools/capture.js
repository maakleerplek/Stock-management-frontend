async () => {
  // Walks the live DOM and returns a tree of boxes, texts, icons and images (page coordinates).
  const sx = scrollX, sy = scrollY;
  const transparent = c => !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
  const SEMANTIC = new Set(['BUTTON', 'HEADER', 'MAIN', 'ASIDE', 'FOOTER', 'SECTION', 'NAV', 'FORM', 'LI', 'INPUT', 'TEXTAREA', 'SELECT', 'DIALOG', 'TABLE', 'TR']);
  const imgCache = new Map();
  async function dataUrl(src) {
    if (imgCache.has(src)) return imgCache.get(src);
    let v = null;
    try {
      const b = await (await fetch(src)).blob();
      if (b.size < 600000) v = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
    } catch (e) { }
    imgCache.set(src, v);
    return v;
  }
  const box = r => ({ x: Math.round(r.left + sx), y: Math.round(r.top + sy), w: Math.round(r.width), h: Math.round(r.height) });
  const font = cs => ({ f: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(), s: parseFloat(cs.fontSize), w: +cs.fontWeight, lh: cs.lineHeight, c: cs.color, al: cs.textAlign, tt: cs.textTransform });
  function label(el) {
    return (el.getAttribute('aria-label') || el.id || (typeof el.className === 'string' ? el.className.split(' ')[0] : '') || el.tagName.toLowerCase()).slice(0, 60);
  }
  async function walk(el) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return [];
    const r = el.getBoundingClientRect();
    const tag = el.tagName;
    if (tag === 'svg' || tag === 'SVG') {
      if (r.width < 1 || r.height < 1) return [];
      const c = el.cloneNode(true);
      c.setAttribute('width', r.width); c.setAttribute('height', r.height);
      c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const svg = c.outerHTML.replaceAll('currentColor', cs.color);
      return [{ t: 's', ...box(r), svg, name: label(el) }];
    }
    if (tag === 'IMG') {
      if (r.width < 1 || r.height < 1) return [];
      return [{ t: 'i', ...box(r), src: await dataUrl(el.currentSrc || el.src), r: cs.borderTopLeftRadius, fit: cs.objectFit, name: el.alt || 'image' }];
    }
    if (tag === 'CANVAS' || tag === 'VIDEO') return [{ t: 'f', ...box(r), bg: '#E3E1DB', name: tag.toLowerCase(), kids: [] }];
    const kids = [];
    // consecutive text nodes (React splits "{n} left") become one text layer
    const nodes = [...el.childNodes];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.nodeType === 3) {
        let j = i; while (j + 1 < nodes.length && nodes[j + 1].nodeType === 3) j++;
        const txt = nodes.slice(i, j + 1).map(t => t.textContent).join('').replace(/\s+/g, ' ').trim();
        if (txt) {
          const rg = document.createRange(); rg.setStartBefore(n); rg.setEndAfter(nodes[j]);
          const rr = rg.getBoundingClientRect();
          if (rr.width > 0) kids.push({ t: 'x', ...box(rr), txt, font: font(cs), lines: new Set([...rg.getClientRects()].map(q => Math.round(q.top))).size });
        }
        i = j;
      } else if (n.nodeType === 1) kids.push(...await walk(n));
    }
    if ((tag === 'INPUT' || tag === 'TEXTAREA') && !['checkbox', 'radio', 'hidden'].includes(el.type)) {
      const txt = el.value || el.placeholder;
      if (txt) kids.push({ t: 'x', x: Math.round(r.left + sx + parseFloat(cs.paddingLeft)), y: Math.round(r.top + sy + (r.height - parseFloat(cs.fontSize) * 1.4) / 2), w: Math.round(r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)), h: Math.round(parseFloat(cs.fontSize) * 1.4), txt: el.type === 'password' && el.value ? '••••••' : txt, font: { ...font(cs), c: el.value ? cs.color : getComputedStyle(el, '::placeholder').color }, lines: 1 });
    }
    const bw = ['Top', 'Right', 'Bottom', 'Left'].map(s => parseFloat(cs['border' + s + 'Width']) || 0);
    const bc = ['Top', 'Right', 'Bottom', 'Left'].map(s => cs['border' + s + 'Color']);
    const hasBorder = bw.some((w, i) => w > 0 && !transparent(bc[i]));
    const bgImg = cs.backgroundImage !== 'none' ? cs.backgroundImage : null;
    const visual = !transparent(cs.backgroundColor) || hasBorder || cs.boxShadow !== 'none' || bgImg;
    if (r.width < 1 || r.height < 1) return kids;
    if (!visual && !SEMANTIC.has(tag)) return kids;
    return [{
      t: 'f', ...box(r), name: label(el), tag,
      bg: transparent(cs.backgroundColor) ? null : cs.backgroundColor, bgImg,
      bw: hasBorder ? bw : null, bc: hasBorder ? bc : null,
      r: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(parseFloat),
      shadow: cs.boxShadow !== 'none' ? cs.boxShadow : null,
      op: +cs.opacity, clip: cs.overflow !== 'visible', kids,
    }];
  }
  const root = document.body;
  const kids = await walk(root);
  return JSON.stringify({ url: location.pathname + location.hash, w: document.documentElement.clientWidth, h: Math.max(document.documentElement.scrollHeight, innerHeight), bg: getComputedStyle(document.body).backgroundColor, kids });
}
