import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { RamsDraft, RamsRevisionDetail } from '../core/api.service';
import { RiskMatrixComponent } from './risk-matrix.component';

@Component({
  selector: 'oa-rams-read-only',
  imports: [RiskMatrixComponent],
  template: `
    <section class="backdrop" (click)="backdrop($event)">
      <div class="viewer" role="dialog" aria-modal="true" [attr.aria-label]="title()" tabindex="-1">
        <header>
          <div>
            <small>Read-only audit record</small>
            <h2>{{ title() }}</h2>
          </div>
          <button type="button" (click)="closed.emit()" aria-label="Close RAMS record">
            Close
          </button>
        </header>
        @if (draft(); as item) {
          <div class="content">
            <section>
              <h3>Overview</h3>
              <dl>
                <div>
                  <dt>Title</dt>
                  <dd>{{ item.overview.title || 'Not recorded' }}</dd>
                </div>
                <div>
                  <dt>Effective from</dt>
                  <dd>{{ item.overview.effectiveFrom || 'Not recorded' }}</dd>
                </div>
                <div>
                  <dt>Revision summary</dt>
                  <dd>{{ item.overview.revisionSummary || 'Not recorded' }}</dd>
                </div>
              </dl>
            </section>
            <section>
              <h3>Scope</h3>
              <p>{{ item.scope.scopeOfWorks || 'No scope recorded.' }}</p>
              @if (item.scope.engineerBriefing.length) {
                <h4>Engineer briefing</h4>
                <ul>
                  @for (point of item.scope.engineerBriefing; track $index) {
                    <li>{{ point }}</li>
                  }
                </ul>
              }
            </section>
            <section>
              <h3>Method statement</h3>
              <ol>
                @for (step of item.methodStatement.steps; track step.id) {
                  <li>
                    <strong>{{ step.title }}</strong>
                    <p>{{ step.detail }}</p>
                  </li>
                } @empty {
                  <li>No method steps recorded.</li>
                }
              </ol>
            </section>
            <section>
              <h3>Hazards and controls</h3>
              @for (hazard of item.riskAssessment.hazards; track hazard.id) {
                <article class="hazard">
                  <strong>{{ hazard.hazard }}</strong>
                  <p>{{ hazard.controls }}</p>
                  <oa-risk-matrix
                    [compact]="true"
                    [initialLikelihood]="hazard.initialLikelihood"
                    [initialSeverity]="hazard.initialSeverity"
                    [residualLikelihood]="hazard.residualLikelihood"
                    [residualSeverity]="hazard.residualSeverity"
                  />
                </article>
              } @empty {
                <p>No hazards recorded.</p>
              }
            </section>
          </div>
        }
        <footer>
          @if (revision()) {
            <button class="pdf" type="button" (click)="pdfRequested.emit(revision()!)">
              Download historical PDF
            </button>
          }
          <button type="button" (click)="closed.emit()">Close</button>
        </footer>
      </div>
    </section>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: grid;
      place-items: center;
      padding: 1rem;
      background: rgb(2 15 35 / 70%);
    }
    .viewer {
      width: min(100%, 58rem);
      max-height: calc(100dvh - 2rem);
      display: grid;
      grid-template-rows: auto 1fr auto;
      overflow: hidden;
      border-radius: 0.7rem;
      background: #fff;
      box-shadow: 0 1rem 4rem #0005;
    }
    header,
    footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.8rem 1rem;
      border-bottom: 1px solid #dbe2ea;
    }
    footer {
      justify-content: flex-end;
      border: 0;
      border-top: 1px solid #dbe2ea;
    }
    h2,
    h3,
    h4,
    p {
      margin-top: 0;
    }
    h2 {
      margin-bottom: 0;
      font-size: 1.15rem;
    }
    header small {
      color: #64748b;
    }
    button {
      min-height: 2.5rem;
      padding: 0 0.8rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.35rem;
      background: #fff;
      font: inherit;
      font-weight: 750;
    }
    button.pdf {
      border-color: #087d70;
      background: #087d70;
      color: #fff;
    }
    .content {
      display: grid;
      gap: 0.7rem;
      padding: 0.8rem;
      overflow-y: auto;
      background: #f5f7fa;
    }
    section section {
      padding: 0.85rem;
      border: 1px solid #dbe2ea;
      border-radius: 0.5rem;
      background: #fff;
      font-size: 0.75rem;
      line-height: 1.5;
    }
    dl {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
      margin: 0;
    }
    dl div {
      display: grid;
      gap: 0.15rem;
    }
    dt {
      color: #64748b;
    }
    dd {
      margin: 0;
      font-weight: 700;
    }
    li p {
      white-space: pre-line;
    }
    .hazard {
      padding: 0.6rem 0;
      border-top: 1px solid #e2e8f0;
    }
    .hazard p {
      white-space: pre-line;
    }
    @media (max-width: 36rem) {
      .backdrop {
        padding: 0;
      }
      .viewer {
        max-height: 100dvh;
        height: 100dvh;
        border-radius: 0;
      }
      dl {
        grid-template-columns: 1fr;
      }
      footer {
        justify-content: stretch;
      }
      footer button {
        flex: 1;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RamsReadOnlyComponent {
  readonly title = input('RAMS record');
  readonly draft = input<RamsDraft>();
  readonly revision = input<RamsRevisionDetail>();
  readonly closed = output<void>();
  readonly pdfRequested = output<RamsRevisionDetail>();
  protected backdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }
}
