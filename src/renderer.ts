import { Application, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Actor, BodyNode, Effect, Quality, WorldState } from './model.ts';
import { createRefraction } from './render-optics.ts';
import { createTextures, type MaterialKey, visualRandom } from './render-textures.ts';

const TAU = Math.PI * 2;
const DISH = 2190;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wrap01 = (t: number) => t - Math.floor(t);
const palette: Record<MaterialKey, number> = {
  proto: 0x6deacf, predator: 0xf99069, symbiote: 0xbce982, crystalline: 0xa2d4ff,
  scavenger: 0xa8cb84, hunter: 0xf29b6c, colony: 0xd9959f, crown: 0xff9872,
};
const effects: Record<Effect['kind'], number> = {
  feed: 0x6ef8d9, bond: 0xbaec97, dash: 0x8fdcd1, hit: 0xffa271,
  pulse: 0xaee6ff, break: 0xe67d65, victory: 0xc4ffac, hazard: 0xe99775,
};
const satellites = [
  [.926, .776, .18, .83], [.635, .245, .15, .83], [.527, .796, .088, .64],
  [.892, .20, .098, .57], [.490, .60, .25, .28], [.878, .315, .24, .22],
];

interface Speck {
  sprite: Sprite;
  x: number;
  y: number;
  depth: number;
  size: number;
  phase: number;
  drift: number;
  opacity: number;
  far: boolean;
}

class SpritePool {
  private next = 0;
  private sprites: Sprite[] = [];

  constructor(private readonly layer: Container) {}

  getLayer() {
    return this.layer;
  }

  begin() {
    this.next = 0;
  }

  spot(texture: Texture, x: number, y: number, diameter: number, opacity: number, rotation = 0, taper = 1, tint = 0xffffff) {
    let sprite = this.sprites[this.next++];
    if (!sprite) {
      sprite = new Sprite(texture);
      sprite.anchor.set(.5);
      this.sprites.push(sprite);
      this.layer.addChild(sprite);
    } else if (sprite.texture !== texture) {
      sprite.texture = texture;
    }
    sprite.visible = true;
    sprite.position.set(x, y);
    sprite.scale.set(diameter / texture.width, diameter * taper / texture.height);
    sprite.rotation = rotation;
    sprite.tint = tint;
    sprite.alpha = opacity;
    return sprite;
  }

  finish() {
    for (let i = this.next; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      if (!sprite.visible) break;
      sprite.visible = false;
      if (sprite.filters) sprite.filters = null;
    }
  }
}

export class GameRenderer {
  private app!: Application;
  private host!: HTMLElement;
  private textures!: ReturnType<typeof createTextures>;
  private refraction!: ReturnType<typeof createRefraction>;
  private readonly scene = new Container();
  private readonly darkWater = new Container();
  private readonly title = new Container();
  private readonly subject = new Container();
  private readonly closeWater = new Container();
  private readonly worldLayer = new Container();
  private readonly topology = new Graphics();
  private readonly structure = new Graphics();
  private readonly guides = new Graphics();
  private readonly impulses = new Graphics();
  private readonly titleMarks = new Graphics();
  private readonly resources = new SpritePool(new Container());
  private readonly bodies = new SpritePool(new Container());
  private readonly lighting = new SpritePool(new Container());
  private readonly heroDetails = new SpritePool(new Container());
  private readonly specks: Speck[] = [];
  private readonly nodeLookup = new Map<number, BodyNode>();
  private titleScalesDirty = true;
  private width = 1;
  private height = 1;
  private mode: Quality = 'auto';
  private low = false;
  private pausedWorld: WorldState | null = null;
  private sampleSeconds = 0;
  private sampleFrames = 0;
  private reducedMotion = false;
  private time = 0;
  private camX = 0;
  private camY = 0;
  private scale = 1.36;
  private targetScale = 1.36;
  private jumpCamera = true;
  private filteredCore?: Sprite;
  private medium!: Sprite;
  private cloud!: Sprite;
  private specCore!: Sprite;
  private specFiber!: Sprite;
  private specFiberBack!: Sprite;
  private specGlow!: Sprite;
  private secondaryCells!: Sprite[];

