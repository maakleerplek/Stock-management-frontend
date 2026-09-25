import { useEffect, useRef } from 'react';
import htlLogo from '../assets/HTL.png';

/**
 * Pixel-art laser cutter at an angle, in the flat greys of the app: a head on
 * a gantry cuts the HTL cube out of a plate. It follows the contours - the
 * letters first, the outline last, like a real cut job - and moves between
 * them with the beam off. When the last contour closes, the letters drop out
 * and a sheen crosses the piece. The head then drives home and the plate
 * rides off to the left like on a conveyor, while a blank one comes in from
 * the right. It runs while `active` (laser on) and stands still otherwise.
 *
 * Borrowed from Omarchy's screensaver (TerminalTextEffects, LaserEtch): the
 * cut and the sparks cool from white through yellow and orange, and the finished
 * logo gets a sheen band at 45 degrees.
 *
 * Drawn at low resolution and scaled up with image-rendering: pixelated.
 * Plate cell (u, v) lands on screen at (OX + u - v, OY + (u + v) / 2) as a
 * 2x1 run, so neighbouring cells tile.
 */

type Pt = [number, number];

const W = 184;
const H = 140;                           // plate area + a text line
const NU = 96;                           // plate size in cells
const NV = 72;
const OX = W / 2 - (NU - NV) / 2;
const OY = 34;
const THICK = 5;                         // plate thickness in px
const HEAD_LIFT = 26;                    // gantry height above the plate
const LOGO = 56;                         // logo size in cells
const LU = (NU - LOGO) / 2;
const LV = (NV - LOGO) / 2;
const TICK_MS = 33;
const CUT_SPEED = 3;                     // contour cells per tick
const RAPID_SPEED = 6;                   // cells per tick when moving with the beam off
const COOL_TICKS = 4;                    // ticks per step of the cooling ramp
const HOLD_TICKS = 110;                  // the finished piece stays this long
const HOME_TICKS = 30;                   // then the head drives back home
const SWAP_TICKS = 60;                   // then the plate leaves left, a new one comes in
const HOME: Pt = [-2, 2];                // parking spot of the head, off the plate

/** Slow start, slow stop. */
const ease = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

const C = {
  bed: '#FFFFFF',
  top: '#E3E1DB',
  edge: '#B5B3AB',
  sideL: '#D8D7D1',
  sideR: '#B5B3AB',
  rail: '#8E8C85',
  head: '#171717',
  hole: '#F1F0EC',                       // the honeycomb bed seen through a hole
  honeycomb: '#D8D7D1',
  fallen: '#B5B3AB',                     // a letter on its way down
  sheen: '#FFFFFF',
  smoke: '#D8D7D1',
};

// Messages under the plate, in a 3x5 pixel font, a random one every
// MESSAGE_TICKS. BUSY while the laser runs, IDLE otherwise.
const MESSAGE_TICKS = 365;               // ~12 s
const BUSY = [
  'LASERCUTTER IS BUSY',
  'CUTTING... PLEASE HOLD',
  'KEEP THE LID CLOSED',
  'STAY NEAR THE MACHINE WHILE IT CUTS',
  'CHECK YOUR SETTINGS BEFORE YOU START',
  "DON'T FORGET TO ASSIGN YOUR TIME",
  'LASERING IS MY PASSION',
  'BIGGEST LASERCUTTER IN LEUVEN*',
  'MEASURE TWICE, CUT ONCE',
  "DON'T STARE INTO THE BEAM",
  'SMELLS LIKE MDF IN HERE',
  'PEW PEW PEW',
  'NOW WITH 100% MORE LASER',
  'ONE DOES NOT SIMPLY UNPLUG A LASER',
  'PLYWOOD GO BRRRR',
  'I CAME, I SAW, I CUT',
  '404: MATERIAL NOT FOUND',
  'HOT STUFF COMING THROUGH',
  "FRICKIN' LASER BEAMS",
  'ACRYLIC? MORE LIKE ACRY-LIT',
];
const IDLE = [
  'LASERCUTTER IS FREE',
  'READY WHEN YOU ARE',
  'WAITING FOR A JOB...',
  'FEED ME PLYWOOD',
  'NO LASERS WERE HARMED TODAY',
  'THE BEAM IS TAKING A NAP',
];
const TEXT_Y = H - 8;

