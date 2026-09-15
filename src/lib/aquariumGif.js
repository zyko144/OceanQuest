// Aquarium animé en GIF : les 3 meilleurs poissons d'un joueur, pour /aquariumig.
// Tout est dessiné ici (pas d'image externe obligatoire) et chaque mouvement suit une
// période entière de l'animation : la boucle du GIF ne saute jamais.

const path = require('node:path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

const W = 560;
const H = 315;
const FRAMES = 30;
const DELAY_MS = 80;
const TAU = Math.PI * 2;

// Police embarquée : le serveur Render n'en a presque aucune.
const fontDir = path.dirname(require.resolve('@expo-google-fonts/fredoka/package.json'));
GlobalFonts.registerFromPath(path.join(fontDir, '600SemiBold/Fredoka_600SemiBold.ttf'), 'Fredoka SemiBold');
GlobalFonts.registerFromPath(path.join(fontDir, '700Bold/Fredoka_700Bold.ttf'), 'Fredoka Bold');

const RARITY_COLORS = [
  [/secret|divin|exotique|celeste|céleste/i, '#ff4fd8'],
  [/mythi/i, '#ff4d4d'],
  [/l[ée]gend/i, '#ffc21a'],
  [/[ée]pique/i, '#b25bff'],
  [/peu commun|uncommon/i, '#4cd964'],
  [/rare/i, '#3fa9ff'],
  [/commun|common/i, '#b8c4cc'],
];
const MEDALS = ['#ffd24a', '#d9e2ea', '#e39a5b'];

function rarityColor(label, fallback) {
  if (/^#[0-9a-f]{6}$/i.test(fallback ?? '')) return fallback;
  return RARITY_COLORS.find(([re]) => re.test(label ?? ''))?.[1] ?? '#5ad1e6';
}

// Brillance des raretés qui font tourner les têtes (halo + étincelles).
const isShiny = (label) => /secret|divin|exotique|c[ée]leste|mythi|l[ée]gend/i.test(label ?? '');

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const r = mix((n >> 16) & 255); const g = mix((n >> 8) & 255); const b = mix(n & 255);
  return `rgb(${r},${g},${b})`;
}

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

// Générateur déterministe : le même joueur donne toujours le même décor.
function seeded(seed) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// ───────── Décor fixe (dessiné une fois) ─────────

function drawBackdrop(rand) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const water = ctx.createLinearGradient(0, 0, 0, H);
  water.addColorStop(0, '#1b9ad6');
  water.addColorStop(0.45, '#0d5f9e');
  water.addColorStop(1, '#062a55');
  ctx.fillStyle = water;
  ctx.fillRect(0, 0, W, H);

  // Rochers au loin.
  ctx.fillStyle = 'rgba(4, 30, 66, 0.55)';
  for (let i = 0; i < 5; i += 1) {
    const x = rand() * W;
    const r = 40 + rand() * 50;
    ctx.beginPath();
    ctx.ellipse(x, 248, r, r * 0.7, 0, Math.PI, TAU);
    ctx.fill();
  }

  // Sable.
  const sand = ctx.createLinearGradient(0, 238, 0, H);
  sand.addColorStop(0, '#e6c88f');
  sand.addColorStop(1, '#a8834f');
  ctx.fillStyle = sand;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, 250);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 246 + Math.sin(x / 45) * 5 + Math.sin(x / 13) * 2);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // Galets.
  for (let i = 0; i < 26; i += 1) {
    ctx.fillStyle = `rgba(${90 + rand() * 60}, ${70 + rand() * 40}, ${50 + rand() * 30}, 0.55)`;
    ctx.beginPath();
    ctx.ellipse(rand() * W, 258 + rand() * 50, 2 + rand() * 5, 1.5 + rand() * 3, 0, 0, TAU);
    ctx.fill();
  }

  // Coraux.
  const corals = ['#ff6f91', '#ff9671', '#c86bfa', '#ffc75f'];
  for (let i = 0; i < 4; i += 1) {
    const baseX = 30 + rand() * (W - 60);
    ctx.strokeStyle = corals[i % corals.length];
    ctx.lineCap = 'round';
    const branch = (x, y, len, angle, width) => {
      if (len < 6) return;
      const x2 = x + Math.cos(angle) * len;
      const y2 = y + Math.sin(angle) * len;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      branch(x2, y2, len * 0.68, angle - 0.45 - rand() * 0.2, width * 0.72);
      branch(x2, y2, len * 0.68, angle + 0.45 + rand() * 0.2, width * 0.72);
    };
    branch(baseX, 262, 18 + rand() * 8, -Math.PI / 2, 6);
  }

  // Coffre au trésor entrouvert.
  const cx = W - 118;
  ctx.fillStyle = '#6b3f1d';
  roundRect(ctx, cx, 234, 46, 26, 4);
  ctx.fill();
  ctx.fillStyle = '#8a5428';
  roundRect(ctx, cx - 2, 222, 50, 14, 6);
  ctx.fill();
  ctx.fillStyle = '#ffd24a';
  ctx.fillRect(cx + 20, 238, 6, 9);
  ctx.fillStyle = 'rgba(255, 210, 74, 0.8)';
  ctx.beginPath();
  ctx.ellipse(cx + 23, 234, 16, 4, 0, 0, TAU);
  ctx.fill();

  return canvas;
}