  async init(host: HTMLElement) {
    this.host = host;
    this.low = matchMedia('(pointer: coarse)').matches;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.app = new Application();
    await this.app.init({
      preference: 'webgl',
      backgroundColor: 0x030e17,
      autoStart: false,
      antialias: false,
      autoDensity: true,
      powerPreference: 'high-performance',
      resolution: this.pixelRatio(),
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
    });
    this.app.canvas.setAttribute('aria-label', 'Live microscopic field');
    host.append(this.app.canvas);
    this.textures = createTextures();
    this.refraction = createRefraction();

    this.medium = this.newSprite(this.textures.medium);
    this.cloud = this.newSprite(this.textures.halo);
    this.cloud.tint = 0x146c61;
    this.cloud.blendMode = 'add';
    this.cloud.alpha = .28;
    this.app.stage.addChild(this.medium, this.cloud, this.darkWater, this.scene, this.closeWater);
    this.scene.addChild(this.title, this.worldLayer);
    this.setupTitle();
    const lighting = this.lighting.getLayer();
    const resource = this.resources.getLayer();
    this.worldLayer.addChild(this.topology, lighting, resource, this.structure, this.bodies.getLayer(), this.impulses, this.guides);
    lighting.blendMode = 'add';
    lighting.visible = !this.low;
    this.seedDebris();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(host);
  }

