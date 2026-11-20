import type { RawInput } from './model.ts';

interface ControlActions {
  pause(): void;
  evolve(): void;
  zoom(delta: number): void;
}

type Pulse = 'bond' | 'dash' | 'ability';
type Point = NonNullable<RawInput['pointer']>;

const movement = {
  KeyW: 1, ArrowUp: 1, KeyS: 2, ArrowDown: 2,
  KeyA: 4, ArrowLeft: 4, KeyD: 8, ArrowRight: 8,
} as const;

const pulses = {
  Space: 'dash', KeyE: 'bond', KeyQ: 'ability', KeyF: 'ability',
} as const;

const pulseBits = { bond: 1, dash: 2, ability: 4, absorb: 8 };

function point(event: PointerEvent): Point {
  return { x: event.clientX, y: event.clientY };
}

function capture(target: HTMLElement, id: number): void {
  try {
    target.setPointerCapture?.(id);
  } catch {
    // The pointer may have ended before capture was granted.
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class GameControls {
  private enabled = true;
  private keys = new Set<keyof typeof movement>();
  private queued = 0;
  private pointer: Point | null = null;
  private mouseHeld = false;
  private field = new Map<number, Point>();
  private absorbButtons = new Set<number>();
  private pinchDistance = 0;
  private fieldAbsorbing = false;
  private stick: { id: number; origin: Point } | null = null;
  private stickX = 0;
  private stickY = 0;
  private readonly knob = document.querySelector<HTMLElement>('#joystick-knob');

  constructor(host: HTMLElement, actions: ControlActions) {
    window.addEventListener('keydown', (event) => {
      const editable = (event.target as HTMLElement | null)?.closest?.('input, select, textarea, [contenteditable]');
      if (event.code === 'Escape' || (event.code === 'KeyP' && !editable)) {
        if (!event.repeat) {
          event.preventDefault();
          actions.pause();
        }
        return;
      }

      if (!this.enabled || editable || event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.code === 'Tab' && !event.shiftKey && !(event.target as HTMLElement | null)?.closest?.('button, a')) {
        event.preventDefault();
        if (!event.repeat) actions.evolve();
        return;
      }

      if (Object.hasOwn(movement, event.code)) {
        event.preventDefault();
        this.keys.add(event.code as keyof typeof movement);
      }

      if (Object.hasOwn(pulses, event.code)) {
        if (event.code === 'Space' && (event.target as HTMLElement | null)?.closest?.('button, a')) return;
        event.preventDefault();
        if (!event.repeat) this.queue(pulses[event.code as keyof typeof pulses]);
      }
    });

    window.addEventListener('keyup', (event) => this.keys.delete(event.code as keyof typeof movement));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });

    host.addEventListener('pointerdown', (event) => {
      if (!this.enabled || event.button !== 0) return;
      if (event.pointerType === 'touch') {
        if (this.field.size >= 2) return;
        event.preventDefault();
        this.field.set(event.pointerId, point(event));
        capture(host, event.pointerId);
        if (this.field.size === 1) {
          this.fieldAbsorbing = true;
          this.pointer = point(event);
          this.queued |= pulseBits.absorb;
        } else {
          const [a, b] = this.field.values();
          this.pinchDistance = distance(a, b);
          this.fieldAbsorbing = false;
          this.queued &= ~pulseBits.absorb;
        }
        return;
      }
      this.pointer = point(event);
      this.mouseHeld = true;
      this.queued |= pulseBits.absorb;
    });

    host.addEventListener('pointermove', (event) => {
      if (!this.enabled) return;
      if (event.pointerType !== 'touch') {
        this.pointer = point(event);
        return;
      }
      if (!this.field.has(event.pointerId)) return;
      this.field.set(event.pointerId, point(event));
      if (this.field.size === 2) {
        const [a, b] = this.field.values();
        const spacing = distance(a, b);
        if (this.pinchDistance > 5 && spacing > 5) actions.zoom(Math.log(this.pinchDistance / spacing) * 600);
        this.pinchDistance = spacing;
      } else {
        this.pointer = point(event);
      }
    });

    const release = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') this.mouseHeld = false;
      if (this.field.delete(event.pointerId)) {
        this.pinchDistance = 0;
        this.fieldAbsorbing = false;
      }
      this.absorbButtons.delete(event.pointerId);
      if (this.stick?.id === event.pointerId) {
        this.stick = null;
        this.setStick(0, 0);
      }
    };

    host.addEventListener('lostpointercapture', release);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    host.addEventListener('contextmenu', (event) => {
      if (this.enabled) event.preventDefault();
    });

    host.addEventListener('wheel', (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? host.clientHeight : 1;
      actions.zoom(Math.min(240, Math.max(-240, event.deltaY * unit)));
    }, { passive: false });

    const joystick = document.querySelector<HTMLElement>('#joystick');
    joystick?.addEventListener('pointerdown', (event) => {
      if (!this.enabled || this.stick || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.stick = { id: event.pointerId, origin: point(event) };
      if (event.pointerType === 'touch' && this.field.size === 0) this.pointer = null;
      capture(joystick, event.pointerId);
    });

    joystick?.addEventListener('pointermove', (event) => {
      if (this.stick?.id !== event.pointerId) return;
      const dx = event.clientX - this.stick.origin.x;
      const dy = event.clientY - this.stick.origin.y;
      const length = Math.hypot(dx, dy);
      const magnitude = Math.min(1, Math.max(0, (length - 4) / 32));
      const factor = length === 0 ? 0 : magnitude / length;
      this.setStick(dx * factor, dy * factor);
    });
    joystick?.addEventListener('lostpointercapture', release);

    for (const button of document.querySelectorAll<HTMLElement>('[data-touch]')) {
      const action = button.dataset.touch;
      if (action !== 'absorb' && action !== 'bond' && action !== 'dash' && action !== 'ability') continue;
      button.addEventListener('pointerdown', (event) => {
        if (!this.enabled || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        if (action === 'absorb') {
          this.absorbButtons.add(event.pointerId);
          this.queued |= pulseBits.absorb;
          if (event.pointerType === 'touch' && this.field.size === 0) this.pointer = null;
          capture(button, event.pointerId);
        } else {
          this.queue(action);
        }
      });
      button.addEventListener('lostpointercapture', release);
      button.addEventListener('click', (event) => {
        if (this.enabled && event.detail === 0) this.queued |= pulseBits[action];
      });
    }
  }

  setEnabled(enabled: boolean): void {
    if (enabled && !this.enabled) (document.activeElement as HTMLElement | null)?.blur?.();
    if (!enabled) this.clear();
    this.enabled = enabled;
  }

  sample(): RawInput {
    let direction = 0;
    for (const key of this.keys) direction |= movement[key];
    const x = Number(Boolean(direction & 8)) - Number(Boolean(direction & 4)) + this.stickX;
    const y = Number(Boolean(direction & 2)) - Number(Boolean(direction & 1)) + this.stickY;
    const scale = Math.max(1, Math.hypot(x, y));
    const flags = this.queued;
    this.queued = 0;

    return {
      x: x / scale,
      y: y / scale,
      pointer: this.pointer,
      absorb: this.mouseHeld || this.fieldAbsorbing || this.absorbButtons.size !== 0 || Boolean(flags & pulseBits.absorb),
      bond: Boolean(flags & pulseBits.bond),
      dash: Boolean(flags & pulseBits.dash),
      ability: Boolean(flags & pulseBits.ability),
    };
  }

  clear(): void {
    this.keys.clear();
    this.field.clear();
    this.absorbButtons.clear();
    this.queued = 0;
    this.pointer = null;
    this.mouseHeld = false;
    this.fieldAbsorbing = false;
    this.pinchDistance = 0;
    this.stick = null;
    this.setStick(0, 0);
  }

  private queue(pulse: Pulse): void {
    this.queued |= pulseBits[pulse];
  }

  private setStick(x: number, y: number): void {
    this.stickX = x;
    this.stickY = y;
    this.knob?.style.setProperty('--stick-x', `${x * 29}px`);
    this.knob?.style.setProperty('--stick-y', `${y * 29}px`);
  }
}