// 3x5 glyphs, one string of 15 bits per character, row by row.
const FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '0': '111101101101111', '1': '010110010010111',
  '2': '110001010100111', '3': '110001010001110', '4': '101101111001001', '5': '111100110001110',
  '6': '011100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001110',
  '.': '000000000000010', ',': '000000000010100', '!': '010010010000010', '?': '110001010000010',
  "'": '010010000000000', '-': '000000111000000', '*': '000101010101000', ':': '000010000010000',
  '%': '101001010100101', ' ': '000000000000000',
};
const SCRAMBLE = 'ABCDEFGHKLMNPRSTUVWXYZ0123456789*?%';

function drawText(g: CanvasRenderingContext2D, text: string, revealed: number, tick: number) {
  const x0 = Math.round((W - text.length * 4 + 1) / 2);
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    const settled = i < revealed;
    if (!settled) {
      if (i > revealed + 3 || ch === ' ') continue;   // a short scrambling front, blank behind it
      ch = SCRAMBLE[(i * 7 + tick * 3) % SCRAMBLE.length];
    }
    const bits = FONT[ch] ?? FONT['?'];
    g.fillStyle = settled ? '#171717' : '#8E8C85';
    for (let b = 0; b < 15; b++) {
      if (bits[b] === '1') g.fillRect(x0 + i * 4 + (b % 3), TEXT_Y + Math.floor(b / 3), 1, 1);
    }
  }
}

// Hot to cold, after LaserEtch's spark gradient: the cut and the sparks walk
// down these ramps. The only colour in the animation is heat.
const COOL = ['#FFFFFF', '#FFE680', '#FF9A3C', '#E0561F', '#8E8C85', '#3A3935', '#171717'];
const SPARK = ['#FFFFFF', '#FFE680', '#FF9A3C', '#E0561F', '#B3261E', '#8E8C85'];
const BEAM = { core: '#FFFFFF', glow: '#FF5A3C', edge: '#B3261E' };
const cooled = (age: number) => COOL[Math.min(COOL.length - 1, Math.floor(age / COOL_TICKS))];

interface Particle { x: number; y: number; vx: number; vy: number; life: number; age: number; smoke: boolean }
interface Job { contours: Pt[][]; holes: boolean[][]; piece: boolean[][] }

/**
 * Turn the logo into cut contours. Solid = the teal of the cube. White that
 * cannot reach the border is a hole (the letters); everything else is outside.
 */
function buildJob(img: HTMLImageElement): Job {
  const c = document.createElement('canvas');
  c.width = LOGO;
  c.height = LOGO;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, LOGO, LOGO);
  const d = g.getImageData(0, 0, LOGO, LOGO).data;
  const solid = (x: number, y: number) => {
    const i = (y * LOGO + x) * 4;
    return d[i + 3] > 110 && d[i] + d[i + 1] + d[i + 2] < 560;
  };
  const grid = Array.from({ length: LOGO }, (_, y) => Array.from({ length: LOGO }, (_, x) => solid(x, y)));

  // Flood the outside from the border.
  const outside = grid.map(r => r.map(() => false));
  const stack: Pt[] = [];
  for (let i = 0; i < LOGO; i++) stack.push([i, 0], [i, LOGO - 1], [0, i], [LOGO - 1, i]);
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= LOGO || y >= LOGO || outside[y][x] || grid[y][x]) continue;
    outside[y][x] = true;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const holes = grid.map((r, y) => r.map((s, x) => !s && !outside[y][x]));

  // Contour pixels: solid pixels next to a hole (inner) or next to the outside (outer).
  const at = (x: number, y: number, m: boolean[][]) => x >= 0 && y >= 0 && x < LOGO && y < LOGO && m[y][x];
  const isOut = (x: number, y: number) => x < 0 || y < 0 || x >= LOGO || y >= LOGO || outside[y][x];
  const inner: Pt[] = [];
  const outer: Pt[] = [];
  for (let y = 0; y < LOGO; y++) {
    for (let x = 0; x < LOGO; x++) {
      if (!grid[y][x]) continue;
      const n4: Pt[] = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      if (n4.some(([a, b]) => at(a, b, holes))) inner.push([x, y]);
      else if (n4.some(([a, b]) => isOut(a, b))) outer.push([x, y]);
    }
  }
  return { contours: [...chains(inner), ...chains(outer)], holes, piece: grid };
}