  private newSprite(texture: Texture) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(.5);
    return sprite;
  }

  private setupTitle() {
    this.specGlow = this.newSprite(this.textures.halo);
    this.specGlow.tint = 0x46e8b1;
    this.specGlow.blendMode = 'add';
    this.specFiber = this.newSprite(this.textures.ribbons);
    this.specFiberBack = this.newSprite(this.textures.ribbons);
    this.specFiberBack.tint = 0x54abb9;
    this.specGlow.alpha = .23;
    this.specCore = this.newSprite(this.textures.hero);
    this.secondaryCells = [
      this.newSprite(this.textures.cells.hunter), this.newSprite(this.textures.cells.symbiote),
      this.newSprite(this.textures.cells.scavenger), this.newSprite(this.textures.cells.colony),
      this.newSprite(this.textures.vesicle), this.newSprite(this.textures.vesicle),
    ];
    this.title.addChild(...this.secondaryCells, this.subject, this.titleMarks);
    this.subject.addChild(this.specGlow, this.specFiberBack, this.specFiber, this.heroDetails.getLayer(), this.specCore);
  }

  private seedDebris() {
    const random = visualRandom(245319);
    for (let i = 0; i < 200; i++) {
      const far = i % 6 !== 0, large = i % 13 === 0, ring = large && i % 2 === 0;
      const texture = ring ? this.textures.vesicle : i % 7 === 0 ? this.textures.resources.energy : this.textures.halo;
      const sprite = this.newSprite(texture);
      const tint = i % 17 === 0 ? 0xc38570 : i % 13 === 0 ? 0x9bd78f : i % 7 === 0 ? 0x82b8b1 : 0x65caaa;
      sprite.tint = tint;
      (far ? this.darkWater : this.closeWater).addChild(sprite);
      this.specks.push({
        sprite, far, x: random(), y: random(), depth: .13 + random() * .67,
        size: large ? 25 + random() * (far ? 74 : 92) : 1 + random() ** 2 * (far ? 11 : 18),
        phase: random() * TAU, drift: random() * 2 - 1,
        opacity: large ? .08 + random() * .13 : .08 + random() * (far ? .53 : .25),
      });
    }
  }

  private pixelRatio() {
    return this.low
      ? Math.min(window.devicePixelRatio || 1, this.width < 720 ? .91 : .78)
      : Math.min(window.devicePixelRatio || 1, 1.65);
  }

  private resize() {
    this.width = Math.max(1, this.host.clientWidth);
    this.height = Math.max(1, this.host.clientHeight);
    this.app.renderer.resize(this.width, this.height, this.pixelRatio());
    this.medium.width = this.width * 1.25;
    this.medium.height = this.height * 1.26;
    this.cloud.width = this.width * 1.1;
    this.cloud.height = this.height * 1.21;
    this.titleScalesDirty = true;
    this.pausedWorld = null;
  }

  setQuality(quality: Quality) {
    this.mode = quality;
    this.applyQuality(quality === 'low' || (quality === 'auto' && matchMedia('(pointer: coarse)').matches));
    this.sampleSeconds = this.sampleFrames = 0;
  }

  private applyQuality(low: boolean) {
    if (this.low === low) return;
    this.low = low;
    this.resize();
    this.lighting.getLayer().visible = !low;
    if (low && this.filteredCore) this.filteredCore.filters = null;
  }

  resetCamera() {
    this.jumpCamera = true;
    this.scale = this.targetScale = this.width < 690 ? .95 : 1.36;
  }

  zoom(delta: number) {
    this.targetScale = clamp(this.targetScale * Math.exp(-clamp(delta, -180, 180) * .0016), .59, 2.58);
  }

  screenToWorld(x: number, y: number) {
    const rect = this.app.canvas.getBoundingClientRect();
    return {
      x: this.camX + (x - rect.x - this.width * .5) / this.scale,
      y: this.camY + (y - rect.y - this.height * .5) / this.scale,
    };
  }

  draw(world: WorldState | null, alpha: number, dt: number, aim: { x: number; y: number } | null, paused: boolean) {
    if (paused && world !== null && this.pausedWorld === world) return;
    this.pausedWorld = paused ? world : null;
    if (!paused || !world) this.time += Math.min(.08, dt);
    if (this.mode === 'auto' && !this.low && world && !paused && dt < .22) {
      this.sampleSeconds += dt;
      this.sampleFrames += 1;
      if (this.sampleSeconds >= 5) {
        if (this.sampleFrames / this.sampleSeconds < 40) this.applyQuality(true);
        this.sampleSeconds = this.sampleFrames = 0;
      }
    }
    this.title.visible = !world;
    this.worldLayer.visible = !!world;
    if (world) this.drawWorld(world, alpha, dt, aim, paused);
    else this.drawSpecimen();
    this.drawMedium(!!world);
    this.app.render();
  }

  private drawMedium(inRun: boolean) {
    const time = this.reducedMotion ? 0 : this.time;
    const offsetX = inRun ? clamp(this.camX * .035, -this.width * .076, this.width * .076) : Math.sin(time * .16) * 12;
    const offsetY = inRun ? clamp(this.camY * .027, -this.height * .08, this.height * .08) : Math.cos(time * .13) * 10;
    this.medium.position.set(this.width * .5 - offsetX, this.height * .5 - offsetY);
    this.cloud.position.set(this.width * (inRun ? .52 : .72), this.height * .49);
    this.cloud.visible = !inRun || !this.low;
    this.cloud.alpha = inRun ? .082 : .29 + Math.sin(time * .3) * .04;
    const count = this.low ? 108 : this.specks.length;
    for (let i = 0; i < this.specks.length; i++) {
      const speck = this.specks[i];
      const active = i < count && (inRun || speck.far || !this.reducedMotion);
      speck.sprite.visible = active;
      if (!active) continue;
      const t = time * speck.depth;
      const parallaxX = inRun ? this.camX * speck.depth / (this.width + 130) : 0;
      const parallaxY = inRun ? this.camY * speck.depth / (this.height + 130) : 0;
      const x = wrap01(speck.x - parallaxX + t * (.004 + speck.drift * .006));
      const y = wrap01(speck.y - parallaxY + t * .004 + .012 * Math.sin(t * .39 + speck.phase));
      speck.sprite.position.set(x * (this.width + 130) - 65, y * (this.height + 130) - 65);
      speck.sprite.rotation = speck.phase + t * .052;
      const shimmer = .82 + .18 * Math.sin(t * .66 + speck.phase);
      speck.sprite.alpha = speck.opacity * shimmer * (inRun ? .83 : 1);
      const scale = speck.size / speck.sprite.texture.width;
      speck.sprite.scale.set(scale, scale * (.61 + speck.depth * .55));
    }
  }

  private drawSpecimen() {
    const w = this.width, h = this.height, t = this.reducedMotion ? 0 : this.time;
    const narrow = w < 700;
    const size = narrow ? Math.min(w * 1.12, h * .69) : Math.min(w * .58, h * .99);
    const x = w * (narrow ? .58 : .727), y = h * (narrow ? .32 : .49);
    this.subject.position.set(x + Math.sin(t * .51) * 5, y + Math.sin(t * .36) * 7);
    this.subject.scale.set(size / 1000);
    this.specFiber.rotation = Math.sin(t * .51) * .065 - .23;
    this.specFiber.alpha = .98;
    this.specFiberBack.width = 960;
    this.specFiberBack.height = 960;
    this.specFiberBack.rotation = .33 + Math.sin(t * .46 + 1) * .07;
    this.specFiberBack.alpha = .55;
    this.specGlow.width = this.specGlow.height = 670;
    this.specCore.width = 443 + Math.sin(t * .88) * 14;
    this.specCore.height = 448 - Math.sin(t * .88) * 7;
    this.specCore.rotation = -.32 + Math.sin(t * .33) * .055;
    this.setOptics(this.specCore, .34 + Math.sin(t * .79) * .14);

    this.heroDetails.begin();
    for (let i = 0; i < 11; i++) {
      const angle = i * 2.3999632 + Math.sin(t * .34) * .095;
      const orbit = 118 + i * 12.5 + Math.sin(t * .52 + i * 2.2) * 9;
      const satellite = i === 3 || i === 7 ? this.textures.cells.symbiote : this.textures.cells.proto;
      this.heroDetails.spot(satellite, Math.cos(angle) * orbit, Math.sin(angle) * orbit,
        41 + (i * 47 % 35), .63 - i * .037, angle + Math.sin(t * .31 + i) * .17, .57 + i * .025);
    }
    this.heroDetails.finish();

    for (let i = 0; i < this.secondaryCells.length; i++) {
      const sprite = this.secondaryCells[i];
      const [nx, ny, scale, opacity] = satellites[i];
      sprite.position.set(w * (narrow ? (nx - .50) * 2.2 : nx) + Math.sin(t * .36 + i) * 9,
        h * (narrow ? (ny - .05) * .64 : ny) + Math.cos(t * .43 + i) * 6);
      sprite.width = size * scale;
      sprite.height = size * scale * (.87 + i * .036);
      sprite.alpha = opacity;
      sprite.rotation = i * .72 + Math.sin(t * .43 + i) * .29;
      if (i >= 4) sprite.tint = i === 4 ? 0x5cabb3 : 0x9ad397;
    }

    if (!this.titleScalesDirty) return;
    this.titleScalesDirty = false;
    const marks = this.titleMarks;
    marks.clear();
    const radius = size * .367;
    this.dashedRing(marks, x, y, radius, 0x77b49f, .20, 48, .34, .6);
    this.dashedRing(marks, x, y, radius * 1.066, 0x8eafaa, .15, 4, .64, .8);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI * .5;
      const rx = x + Math.cos(a) * radius, ry = y + Math.sin(a) * radius;
      const line = 8;
      marks.moveTo(rx - Math.cos(a) * line, ry - Math.sin(a) * line)
        .lineTo(rx + Math.cos(a) * line, ry + Math.sin(a) * line)
        .stroke({ color: 0x79c8b6, alpha: .22, width: .7 });
    }
  }

  private setOptics(sprite: Sprite, stress: number) {
    if (sprite.filters !== null && this.low) sprite.filters = null;
    if (this.low) return;
    if (this.filteredCore !== sprite) {
      if (this.filteredCore) this.filteredCore.filters = null;
      this.filteredCore = sprite;
    }
    if (!sprite.filters) sprite.filters = [this.refraction];
    this.refraction.resources.refraction.uniforms.uSeconds = this.reducedMotion ? 0 : this.time;
    this.refraction.resources.refraction.uniforms.uStress = stress;
  }

  private drawWorld(world: WorldState, alpha: number, dt: number, aim: { x: number; y: number } | null, paused: boolean) {
    const player = world.player;
    const cx = lerp(player.px, player.x, alpha), cy = lerp(player.py, player.y, alpha);
    if (this.jumpCamera) {
      this.camX = cx;
      this.camY = cy;
      this.jumpCamera = false;
    }
    if (!paused) {
      const cameraEase = 1 - Math.exp(-dt * 6.8);
      const dissolution = world.outcome === 'won' ? world.effects.find(effect => effect.kind === 'victory') : undefined;
      const focusX = dissolution ? lerp(cx, dissolution.x, .44) : cx + player.vx * .105;
      const focusY = dissolution ? lerp(cy, dissolution.y, .44) : cy + player.vy * .105;
      const zoom = dissolution ? Math.min(this.targetScale, this.width < 690 ? .69 : 1.02) : this.targetScale;
      this.camX = lerp(this.camX, focusX, cameraEase);
      this.camY = lerp(this.camY, focusY, cameraEase);
      this.scale = lerp(this.scale, zoom, 1 - Math.exp(-dt * 8));
    }
    this.worldLayer.scale.set(this.scale);
    this.worldLayer.position.set(this.width * .5 - this.camX * this.scale, this.height * .5 - this.camY * this.scale);
    const halfW = this.width * .5 / this.scale, halfH = this.height * .5 / this.scale;
    this.topology.clear();
    this.structure.clear();
    this.impulses.clear();
    this.guides.clear();
    this.resources.begin();
    this.bodies.begin();
    this.lighting.begin();

    if (Math.hypot(this.camX, this.camY) > DISH - Math.hypot(halfW, halfH) - 60) {
      this.topology.circle(0, 0, DISH).stroke({ color: 0x4ca8a5, alpha: .27, width: 1.4 });
      this.topology.circle(0, 0, DISH + 13).stroke({ color: 0x18637c, alpha: .22, width: 19 });
    }
    for (const hazard of world.hazards) {
      if (Math.abs(hazard.x - this.camX) > halfW + hazard.radius + 36 ||
        Math.abs(hazard.y - this.camY) > halfH + hazard.radius + 36) continue;
      const color = hazard.kind === 'acid' ? 0xd3bb6a : 0xff9472;
      if (hazard.kind === 'wave') {
        const radius = hazard.radius * clamp(hazard.age / hazard.life, 0, 1);
        const fade = 1 - .58 * hazard.age / hazard.life;
        this.topology.circle(hazard.x, hazard.y, radius).stroke({ color, alpha: .29 * fade, width: 13 });
        this.topology.circle(hazard.x, hazard.y, radius).stroke({ color, alpha: .77 * fade, width: 2 });
        this.dashedRing(this.topology, hazard.x, hazard.y, Math.max(1, radius - 8), 0xffbb8d, .46 * fade, 22, .55, .95);
        continue;
      }
      const warning = hazard.age < .8;
      const shimmer = .76 + .24 * Math.sin(this.time * 5.1 + hazard.x);
      const opacity = clamp((hazard.life - hazard.age) * 2, 0, 1);
      this.topology.circle(hazard.x, hazard.y, hazard.radius).fill({ color: 0xa5a250, alpha: opacity * (warning ? .045 : .096) * shimmer });
      this.dashedRing(this.topology, hazard.x, hazard.y, hazard.radius, color, .47 * opacity, 18, .57, 1.2);
      if (!warning && !this.low) this.lighting.spot(this.textures.halo, hazard.x, hazard.y, hazard.radius * 2.7, .10 * opacity, 0, 1, color);
    }

    for (const nutrient of world.resources) {
      if (!nutrient.active || Math.abs(nutrient.x - this.camX) > halfW + 35 || Math.abs(nutrient.y - this.camY) > halfH + 35) continue;
      const pulse = nutrient.phase + this.time * 1.49;
      const scale = .94 + Math.sin(pulse) * .09;
      this.resources.spot(this.textures.resources[nutrient.kind], nutrient.x, nutrient.y,
        Math.max(18, nutrient.size * 3.6) * scale, .87 + Math.sin(pulse) * .11, nutrient.phase + this.time * .23);
    }

    for (const actor of world.enemies) {
      const margin = actor.kind === 'crown' ? 320 : 140;
      if (Math.abs(actor.x - this.camX) > halfW + margin || Math.abs(actor.y - this.camY) > halfH + margin) continue;
      this.drawActor(actor, alpha);
    }
    if (world.outcome !== 'dead') {
      this.drawActor(player, alpha);
    } else if (this.filteredCore) {
      this.filteredCore.filters = null;
      this.filteredCore = undefined;
    }
    for (const effect of world.effects) {
      if (Math.abs(effect.x - this.camX) <= halfW + 240 && Math.abs(effect.y - this.camY) <= halfH + 240) this.drawEffect(effect, world.player.path);
    }
    if (world.outcome === 'active' && !paused && aim) this.drawAim(cx, cy, aim);
    this.resources.finish();
    this.bodies.finish();
    this.lighting.finish();
  }

  private drawActor(actor: Actor, alpha: number) {
    const x = lerp(actor.px, actor.x, alpha), y = lerp(actor.py, actor.y, alpha);
    const material = actor.kind === 'player' ? actor.path ?? 'proto' : actor.kind;
    const tint = palette[material];
    const flash = clamp(actor.flash * 4.5, 0, 1);
    const radius = actor.nodes[0]?.size ?? 16;
    const speed = Math.hypot(actor.vx, actor.vy);
    const ripple = this.time * 2.1 + actor.id * .96;
    const energyTone = actor.energy > 1 ? clamp(actor.energy / 85, .2, 1) : .55;
    this.nodeLookup.clear();
    for (const node of actor.nodes) this.nodeLookup.set(node.id, node);
    if (!this.low) {
      const alpha = actor.kind === 'player' ? .18 + energyTone * .07 : actor.kind === 'crown' ? .19 : .13;
      this.lighting.spot(this.textures.halo, x, y, radius * (actor.kind === 'crown' ? 6.8 : 6.1), alpha + flash * .1, 0, 1, tint);
    }
    if (actor.kind === 'player' || actor.kind === 'crown') {
      this.dashedRing(this.structure, x, y, radius + 9 + actor.tier * .9,
        tint, actor.kind === 'crown' ? .32 : .16, 4, .32, .75);
    }
    if (actor.kind === 'player' || actor.kind === 'crown' || actor.kind === 'colony') {
      this.drawCilia(actor, x, y, radius, ripple, tint);
    }
    if (actor.shield > 0) {
      const shieldSize = radius * (4.0 + Math.sin(ripple * 1.5) * .09);
      this.lighting.spot(this.textures.vesicle, x, y, shieldSize, .73, ripple * .06, .97, tint);
      this.dashedRing(this.structure, x, y, shieldSize * .37, tint, .32, 11, .65, .9);
    }
    if (actor.charge > .03 && actor.kind !== 'player') {
      this.dashedRing(this.structure, x, y, radius * (1.32 + actor.charge * .75) + 10, 0xffac77, .38 + actor.charge * .45, 18, .62, 1.1);
      if (!this.low) this.lighting.spot(this.textures.halo, x, y, radius * 7, actor.charge * .26, 0, 1, 0xff8457);
    }
    for (const node of actor.nodes) {
      if (node.kind === 'core') continue;
      this.drawNode(node, x, y, material, tint, ripple, alpha, flash);
    }
    const strain = clamp(speed / 680, 0, .18);
    const pulse = .99 + .032 * Math.sin(ripple);
    const core = this.bodies.spot(this.textures.cells[material], x, y,
      radius * 3.28 * pulse * (1 + strain), .98, actor.heading, 1 - strain * .89, flash > .4 ? 0xffd5cf : 0xffffff);
    if (actor.kind === 'player') this.setOptics(core, .25 + strain + flash * .52);
    if (actor.kind === 'crown') {
      const span = clamp(actor.hp / actor.maxHp, 0, 1);
      this.guides.beginPath().arc(x, y, radius + 13, -Math.PI * .5, -Math.PI * .5 + TAU * span)
        .stroke({ width: 2, color: 0xffa581, alpha: .73 });
    }
  }

  private drawCilia(actor: Actor, x: number, y: number, radius: number, ripple: number, tint: number) {
    if (actor.path === 'crystalline' || this.low) return;
    const structure = this.structure;
    const count = actor.path === 'symbiote' || actor.kind === 'colony' ? 16 : 9;
    const reach = actor.path === 'symbiote' ? .48 : actor.path === 'predator' ? .31 : .34;
    structure.beginPath();
    for (let i = 0; i < count; i++) {
      const a = i * TAU / count + actor.heading * .71;
      const v = Math.sin(i * 19.45);
      const curl = .18 * Math.sin(ripple * 1.5 + i * .6) + (i % 2 ? .16 : -.21);
      const r0 = radius * (.94 + v * .07);
      const r1 = radius * (1.08 + reach * (.68 + Math.sin(ripple * .71 + i * 1.3) * .28 + v * .19));
      structure.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0)
        .quadraticCurveTo(x + Math.cos(a + curl * .41) * lerp(r0, r1, .62), y + Math.sin(a + curl * .41) * lerp(r0, r1, .62),
          x + Math.cos(a + curl) * r1, y + Math.sin(a + curl) * r1);
    }
    structure.stroke({ width: .72, color: tint, alpha: .44, cap: 'round' });
  }

  private drawNode(node: BodyNode, rootX: number, rootY: number, material: MaterialKey, color: number, ripple: number, alpha: number, flash: number) {
    const parent = this.nodeLookup.get(node.parent);
    const ox = parent ? lerp(parent.px, parent.x, alpha) : rootX;
    const oy = parent ? lerp(parent.py, parent.y, alpha) : rootY;
    const growth = clamp(node.age * 2.2, .03, 1);
    const x = lerp(ox, lerp(node.px, node.x, alpha), growth);
    const y = lerp(oy, lerp(node.py, node.y, alpha), growth);
    const dx = x - ox, dy = y - oy;
    const length = Math.max(.1, Math.hypot(dx, dy));
    const dir = Math.atan2(dy, dx);
    const flex = Math.sin(ripple * .86 + node.id * 1.68) * length * .268;
    const midX = ox + dx * .52 - dy / length * flex;
    const midY = oy + dy * .52 + dx / length * flex;
    const vitality = clamp(node.hp / node.maxHp, .05, 1);
    const effectiveColor = vitality < .34 ? 0xc98474 : color;
    const patch = this.structure;
    const width = Math.max(1.2, node.size * .23) * growth;

    patch.moveTo(ox, oy).quadraticCurveTo(midX, midY, x, y)
      .stroke({ width: width * 3.7, color: effectiveColor, alpha: .072, cap: 'round' });
    patch.moveTo(ox, oy).quadraticCurveTo(midX, midY, x, y)
      .stroke({ width: width, color: effectiveColor, alpha: .31 + vitality * .27, cap: 'round' });

    if (!this.low) {
      const t = wrap01(ripple * .19 + node.id * .29);
      const u = 1 - t;
      const bx = u * u * ox + 2 * u * t * midX + t * t * x;
      const by = u * u * oy + 2 * u * t * midY + t * t * y;
      patch.circle(bx, by, Math.max(.5, width * .56)).fill({ color: 0xd4ffe2, alpha: .48 + clamp(node.flow, 0, 1) * .48 });
      this.lighting.spot(this.textures.halo, bx, by, width * 4.8, .26, 0, 1, effectiveColor);
    }
    const size = node.size * growth;
    const nx = dx / length, ny = dy / length;
    const damageTint = vitality < .34 || flash > .5 ? 0xffc6b6 : 0xffffff;
    if (node.kind === 'spine') {
      const extension = size * 2.41;
      const sx = x + nx * extension, sy = y + ny * extension;
      const rx = x + nx * size - ny * size * .69, ry = y + ny * size + nx * size * .69;
      patch.moveTo(x - ny * size * .69, y + nx * size * .69)
        .quadraticCurveTo(rx, ry, sx, sy)
        .quadraticCurveTo(x + nx * size + ny * size * .32, y + ny * size - nx * size * .32, x + ny * size * .43, y - nx * size * .43)
        .closePath().fill({ color: 0x853324, alpha: .79 }).stroke({ color: effectiveColor, width: 1.1, alpha: .87 });
      patch.moveTo(x, y).quadraticCurveTo(x + nx * size * 1.6 - ny * size * .24, y + ny * size * 1.6 + nx * size * .24, sx, sy)
        .stroke({ width: .75, color: 0xffdbac, alpha: .6 });
    } else if (node.kind === 'veil') {
      const veil = this.bodies.spot(this.textures.vesicle, x, y, size * 5.3, .55 + Math.sin(ripple * .68) * .11, dir, .82, effectiveColor);
      veil.alpha *= growth;
      for (let i = -1; i <= 1; i++) {
        const ang = dir + i * .58, vx = Math.cos(ang), vy = Math.sin(ang);
        patch.moveTo(x, y).quadraticCurveTo(x + vx * size * 1.9 + ny * size * .55, y + vy * size * 1.9 - nx * size * .55,
          x + vx * size * 2.8, y + vy * size * 2.8).stroke({ color: effectiveColor, alpha: .35, width: .85 });
      }
    } else if (node.kind === 'prism') {
      const shard = material === 'crown' ? this.textures.crownShard : this.textures.shard;
      for (let i = -1; i <= 1; i++) {
        const ang = dir + i * .48, ux = Math.cos(ang), uy = Math.sin(ang);
        const rise = size * (i === 0 ? 2.68 : 1.98);
        const flare = .80 + .13 * Math.sin(ripple + node.id * 1.15 + i * 1.25);
        this.bodies.spot(shard, x + ux * rise * .46, y + uy * rise * .46,
          rise * 1.52, flare + vitality * .14, ang, i === 0 ? 1.31 : 1.09, damageTint);
      }
    } else if (!this.low) {
      const frill = size * (material === 'scavenger' ? 1.9 : 1.41);
      patch.moveTo(x + nx * .35 * size, y + ny * .35 * size)
        .quadraticCurveTo(x + nx * frill - ny * frill * .71, y + ny * frill + nx * frill * .71,
          x + nx * frill * 1.87 + ny * flex * .18, y + ny * frill * 1.87 - nx * flex * .18)
        .stroke({ width: .65, color: effectiveColor, alpha: .36 });
    }
    this.bodies.spot(this.textures.cells[material], x, y, size * (node.kind === 'tissue' ? 3.02 : 2.29),
      (.74 + vitality * .24) * Math.sqrt(growth), dir, node.kind === 'tissue' ? .86 : .69, damageTint);
  }

  private drawEffect(effect: Effect, path: Actor['path']) {
    const progress = clamp(effect.age / effect.life, 0, 1);
    const fade = (1 - progress) ** 1.46;
    const color = effects[effect.kind];
    const { x, y, angle } = effect;
    const span = Math.max(11, effect.size || 0);
    if (effect.kind === 'pulse') {
      this.drawDischarge(x, y, angle, span, progress, fade, path);
      return;
    }
    const burst = effect.kind === 'victory' || effect.kind === 'bond';
    if (burst || effect.kind === 'hazard') {
      const radius = span * (.32 + progress * .95);
      this.impulses.circle(x, y, radius).stroke({ width: burst ? 2.2 : 1.1, color, alpha: fade * .81 });
      if (!this.low) {
        this.impulses.circle(x, y, radius * .91).stroke({ width: 5, color, alpha: fade * .18 });
        this.lighting.spot(this.textures.halo, x, y, radius * 3.8, fade * .27, 0, 1, color);
      }
    }
    const count = effect.kind === 'victory' ? (this.low ? 14 : 29) : burst ? 9 : 5;
    for (let i = 0; i < count; i++) {
      const a = angle + i * (TAU / count) + .2 * Math.sin(i * 19.25) + (effect.kind === 'victory' ? progress * (i % 2 ? .51 : -.32) : 0);
      const length = span * (effect.kind === 'dash' ? 1.4 : 1) * (.29 + (i % 3) * .21 + progress * .7);
      const xx = x + Math.cos(a) * length, yy = y + Math.sin(a) * length;
      const trail = effect.kind === 'feed' ? 2 : span * (.16 + i % 3 * .07);
      this.impulses.moveTo(xx - Math.cos(a) * trail, yy - Math.sin(a) * trail)
        .lineTo(xx, yy).stroke({ color, width: 1.15 + (i % 3) * .26, alpha: fade * (.6 + i % 3 * .13), cap: 'round' });
      if (effect.kind === 'victory') {
        this.bodies.spot(this.textures.crownShard, xx, yy, (12 + i % 5 * 3) * (1 - progress * .7),
          fade * .85, a + progress * (i % 3 + 1) * 2.1, .76);
      }
    }
  }

  private drawDischarge(x: number, y: number, angle: number, span: number, progress: number, fade: number, path: Actor['path']) {
    const ux = Math.cos(angle), uy = Math.sin(angle);
    const tint = path ? palette[path] : 0x9df1e6;
    const spread = path === 'crystalline' ? .12 : .23;
    const length = span * (.77 + Math.min(1, progress * 9) * .22);
    const trails = this.low ? 6 : 11;
    for (let i = 0; i < trails; i++) {
      const drift = Math.sin(i * 11.65 + progress * 4);
      const along = length * (.64 + (i * 7 % 19) / 19 * .35);
      const offset = (i * 7 % 13 / 6 - 1) * (22 + along * spread);
      const tx = x + ux * along - uy * offset, ty = y + uy * along + ux * offset;
      const bend = offset * .23 + drift * span * .035;
      const start = progress * along * .35;
      this.impulses.moveTo(x + ux * start, y + uy * start)
        .quadraticCurveTo(x + ux * along * .64 - uy * bend, y + uy * along * .64 + ux * bend, tx, ty)
        .stroke({ color: i % 4 === 0 ? 0xe9fff6 : tint, alpha: fade * (.13 + i % 4 * .147), width: 1 + i % 4 * .52, cap: 'round' });
      if (!this.low && i % 2 === 0) {
        this.lighting.spot(this.textures.halo, tx, ty, 15 + i % 5 * 8, fade * .57, angle, .48, tint);
      }
    }
    this.impulses.moveTo(x + ux * 8, y + uy * 8).lineTo(x + ux * length, y + uy * length)
      .stroke({ color: tint, alpha: fade * (path === 'crystalline' ? .89 : .41), width: path === 'crystalline' ? 3 : 1.8, cap: 'round' });
    if (!this.low) this.lighting.spot(this.textures.halo, x + ux * 22, y + uy * 22, 94, fade * .64, angle, .58, tint);
  }

  private drawAim(x: number, y: number, aim: { x: number; y: number }) {
    const distance = Math.hypot(aim.x - x, aim.y - y);
    if (distance < 9) return;
    const r = 5 / this.scale;
    this.guides.moveTo(aim.x - r, aim.y).lineTo(aim.x - r * .45, aim.y)
      .moveTo(aim.x + r, aim.y).lineTo(aim.x + r * .45, aim.y)
      .moveTo(aim.x, aim.y - r).lineTo(aim.x, aim.y - r * .45)
      .moveTo(aim.x, aim.y + r).lineTo(aim.x, aim.y + r * .45)
      .stroke({ color: 0xc6f2dc, width: .85 / this.scale, alpha: .72 });
  }

  private dashedRing(graphics: Graphics, x: number, y: number, radius: number, color: number, alpha: number, count: number, segment: number, width: number) {
    const step = TAU / count;
    graphics.beginPath();
    for (let i = 0; i < count; i++) {
      const angle = i * step;
      const start = angle + step * .12;
      graphics.moveTo(x + Math.cos(start) * radius, y + Math.sin(start) * radius)
        .arc(x, y, radius, start, angle + step * (.12 + segment));
    }
    graphics.stroke({ color, alpha, width });
  }
}
