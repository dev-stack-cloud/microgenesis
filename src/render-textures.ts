import { Rectangle, Texture } from 'pixi.js';

const TAU = Math.PI * 2;
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const bell = (value: number, center: number, span: number) => Math.exp(-(((value - center) / span) ** 2));

export function visualRandom(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function canvas(size: number) {
  const surface = document.createElement('canvas');
  surface.width = surface.height = size;
  return { surface, ctx: surface.getContext('2d')! };
}

type RGB = [number, number, number];
type Material = { dark: RGB; fluor: RGB; hot: RGB; roughness: number; stretch: number; profile: number };

const materials = {
  proto: { dark: [3, 25, 41], fluor: [38, 198, 170], hot: [215, 255, 229], roughness: .09, stretch: 1.13, profile: 0 },
  predator: { dark: [46, 10, 17], fluor: [246, 99, 48], hot: [255, 229, 154], roughness: .21, stretch: 1.19, profile: 1 },
  symbiote: { dark: [22, 34, 8], fluor: [142, 213, 88], hot: [235, 255, 178], roughness: .19, stretch: 1.03, profile: 2 },
  crystalline: { dark: [13, 23, 58], fluor: [105, 174, 253], hot: [231, 250, 255], roughness: .11, stretch: 1.02, profile: 3 },
  scavenger: { dark: [14, 31, 28], fluor: [114, 177, 108], hot: [224, 251, 173], roughness: .12, stretch: 1.22, profile: 0 },
  hunter: { dark: [44, 13, 14], fluor: [235, 117, 76], hot: [255, 214, 142], roughness: .18, stretch: 1.28, profile: 1 },
  colony: { dark: [32, 17, 33], fluor: [205, 132, 141], hot: [255, 218, 159], roughness: .21, stretch: 1.03, profile: 2 },
  crown: { dark: [43, 16, 21], fluor: [230, 92, 68], hot: [255, 192, 143], roughness: .23, stretch: 1.10, profile: 2 },
} satisfies Record<string, Material>;

export type MaterialKey = keyof typeof materials;

function profile(angle: number, material: Material, phase: number) {
  let outline = 1 + material.roughness * (.29 * Math.sin(angle * 2 + phase) + .42 * Math.cos(angle * 3 - phase) +
    .27 * Math.sin(angle * 5 + phase * 1.6) + .16 * Math.sin(angle * 9 - phase));
  if (material.profile === 3) {
    const wedge = ((angle + Math.PI * 3 + phase * .1) % (TAU / 7)) - Math.PI / 7;
    outline *= Math.cos(Math.PI / 7) / Math.cos(wedge);
  }
  if (material.profile === 2) outline += .05 * Math.cos(angle * 6 + phase);
  return outline;
}

function rgba(rgb: RGB, alpha: number) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function makeCell(ctx: CanvasRenderingContext2D, size: number, material: Material, seed: number, rich: boolean) {
  const random = visualRandom(seed);
  const phase = random() * TAU;
  const image = ctx.createImageData(size, size);
  const radius = size * .327;
  const organelles = Array.from({ length: rich ? 8 : 4 }, (_, index) => {
    const angle = index * 2.39996 + phase;
    const orbit = .15 + random() * .53;
    return { x: Math.cos(angle) * orbit, y: Math.sin(angle) * orbit, size: .075 + random() * .11 };
  });

  for (let j = 0; j < size; j++) {
    const y = (j + .5 - size * .5) / radius;
    for (let i = 0; i < size; i++) {
      const x = (i + .5 - size * .5) / radius / material.stretch;
      const radiusAtPixel = Math.hypot(x, y);
      if (radiusAtPixel > 1.40) continue;
      const angle = Math.atan2(y, x);
      const curve = profile(angle, material, phase);
      const r = radiusAtPixel / curve;
      if (r > 1.29) continue;

      const unwarped = Math.sin(11 * x + 13 * y) * Math.sin(19 * y - 9 * x);
      const turbulence = Math.sin(38 * x + 16 * y + unwarped * 2.1) * Math.cos(33 * y - 11 * x + unwarped * 2.8);
      const salt = random();
      const angular = .63 + .24 * Math.sin(angle * 4 + phase) + .13 * Math.cos(angle * 9 - phase);
      const rough = .009 * turbulence + .012 * Math.sin(angle * 67 + r * 27) * Math.sin(angle * 23);
      const shell = bell(r + rough, .988, .014) * (.33 + .49 * angular + .24 * salt);
      const lamella = bell(r + rough * .78, .941, .013) * (.10 + .28 * angular);
      const diffuse = bell(r, .975, .083) * (.09 + .11 * angular);
      const reflected = bell(r + rough, .87, .042) * (.04 + .10 * angular);
      const strands = Math.abs(Math.sin(angle * 25 + r * 14 + unwarped * 2.5));
      const matrix = clamp((.046 + .042 * unwarped + .043 * turbulence + (1 - strands) ** 11 * .15) * (1.18 - r));

      let interior = 0;
      for (const organelle of organelles) {
        const sx = (x - organelle.x) * 1.17;
        const sy = (y - organelle.y) * .84;
        const q = Math.hypot(sx + turbulence * .004, sy) / organelle.size;
        if (q > 1.4) continue;
        interior += .13 * bell(q, .87, .10) + .07 * bell(q, .49, .38);
      }
      const dnaX = (x + .065) * 1.04 - y * .17, dnaY = (y + .04) * 1.19;
      const nucleus = Math.hypot(dnaX, dnaY) / (.29 + .025 * Math.sin(angle * 5 + phase));
      const chromatin = rich ? (1 - Math.abs(Math.sin(nucleus * 29 + turbulence * 3 + angular * 4))) ** 8 * bell(nucleus, .56, .35) * .215 : 0;
      const core = bell(nucleus, .86, .089) * (.14 + .27 * angular + .13 * salt) +
        bell(nucleus, .25, .61) * (.19 + .09 * turbulence) + chromatin;
      const filament = r < .84 ? (1 - Math.abs(Math.sin(x * 34 - y * 23 + unwarped * 5))) ** 16 * .105 * (1 - r) : 0;
      const facet = material.profile === 3 && r < 1 ? (.04 + .07 * Math.cos(Math.floor((angle + Math.PI) * 2.23) * 7)) * (.1 + r * .9) : 0;
      const glitter = (salt > .976 && r < 1.02 ? .19 * random() : 0);
      const fluorescence = clamp(shell + lamella + diffuse + reflected + matrix + core + interior + filament + facet + glitter);
      const high = clamp((fluorescence - .49) * 1.65);
      let alpha = r < 1 ? .80 : clamp((1.25 - r) / .22) ** 2 * .63;
      alpha = Math.max(alpha, shell * .91);

      const index = (j * size + i) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const dark = material.dark[channel];
        const brightness = clamp((fluorescence * (.85 + .22 * angular)) ** .73);
        image.data[index + channel] = dark + (material.fluor[channel] - dark) * brightness +
          (material.hot[channel] - material.fluor[channel]) * high;
      }
      image.data[index + 3] = alpha * 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // Fine chromatin filaments and sparse, sharp marker fluorescence.
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(radius * material.stretch, radius);
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < (rich ? 44 : 21); i++) {
    const a = random() * TAU, d = .12 + random() * .68;
    const x = Math.cos(a) * d, y = Math.sin(a) * d;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (random() - .5) * .22, y + (random() - .5) * .21,
      x + (random() - .5) * .20, y + (random() - .5) * .20);
    ctx.strokeStyle = rgba(i % 5 === 0 ? material.hot : material.fluor, .07 + random() * .28);
    ctx.lineWidth = .002 + random() * .008;
    ctx.stroke();
  }
  for (let i = 0; i < (rich ? 370 : 125); i++) {
    const a = random() * TAU, d = Math.sqrt(random()) * .95 * profile(a, material, phase);
    const size = .0015 + random() ** 4 * .016;
    ctx.fillStyle = rgba(i % 7 === 0 ? material.hot : material.fluor, .11 + random() ** 2 * .63);
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d, size, size * (.45 + random() * .55), a, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function cellTexture(key: MaterialKey, size: number, seed: number, rich = false) {
  const { surface, ctx } = canvas(size);
  makeCell(ctx, size, materials[key], seed, rich);
  return Texture.from(surface);
}

function glowTexture() {
  const { surface, ctx } = canvas(96);
  const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 47);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.19, 'rgba(255,255,255,.68)');
  gradient.addColorStop(.48, 'rgba(255,255,255,.16)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 96, 96);
  return Texture.from(surface);
}

function resourceAtlas() {
  const size = 72;
  const surface = document.createElement('canvas');
  surface.width = size * 3;
  surface.height = size;
  const ctx = surface.getContext('2d')!;
  const colors: RGB[] = [[100, 236, 227], [181, 223, 118], [255, 179, 96]];
  for (const [i, rgb] of colors.entries()) {
    ctx.save();
    ctx.translate((i + .5) * size, size * .5);
    const gradient = ctx.createRadialGradient(0, 0, 1, 0, 0, 32);
    gradient.addColorStop(0, rgba(rgb, .62));
    gradient.addColorStop(.29, rgba(rgb, .23));
    gradient.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(-36, -36, 72, 72);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(rgb, .98);
    ctx.lineWidth = 1.9;
    ctx.fillStyle = rgba(rgb, .4);
    if (i === 0) {
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.ellipse((k - 1) * 8, Math.sin(k * 2) * 5, 5 + k % 2 * 2, 3.8, k * 1.05, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      if (i === 1) {
        ctx.moveTo(-14, 6);
        ctx.bezierCurveTo(-14, -12, 0, -5, 13, -12);
        ctx.bezierCurveTo(13, 2, 8, 12, -5, 12);
        ctx.quadraticCurveTo(-12, 12, -14, 6);
      } else {
        ctx.moveTo(0, -18);
        ctx.lineTo(12, -3);
        ctx.lineTo(4, 16);
        ctx.lineTo(-12, 7);
        ctx.lineTo(-8, -7);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i === 1 ? -13 : 0, i === 1 ? 9 : -18);
      ctx.lineTo(i === 1 ? 9 : 0, i === 1 ? -8 : 0);
      ctx.lineTo(i === 1 ? 1 : 4, i === 1 ? 4 : 16);
      ctx.strokeStyle = rgba(rgb, .73);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = rgba([255, 255, 225], .91);
    ctx.beginPath();
    ctx.ellipse(i === 1 ? -3 : 1, -2, 2.8, 2, .44, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  const atlas = Texture.from(surface);
  const frame = (index: number) => new Texture({ source: atlas.source, frame: new Rectangle(index * size, 0, size, size) });
  return { energy: frame(0), biomass: frame(1), catalyst: frame(2) };
}

function ribbonTexture() {
  const { surface, ctx } = canvas(1056);
  const random = visualRandom(12039);
  const mid = 518;
  const arms = [
    [-.19, 42, 205, .38, -1], [.25, 22, 270, .65, 1], [.58, 42, 306, .78, -1],
    [1.08, 31, 358, .85, 1], [1.48, 45, 309, .89, -1], [1.93, 45, 234, .53, 1],
    [2.35, 34, 425, .95, -1], [2.68, 35, 361, .81, 1], [3.1, 33, 231, .51, -1],
    [3.45, 32, 337, .79, 1], [3.91, 40, 319, .61, -1], [4.43, 28, 262, .39, 1],
    [4.86, 32, 340, .81, 1], [5.25, 42, 412, .9, -1], [5.72, 38, 274, .65, 1],
    [6.05, 23, 263, .59, 1],
  ];
  ctx.translate(mid, mid);
  ctx.globalCompositeOperation = 'screen';
  const point = (a: number, reach: number, curl: number, t: number, side = 0) => {
    const bend = a + curl * (t ** 1.4) + .13 * Math.sin(t * TAU * 1.1 + a * 2) * t;
    const distance = 89 + t * reach;
    return {
      x: Math.cos(bend) * distance + Math.sin(bend) * side,
      y: Math.sin(bend) * distance - Math.cos(bend) * side,
    };
  };
  for (const [angle, base, reach, opacity, curl] of arms) {
    const length = reach - 56;
    const curvature = curl * (.24 + random() * .44);
    const steps = 50;
    const draft = (width: number, side: number, shortening = 0) => {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps * (1 - shortening);
        const swell = width * (1 - t) ** 1.47 * (1 + .30 * Math.sin(t * 11 + angle));
        const p = point(angle, length, curvature, t, side * swell);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
    };
    draft(0, 0);
    ctx.lineWidth = base * .77;
    ctx.strokeStyle = `rgba(17,146,123,${opacity * .09})`;
    ctx.shadowBlur = 23;
    ctx.shadowColor = 'rgba(24, 222, 186, .72)';
    ctx.stroke();
    ctx.shadowBlur = 0;

    draft(base * .47, 1);
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const p = point(angle, length, curvature, t, -base * .47 * (1 - t) ** 1.47 * (1 + .30 * Math.sin(t * 11 + angle)));
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    const original = point(angle, length, curvature, 0);
    const tip = point(angle, length, curvature, 1);
    const gradient = ctx.createLinearGradient(original.x, original.y, tip.x, tip.y);
    gradient.addColorStop(0, 'rgba(39,155,138,.07)');
    gradient.addColorStop(.34, `rgba(28,149,128,${opacity * .19})`);
    gradient.addColorStop(.7, `rgba(37,169,142,${opacity * .1})`);
    gradient.addColorStop(1, 'rgba(15,92,100,.01)');
    ctx.fillStyle = gradient;
    ctx.fill();

    for (let thread = 0; thread < 9; thread++) {
      draft(base * .49, thread / 4 - 1, random() * .22);
      ctx.lineWidth = thread % 4 === 0 ? 1.1 : .48 + random();
      ctx.strokeStyle = `rgba(${thread % 4 === 0 ? '104,236,203' : '45,170,153'},${(.07 + random() * .31) * opacity})`;
      ctx.stroke();
    }

    for (let barb = 0; barb < 15; barb++) {
      const t = .04 + random() * .82;
      const sign = barb % 2 ? -1 : 1;
      const p = point(angle, length, curvature, t, sign * base * .3 * (1 - t));
      const b = point(angle, length, curvature, t + random() * .2, sign * (9 + random() * 52) * (1 - t * .51));
      const end = point(angle, length * (1.02 + random() * .17), curvature + sign * (.06 + random() * .20), Math.min(1.08, t + .14 + random() * .3));
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(b.x, b.y, end.x, end.y);
      ctx.lineWidth = .4 + random() * 1.5;
      ctx.strokeStyle = `rgba(82,198,171,${opacity * (.07 + random() * .29)})`;
      ctx.stroke();
      if (barb % 5 === 1) {
        ctx.fillStyle = `rgba(142,243,201,${opacity * .7})`;
        ctx.beginPath();
        ctx.arc(end.x, end.y, 1.4 + random() * 2.1, 0, TAU);
        ctx.fill();
      }
    }
    for (let j = 0; j < 155; j++) {
      const t = random() ** 1.2, spread = (random() - .5) * base * (1 - t) ** .44;
      const p = point(angle, length, curvature, t, spread);
      const dot = .45 + random() ** 3 * 2.25;
      ctx.fillStyle = `rgba(${j % 13 === 0 ? '213,255,223' : '98,215,186'},${opacity * (.13 + random() * .47)})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, dot * 1.19, dot, angle, 0, TAU);
      ctx.fill();
    }
  }
  return Texture.from(surface);
}

function vesicleTexture() {
  const { surface, ctx } = canvas(256);
  const random = visualRandom(8291);
  const center = 128;
  ctx.translate(center, center);
  ctx.lineJoin = 'round';
  for (let ring = 0; ring < 5; ring++) {
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const a = TAU * i / 80;
      const r = (77 + ring * 4) * (1 + .14 * Math.cos(a * 2) + .09 * Math.sin(a * 3 + .8));
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.shadowBlur = 9;
    ctx.shadowColor = '#d1f1dc';
    ctx.lineWidth = ring % 2 ? 4 : 7;
    ctx.strokeStyle = `rgba(232,255,237,${ring % 2 ? .10 : .08})`;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  for (let i = 0; i < 27; i++) {
    const a = random() * TAU, r = 46 + random() * 39;
    ctx.fillStyle = `rgba(244,255,242,${.10 + random() * .17})`;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * r, Math.sin(a) * r, 2 + random() * 5, 2 + random() * 5, a, 0, TAU);
    ctx.fill();
  }
  return Texture.from(surface);
}

function prismTexture(warm: boolean) {
  const size = 168;
  const { surface, ctx } = canvas(size);
  const random = visualRandom(warm ? 6283 : 8172);
  const edge: RGB = warm ? [254, 185, 137] : [190, 235, 255];
  const glass: RGB = warm ? [170, 80, 70] : [82, 161, 218];
  const ink: RGB = warm ? [63, 22, 28] : [17, 40, 85];
  const white: RGB = [239, 253, 240];
  const silhouette = [[23, 86], [46, 57], [140, 73], [79, 103], [39, 103]];
  const facet = (points: number[][]) => {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
  };
  const face = (outline: number[][], brighter: boolean) => {
    facet(outline);
    const refraction = ctx.createLinearGradient(29, 69, 146, 92);
    refraction.addColorStop(0, rgba(ink, .75));
    refraction.addColorStop(.3, rgba(brighter ? glass : ink, brighter ? .84 : .91));
    refraction.addColorStop(.65, rgba(brighter ? ink : glass, .56));
    refraction.addColorStop(.85, rgba(glass, .82));
    refraction.addColorStop(1, rgba(edge, .96));
    ctx.fillStyle = refraction;
    ctx.fill();
  };
  facet(silhouette);
  ctx.shadowColor = rgba(glass, .84);
  ctx.shadowBlur = 9;
  ctx.strokeStyle = rgba(edge, .5);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.shadowBlur = 0;
  face([[23, 86], [46, 57], [79, 80], [140, 73]], true);
  face([[23, 86], [79, 80], [140, 73], [79, 103], [39, 103]], false);

  ctx.save();
  facet(silhouette);
  ctx.clip();
  for (let i = 0; i < 360; i++) {
    const x = 25 + random() * 116, y = 56 + random() * 49;
    const dot = random() ** 2 * 1.45;
    ctx.fillStyle = rgba(i % 15 === 0 ? white : edge, .09 + random() * .31);
    ctx.fillRect(x, y, dot * 2.1, dot);
  }
  for (let i = 0; i < 19; i++) {
    const x = 34 + random() * 90, y = 61 + random() * 36;
    ctx.strokeStyle = rgba(i % 4 === 0 ? white : glass, .12 + random() * .27);
    ctx.lineWidth = .45 + random() * 1.1;
    ctx.beginPath();
    ctx.moveTo(x - random() * 12, y + random() * 7);
    ctx.lineTo(x, y);
    ctx.lineTo(x + random() * 24, y - random() * 10);
    ctx.stroke();
  }
  ctx.restore();
  facet(silhouette);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = rgba(edge, .92);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(46, 57);
  ctx.lineTo(78, 80);
  ctx.lineTo(140, 73);
  ctx.moveTo(78, 80);
  ctx.lineTo(79, 103);
  ctx.strokeStyle = rgba(white, .61);
  ctx.lineWidth = 1.3;
  ctx.stroke();
  return Texture.from(surface);
}

function mediumTexture() {
  const size = 672;
  const { surface, ctx } = canvas(size);
  const image = ctx.createImageData(size, size);
  const random = visualRandom(829101);
  for (let j = 0; j < size; j++) {
    const y = j / size;
    for (let i = 0; i < size; i++) {
      const x = i / size;
      const swirl = Math.sin(x * 8 + y * 11) * Math.cos(y * 7 - x * 10);
      const strata = Math.sin(13 * x + 9 * y + swirl * 4) * Math.sin(y * 14 - x * 10 + swirl * 3);
      const finer = Math.sin(x * 37 - y * 48 + strata * 3) * Math.cos(y * 32 + x * 35 + swirl * 4);
      const tissue = (1 - Math.abs(Math.sin(32 * x + 17 * y + strata * 1.8 + finer * 1.1))) ** 11;
      const brightZone = bell(x, .62, .41) * bell(y, .48, .67);
      const signal = clamp(.16 + .15 * swirl + .16 * strata + .09 * finer + tissue * .15 + .13 * brightZone, 0, .75);
      const salt = random() - .5;
      const k = (j * size + i) * 4;
      image.data[k] = 3 + 8 * signal + salt * 3.4;
      image.data[k + 1] = 11 + 31 * signal + salt * 5;
      image.data[k + 2] = 19 + 34 * signal + salt * 7;
      image.data[k + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return Texture.from(surface);
}

export function createTextures() {
  const cells = {} as Record<MaterialKey, Texture>;
  for (const [index, key] of (Object.keys(materials) as MaterialKey[]).entries()) {
    cells[key] = cellTexture(key, index === 0 ? 304 : 216, 6521 + index * 4981);
  }
  return {
    cells,
    resources: resourceAtlas(),
    halo: glowTexture(),
    ribbons: ribbonTexture(),
    hero: cellTexture('proto', 600, 2451, true),
    vesicle: vesicleTexture(),
    medium: mediumTexture(),
    shard: prismTexture(false),
    crownShard: prismTexture(true),
  };
}