/** Order loose contour pixels into paths the head can follow, nearest first. */
function chains(points: Pt[]): Pt[][] {
  const left = new Set(points.map(([x, y]) => `${x},${y}`));
  const out: Pt[][] = [];
  let pos: Pt = [0, 0];
  while (left.size) {
    // Start at the unvisited pixel nearest to where the head is.
    let best = '';
    let bestD = Infinity;
    for (const k of left) {
      const [x, y] = k.split(',').map(Number);
      const dd = (x - pos[0]) ** 2 + (y - pos[1]) ** 2;
      if (dd < bestD) { bestD = dd; best = k; }
    }
    let cur = best.split(',').map(Number) as Pt;
    left.delete(best);
    const chain: Pt[] = [cur];
    for (;;) {
      const [x, y] = cur;
      // Straight neighbours before diagonal ones keeps the line continuous.
      const next = ([[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]] as Pt[])
        .map(([dx, dy]) => `${x + dx},${y + dy}`)
        .find(k => left.has(k));
      if (!next) break;
      left.delete(next);
      cur = next.split(',').map(Number) as Pt;
      chain.push(cur);
    }
    if (chain.length > 2) out.push(chain);
    pos = cur;
  }
  return out;
}

export default function LaserAnimation({ active, className }: { active: boolean; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext('2d')!;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const sx = (u: number, v: number) => Math.round(OX + u - v);
    const sy = (u: number, v: number) => Math.round(OY + (u + v) / 2);

    // The plate with its cuts is drawn here, then placed on the screen, so it
    // can ride away on the conveyor.
    const work = document.createElement('canvas');
    work.width = W;
    work.height = H;
    const wg = work.getContext('2d')!;
    const cell = (u: number, v: number) => wg.fillRect(sx(u, v) - 1, sy(u, v), 2, 1);

    // The plate never changes: draw it once.
    const plate = document.createElement('canvas');
    plate.width = W;
    plate.height = H;
    {
      const p = plate.getContext('2d')!;
      const pc = (u: number, v: number, dy = 0) => p.fillRect(sx(u, v) - 1, sy(u, v) + dy, 2, 1);
      for (let d = THICK; d >= 1; d--) {
        p.fillStyle = C.sideL;
        for (let u = 0; u < NU; u++) pc(u, NV - 1, d);
        p.fillStyle = C.sideR;
        for (let v = 0; v < NV; v++) pc(NU - 1, v, d);
      }
      p.fillStyle = C.top;
      for (let u = 0; u < NU; u++) for (let v = 0; v < NV; v++) pc(u, v);
      p.fillStyle = C.edge;
      for (let u = 0; u < NU; u++) { pc(u, 0); pc(u, NV - 1); }
      for (let v = 0; v < NV; v++) { pc(0, v); pc(NU - 1, v); }
    }

    let job: Job | null = null;
    let cut = new Map<string, number>();     // "x,y" -> tick it was cut
    let contour = 0;
    let index = 0;
    let head: Pt = HOME;                     // plate cell under the head
    let homeFrom: Pt = HOME;
    let cutting = false;
    let phase: 'cut' | 'hold' | 'home' | 'swap' = 'cut';
    let phaseTick = 0;
    let tick = 0;
    const particles: Particle[] = [];

    let message = '';
    let messageAt = 0;
    let wasOn: boolean | null = null;
    const pick = (list: string[]) => {
      let next = message;
      while (next === message) next = list[Math.floor(Math.random() * list.length)];
      return next;
    };

    const img = new Image();
    img.src = htlLogo;
    img.onload = () => { job = buildJob(img); };

    const spark = (x: number, y: number) => {
      if (Math.random() < 0.6) {
        const a = -Math.random() * Math.PI;  // upwards, then gravity pulls them back
        const v = 0.6 + Math.random() * 1.2;
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 6 + Math.random() * 8, age: 0, smoke: false });
      }
      if (Math.random() < 0.15) {
        particles.push({ x, y, vx: (Math.random() - 0.5) * 0.3, vy: -0.4, life: 18 + Math.random() * 12, age: 0, smoke: true });
      }
    };

    const advance = () => {
      if (!job) return;
      if (phase !== 'cut') {
        phaseTick++;
        if (phase === 'hold' && phaseTick > HOLD_TICKS) {
          phase = 'home';
          phaseTick = 0;
          homeFrom = head;
        } else if (phase === 'home') {
          const e = ease(Math.min(1, phaseTick / HOME_TICKS));
          head = [homeFrom[0] + (HOME[0] - homeFrom[0]) * e, homeFrom[1] + (HOME[1] - homeFrom[1]) * e];
          if (phaseTick >= HOME_TICKS) { phase = 'swap'; phaseTick = 0; }
        } else if (phase === 'swap' && phaseTick >= SWAP_TICKS) {
          phase = 'cut';
          contour = 0;
          index = 0;
          cut = new Map();
        }
        return;
      }
      if (contour >= job.contours.length) {
        cutting = false;
        phase = 'hold';
        phaseTick = 0;
        return;
      }
      const path = job.contours[contour];
      const [tx, ty] = path[index];
      const du = LU + tx - head[0];
      const dv = LV + ty - head[1];
      const dist = Math.hypot(du, dv);
      if (index === 0 && dist > 1.5) {
        // Rapid move to the start of the next contour, beam off.
        cutting = false;
        const f = Math.min(1, RAPID_SPEED / dist);
        head = [head[0] + du * f, head[1] + dv * f];
        return;
      }
      cutting = true;
      for (let k = 0; k < CUT_SPEED && index < path.length; k++, index++) {
        const [x, y] = path[index];
        cut.set(`${x},${y}`, tick);
        head = [LU + x, LV + y];
        spark(sx(head[0], head[1]), sy(head[0], head[1]));
      }
      if (index >= path.length) {
        contour++;
        index = 0;
      }
    };

    const frame = () => {
      tick++;
      const on = activeRef.current && !reduceMotion;
      if (on) advance();
      const finished = phase !== 'cut';
      const hold = phase === 'hold' ? phaseTick : HOLD_TICKS;
      const beam = on && cutting;

      if (on !== wasOn || tick - messageAt >= MESSAGE_TICKS) {
        message = pick(on ? BUSY : IDLE);
        messageAt = tick;
        wasOn = on;
      }

      wg.clearRect(0, 0, W, H);
      wg.drawImage(plate, 0, 0);

      if (job && finished) {
        // The piece is loose: the letters drop through the plate onto the
        // honeycomb bed, then a sheen crosses the cube.
        const sheenAt = hold * 1.8 - 16;
        const drop = Math.min(hold, 8);
        for (let y = 0; y < LOGO; y++) {
          for (let x = 0; x < LOGO; x++) {
            if (job.holes[y][x]) {
              wg.fillStyle = (x + y) % 4 === 0 && (x - y) % 4 === 0 ? C.honeycomb : C.hole;
            } else if (job.piece[y][x] && Math.abs(x + y - sheenAt) < 3) {
              wg.fillStyle = C.sheen;
            } else continue;
            cell(LU + x, LV + y);
          }
        }
        if (drop < 8) {
          wg.fillStyle = C.fallen;
          for (let y = 0; y < LOGO; y++) {
            for (let x = 0; x < LOGO; x++) {
              if (job.holes[y][x]) wg.fillRect(sx(LU + x, LV + y) - 1, sy(LU + x, LV + y) + drop, 2, 1);
            }
          }
        }
      }

      for (const [k, t] of cut) {
        const [x, y] = k.split(',').map(Number);
        wg.fillStyle = cooled(tick - t);
        cell(LU + x, LV + y);
      }

      // Conveyor: the finished plate leaves to the left, a blank one follows.
      const shift = phase === 'swap' ? Math.round(W * ease(Math.min(1, phaseTick / SWAP_TICKS))) : 0;
      g.fillStyle = C.bed;
      g.fillRect(0, 0, W, H);
      g.drawImage(work, -shift, 0);
      if (shift) g.drawImage(plate, W - shift, 0);

      // Gantry: a rail along u at the head's row, lifted above the plate.
      const hx = sx(head[0], head[1]);
      const hy = sy(head[0], head[1]);
      const lift = hy - HEAD_LIFT;
      g.fillStyle = C.rail;
      for (let u = -3; u <= NU + 2; u++) g.fillRect(sx(u, head[1]) - 1, sy(u, head[1]) - HEAD_LIFT, 2, 1);
      g.fillStyle = C.head;
      g.fillRect(sx(-3, head[1]) - 2, sy(-3, head[1]) - HEAD_LIFT - 2, 3, 4);
      g.fillRect(sx(NU + 2, head[1]) - 1, sy(NU + 2, head[1]) - HEAD_LIFT - 2, 3, 4);

      // Beam: a flickering white core in red, from the nozzle to the plate.
      if (beam) {
        g.fillStyle = BEAM.edge;
        g.fillRect(hx - 1, lift + 8, 3, HEAD_LIFT - 8);
        g.fillStyle = tick % 3 ? BEAM.core : BEAM.glow;
        g.fillRect(hx, lift + 8, 1, HEAD_LIFT - 8);
        // Flare where it hits.
        g.fillStyle = BEAM.glow;
        g.fillRect(hx - 3, hy, 7, 1);
        g.fillRect(hx - 1, hy - 1, 3, 3);
        g.fillStyle = SPARK[tick % 2];
        g.fillRect(hx, hy, 1, 1);
      }

      // Head: carriage on the rail and a tapered nozzle.
      g.fillStyle = C.head;
      g.fillRect(hx - 4, lift - 4, 9, 6);
      g.fillRect(hx - 2, lift + 2, 5, 3);
      g.fillRect(hx - 1, lift + 5, 3, 2);
      g.fillRect(hx, lift + 7, 1, 1);
      g.fillStyle = beam && tick % 8 < 4 ? BEAM.glow : C.rail;
      g.fillRect(hx + 2, lift - 3, 1, 1);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (!p.smoke) p.vy += 0.22;
        if (--p.life <= 0) { particles.splice(i, 1); continue; }
        g.fillStyle = p.smoke ? C.smoke : SPARK[Math.min(SPARK.length - 1, Math.floor(p.age++ / 2))];
        g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }

      drawText(g, message, reduceMotion ? message.length : Math.floor((tick - messageAt) / 2), tick);
    };

    frame();
    const id = window.setInterval(frame, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className={className}
      style={{ imageRendering: 'pixelated', width: '100%', aspectRatio: `${W} / ${H}` }}
      aria-label="Animation of the laser cutting the HTL logo"
      role="img"
    />
  );
}
