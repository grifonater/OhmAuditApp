import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { ElementRef } from '@angular/core';

@Component({
  selector: 'oa-signature-pad',
  template: `
    <div class="signature-frame" [class.drawn]="drawn()">
      <canvas
        #canvas
        aria-label="Draw your signature"
        (pointerdown)="start($event)"
        (pointermove)="move($event)"
        (pointerup)="end($event)"
        (pointercancel)="end($event)"
      ></canvas>
      @if (!drawn()) {
        <span>Sign here</span>
      }
    </div>
    <button type="button" class="clear" [disabled]="!drawn()" (click)="clear()">
      Clear signature
    </button>
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.4rem;
    }
    .signature-frame {
      position: relative;
      min-height: 10rem;
      border: 2px dashed #94a3b8;
      border-radius: 0.55rem;
      background: #fff;
      overflow: hidden;
    }
    .signature-frame.drawn {
      border-style: solid;
      border-color: #168a53;
    }
    canvas {
      display: block;
      width: 100%;
      height: 10rem;
      touch-action: none;
      cursor: crosshair;
    }
    .signature-frame > span {
      position: absolute;
      inset: auto 1rem 1rem;
      border-bottom: 1px solid #cbd5e1;
      color: #64748b;
      font-size: 0.7rem;
      pointer-events: none;
    }
    .clear {
      justify-self: end;
      border: 0;
      background: transparent;
      color: #075ed1;
      font: inherit;
      font-size: 0.7rem;
      font-weight: 750;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignaturePadComponent {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  readonly signatureChange = output<string>();
  readonly drawn = signal(false);
  private drawing = false;
  private last: { x: number; y: number } | undefined;

  constructor() {
    afterNextRender(() => this.resize());
  }

  protected start(event: PointerEvent): void {
    event.preventDefault();
    this.resize(false);
    this.drawing = true;
    this.canvas().nativeElement.setPointerCapture(event.pointerId);
    this.last = this.point(event);
  }

  protected move(event: PointerEvent): void {
    if (!this.drawing || !this.last) return;
    event.preventDefault();
    const canvas = this.canvas().nativeElement;
    const next = this.point(event);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.beginPath();
    context.moveTo(this.last.x, this.last.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    this.last = next;
    this.drawn.set(true);
  }

  protected end(event: PointerEvent): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.last = undefined;
    const canvas = this.canvas().nativeElement;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (this.drawn()) this.signatureChange.emit(canvas.toDataURL('image/png'));
  }

  clear(): void {
    const canvas = this.canvas().nativeElement;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    this.drawn.set(false);
    this.signatureChange.emit('');
  }

  private resize(preserve = true): void {
    const canvas = this.canvas().nativeElement;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (canvas.width === width && canvas.height === height) return;
    const image = preserve && canvas.width && canvas.height ? canvas.toDataURL() : '';
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2.2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';
    if (image) {
      const restored = new Image();
      restored.onload = () => context.drawImage(restored, 0, 0, rect.width, rect.height);
      restored.src = image;
    }
  }

  private point(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas().nativeElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
}