function drawGlass(ctx) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.beginPath();
  ctx.moveTo(W * 0.62, 0);
  ctx.lineTo(W * 0.74, 0);
  ctx.lineTo(W * 0.46, H);
  ctx.lineTo(W * 0.34, H);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(190, 240, 255, 0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
}

// ───────── Éléments animés ─────────

function drawRays(ctx, t) {
  for (let i = 0; i < 4; i += 1) {
    const sway = Math.sin(TAU * t + i * 1.7) * 14;
    const alpha = 0.05 + 0.04 * (1 + Math.sin(TAU * t + i * 2.3));
    ctx.fillStyle = `rgba(210, 245, 255, ${alpha})`;
    const x = 70 + i * 130;
    ctx.beginPath();
    ctx.moveTo(x + sway, 0);
    ctx.lineTo(x + 46 + sway, 0);
    ctx.lineTo(x + 110 - sway, 250);
    ctx.lineTo(x + 20 - sway, 250);
    ctx.closePath();
    ctx.fill();
  }
}

function drawSeaweed(ctx, strands, t) {
  for (const s of strands) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x, 266);
    const steps = 6;
    for (let k = 1; k <= steps; k += 1) {
      const y = 266 - (s.height * k) / steps;
      const x = s.x + Math.sin(TAU * t + s.phase + k * 0.6) * k * 2.2;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawBubbles(ctx, bubbles, t) {
  for (const b of bubbles) {
    const p = (t * b.speed + b.offset) % 1;
    const y = 262 - p * 250;
    const x = b.x + Math.sin(TAU * (p * 2 + b.offset)) * 5;
    const r = b.r * (0.7 + p * 0.5);
    ctx.strokeStyle = `rgba(225, 250, 255, ${0.75 - p * 0.45})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, TAU);
    ctx.fill();
  }
}

// Un poisson vectoriel, tête vers la droite, centré sur (0, 0).
function drawFishBody(ctx, size, color, t, shape) {
  const rx = size;
  const ry = size * shape.height;
  const wag = Math.sin(TAU * t * 3 + shape.phase) * 0.35;

  // Queue.
  ctx.save();
  ctx.translate(-rx * 0.85, 0);
  ctx.rotate(wag);
  ctx.fillStyle = shade(color, -0.25);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  if (shape.forked) {
    ctx.lineTo(-rx * 0.62, -ry * 0.95);
    ctx.lineTo(-rx * 0.38, 0);
    ctx.lineTo(-rx * 0.62, ry * 0.95);
  } else {
    ctx.quadraticCurveTo(-rx * 0.9, -ry * 1.1, -rx * 0.62, 0);
    ctx.quadraticCurveTo(-rx * 0.9, ry * 1.1, 0, 0);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Nageoire dorsale.
  ctx.fillStyle = shade(color, -0.18);
  ctx.beginPath();
  ctx.moveTo(-rx * 0.35, -ry * 0.8);
  ctx.quadraticCurveTo(-rx * 0.05, -ry * 1.75, rx * 0.35, -ry * 0.85);
  ctx.closePath();
  ctx.fill();

  // Corps.
  const body = ctx.createLinearGradient(0, -ry, 0, ry);
  body.addColorStop(0, shade(color, 0.35));
  body.addColorStop(0.55, color);
  body.addColorStop(1, shade(color, -0.35));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();

  // Rayures.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.clip();
  ctx.strokeStyle = shade(color, shape.darkStripes ? -0.3 : 0.45);
  ctx.lineWidth = Math.max(2, size * 0.1);
  for (let i = 0; i < shape.stripes; i += 1) {
    const x = -rx * 0.35 + i * rx * 0.32;
    ctx.beginPath();
    ctx.moveTo(x, -ry);
    ctx.quadraticCurveTo(x + rx * 0.12, 0, x, ry);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.beginPath();
  ctx.ellipse(rx * 0.1, ry * 0.45, rx * 0.6, ry * 0.3, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = shade(color, -0.5);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.stroke();

  // Nageoire pectorale qui bat.
  ctx.save();
  ctx.translate(rx * 0.1, ry * 0.25);
  ctx.rotate(0.5 + Math.sin(TAU * t * 3 + shape.phase + 1) * 0.3);
  ctx.fillStyle = shade(color, -0.1);
  ctx.beginPath();
  ctx.ellipse(-rx * 0.15, 0, rx * 0.22, ry * 0.18, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Œil.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(rx * 0.55, -ry * 0.18, Math.max(3, size * 0.16), 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#10243a';
  ctx.beginPath();
  ctx.arc(rx * 0.6, -ry * 0.18, Math.max(1.8, size * 0.09), 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(rx * 0.63, -ry * 0.24, Math.max(0.8, size * 0.035), 0, TAU);
  ctx.fill();
}

function drawSparkles(ctx, x, y, radius, t, seed) {
  const rand = seeded(seed);
  for (let i = 0; i < 5; i += 1) {
    const angle = rand() * TAU;
    const dist = radius * (0.9 + rand() * 0.5);
    const twinkle = Math.max(0, Math.sin(TAU * (t * 2 + rand())));
    if (twinkle < 0.15) continue;
    const sx = x + Math.cos(angle) * dist;
    const sy = y + Math.sin(angle) * dist * 0.7;
    const s = 2 + twinkle * 4;
    ctx.fillStyle = `rgba(255, 255, 230, ${twinkle})`;
    ctx.beginPath();
    ctx.moveTo(sx, sy - s);
    ctx.lineTo(sx + s * 0.3, sy - s * 0.3);
    ctx.lineTo(sx + s, sy);
    ctx.lineTo(sx + s * 0.3, sy + s * 0.3);
    ctx.lineTo(sx, sy + s);
    ctx.lineTo(sx - s * 0.3, sy + s * 0.3);
    ctx.lineTo(sx - s, sy);
    ctx.lineTo(sx - s * 0.3, sy - s * 0.3);
    ctx.closePath();
    ctx.fill();
  }
}

function fishPosition(fish, t) {
  const p = fish.path;
  const angle = TAU * t + p.phase;
  return { angle, x: p.cx + Math.sin(angle) * p.ax, y: p.cy + Math.sin(angle * 2) * p.ay };
}

function drawFish(ctx, fish, t) {
  const { size, color, path: p } = fish;
  const { angle, x, y } = fishPosition(fish, t);
  // La direction suit la vitesse ; l'écrasement pendant le demi-tour imite un virage.
  const facing = Math.max(-1, Math.min(1, Math.cos(angle) * 3));

  if (fish.shiny) {
    const pulse = 0.55 + 0.25 * Math.sin(TAU * t * 2 + p.phase);
    const glow = ctx.createRadialGradient(x, y, size * 0.2, x, y, size * 2);
    glow.addColorStop(0, shade(color, 0.3).replace('rgb', 'rgba').replace(')', `, ${pulse * 0.7})`));
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, size * 2, 0, TAU);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(x, y + Math.sin(TAU * t * 2 + p.phase) * 2);
  ctx.scale(facing, 1);
  if (fish.image) {
    const w = size * 2.4;
    const h = (w * fish.image.height) / fish.image.width;
    ctx.drawImage(fish.image, -w / 2, -h / 2, w, h);
  } else {
    drawFishBody(ctx, size, color, t, fish.shape);
  }
  ctx.restore();

  if (fish.shiny) drawSparkles(ctx, x, y, size * 1.4, t, fish.seed);
}

// Pastille du rang, qui suit le poisson. Dessinée après tous les poissons : jamais cachée.
function drawBadge(ctx, fish, t) {
  const { size } = fish;
  const { x, y } = fishPosition(fish, t);
  const bx = x;
  const by = y - size * (fish.image ? 1.2 : 1.05) - 10;
  ctx.fillStyle = MEDALS[fish.rank];
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(bx, by, 9, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1a2233';
  ctx.font = '13px "Fredoka Bold"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(fish.rank + 1), bx, by + 1);
}

// ───────── Bandeaux ─────────

function drawHeader(ctx, { title, subtitle, avatar }) {
  const band = ctx.createLinearGradient(0, 0, 0, 52);
  band.addColorStop(0, 'rgba(3, 20, 45, 0.85)');
  band.addColorStop(1, 'rgba(3, 20, 45, 0.35)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, W, 52);

  let textX = 16;
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(34, 26, 18, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#9fd8ef';
    ctx.fillRect(16, 8, 36, 36);
    ctx.drawImage(avatar, 16, 8, 36, 36);
    ctx.restore();
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(34, 26, 18, 0, TAU);
    ctx.stroke();
    textX = 62;
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px "Fredoka Bold"';
  ctx.fillText(fitText(ctx, title, W - textX - 16), textX, 25);
  ctx.fillStyle = '#a8e6ff';
  ctx.font = '13px "Fredoka SemiBold"';
  ctx.fillText(fitText(ctx, subtitle, W - textX - 16), textX, 43);
}

function drawCards(ctx, fishes) {
  const gap = 8;
  const cardW = (W - 16 - gap * 2) / 3;
  const y = H - 52;
  for (let i = 0; i < 3; i += 1) {
    const fish = fishes[i];
    const x = 8 + i * (cardW + gap);
    ctx.fillStyle = 'rgba(3, 20, 45, 0.78)';
    roundRect(ctx, x, y, cardW, 44, 10);
    ctx.fill();
    ctx.strokeStyle = fish ? fish.color : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = MEDALS[i];
    ctx.beginPath();
    ctx.arc(x + 18, y + 22, 10, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1a2233';
    ctx.font = '13px "Fredoka Bold"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x + 18, y + 23);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const textW = cardW - 42;
    if (!fish) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '13px "Fredoka SemiBold"';
      ctx.fillText('Place libre', x + 34, y + 27);
      continue;
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px "Fredoka Bold"';
    ctx.fillText(fitText(ctx, fish.name, textW), x + 34, y + 19);
    ctx.fillStyle = fish.color;
    ctx.font = '12px "Fredoka SemiBold"';
    ctx.fillText(fitText(ctx, [fish.rarity, fish.detail].filter(Boolean).join(' · '), textW), x + 34, y + 36);
  }
}

// ───────── Assemblage ─────────

// Places des poissons : le n°1 au centre et plus gros, les deux autres de part et d'autre.
const PATHS = [
  { cx: 280, cy: 160, ax: 95, ay: 14, phase: 0 },
  { cx: 125, cy: 205, ax: 60, ay: 10, phase: 2.1 },
  { cx: 440, cy: 100, ax: 60, ay: 10, phase: 4.2 },
];
const SIZES = [34, 26, 24];

/**
 * @param {object} input
 * @param {string} input.title
 * @param {string} input.subtitle
 * @param {import('@napi-rs/canvas').Image|null} [input.avatar]
 * @param {{ name: string, rarity?: string, color?: string, detail?: string, image?: import('@napi-rs/canvas').Image|null }[]} input.fishes  du meilleur au moins bon
 * @returns {Buffer} le GIF
 */
function renderAquariumFrames({ title, subtitle, avatar = null, fishes }) {
  const seed = hash(title);
  const rand = seeded(seed);
  const backdrop = drawBackdrop(rand);

  const strands = Array.from({ length: 7 }, (_, i) => ({
    x: 20 + i * 80 + rand() * 40,
    height: 50 + rand() * 60,
    width: 4 + rand() * 3,
    phase: rand() * TAU,
    color: ['#2e9e5b', '#3dbb6c', '#23804a'][i % 3],
  }));
  // Vitesses entières : chaque bulle revient à sa place à la fin de la boucle.
  const bubbles = Array.from({ length: 12 }, () => ({
    x: 20 + rand() * (W - 40),
    r: 2 + rand() * 4,
    speed: 1 + Math.floor(rand() * 2),
    offset: rand(),
  }));

  const swimmers = fishes.slice(0, 3).map((f, rank) => {
    const fishSeed = hash(f.name);
    const r = seeded(fishSeed);
    return {
      rank,
      name: f.name,
      rarity: f.rarity,
      detail: f.detail,
      image: f.image ?? null,
      color: rarityColor(f.rarity, f.color),
      shiny: isShiny(f.rarity),
      seed: fishSeed,
      size: SIZES[rank],
      path: PATHS[rank],
      shape: {
        height: 0.45 + r() * 0.2,
        forked: r() > 0.5,
        stripes: Math.floor(r() * 3),
        darkStripes: r() > 0.5,
        phase: r() * TAU,
      },
    };
  });
  // Le n°1 passe devant les autres.
  const drawOrder = [...swimmers].reverse();

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const frames = [];
  for (let f = 0; f < FRAMES; f += 1) {
    const t = f / FRAMES;
    ctx.drawImage(backdrop, 0, 0);
    drawRays(ctx, t);
    drawSeaweed(ctx, strands, t);
    drawBubbles(ctx, bubbles, t);
    for (const fish of drawOrder) drawFish(ctx, fish, t);
    for (const fish of drawOrder) drawBadge(ctx, fish, t);
    drawGlass(ctx);
    drawHeader(ctx, { title, subtitle, avatar });
    drawCards(ctx, swimmers);
    frames.push(ctx.getImageData(0, 0, W, H).data);
  }
  return frames;
}

function renderAquariumGif(input) {
  const frames = renderAquariumFrames(input);

  // Une palette commune à toutes les images : pas de scintillement de couleurs.
  const sample = new Uint8ClampedArray(W * H * 4 * 3);
  [0, Math.floor(FRAMES / 3), Math.floor((2 * FRAMES) / 3)].forEach((f, i) => sample.set(frames[f], i * W * H * 4));
  const palette = quantize(sample, 256);

  const gif = GIFEncoder();
  frames.forEach((data, i) => {
    const index = applyPalette(data, palette);
    gif.writeFrame(index, W, H, i === 0 ? { palette, delay: DELAY_MS, repeat: 0 } : { delay: DELAY_MS });
  });
  gif.finish();
  return Buffer.from(gif.bytes());
}

module.exports = { renderAquariumGif, renderAquariumFrames, rarityColor, WIDTH: W, HEIGHT: H };
