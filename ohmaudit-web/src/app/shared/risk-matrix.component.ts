import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ramsRiskBand, ramsRiskClass, ramsRiskScore } from '../core/rams-library';

@Component({
  selector: 'oa-risk-matrix',
  template: `
    <div class="matrix-wrap" [class.compact]="compact()">
      @if (initialLikelihood() && initialSeverity()) {
        <div class="score-summary">
          <span
            >Initial
            <strong [class]="riskClass(initialScore())"
              >{{ initialScore() }} {{ riskBand(initialScore()) }}</strong
            ></span
          >
          @if (residualLikelihood() && residualSeverity()) {
            <span
              >Residual
              <strong [class]="riskClass(residualScore())"
                >{{ residualScore() }} {{ riskBand(residualScore()) }}</strong
              ></span
            >
          }
        </div>
      }
      <div class="matrix" aria-label="Risk matrix: severity by likelihood">
        <span class="axis-y">Severity</span>
        @for (severity of severities; track severity) {
          @for (likelihood of likelihoods; track likelihood) {
            <span
              [class]="riskClass(score(likelihood, severity))"
              [title]="
                'Likelihood ' +
                likelihood +
                ', severity ' +
                severity +
                ': ' +
                riskBand(score(likelihood, severity))
              "
            >
              {{ score(likelihood, severity) }}
            </span>
          }
        }
      </div>
      <span class="axis-x">Likelihood</span>
      <div class="legend">
        <span class="low">1-4 Low</span><span class="medium">5-9 Medium</span
        ><span class="high">10-15 High</span><span class="very-high">16-25 Very high</span>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .matrix-wrap {
      display: grid;
      justify-items: center;
      gap: 0.45rem;
      padding: 0.65rem;
      overflow-x: auto;
    }
    .matrix {
      position: relative;
      display: grid;
      grid-template-columns: repeat(5, minmax(2rem, 2.7rem));
      gap: 3px;
      margin-left: 1.8rem;
    }
    .matrix > span:not(.axis-y) {
      aspect-ratio: 1;
      display: grid;
      place-items: center;
      border-radius: 0.2rem;
      font-size: 0.62rem;
      font-weight: 800;
    }
    .axis-y {
      position: absolute;
      left: -3.1rem;
      top: 50%;
      transform: rotate(-90deg) translateY(-50%);
      color: #64748b;
      font-size: 0.6rem;
    }
    .axis-x {
      color: #64748b;
      font-size: 0.6rem;
    }
    .score-summary,
    .legend {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.4rem;
      font-size: 0.65rem;
    }
    .score-summary span {
      display: grid;
      gap: 0.2rem;
      text-align: center;
    }
    .score-summary strong,
    .legend span {
      padding: 0.25rem 0.45rem;
      border-radius: 0.3rem;
    }
    .low {
      color: #17643e;
      background: #dff5e6;
    }
    .medium {
      color: #715100;
      background: #fff1b7;
    }
    .high {
      color: #8a4600;
      background: #ffe0ad;
    }
    .very-high {
      color: #951b24;
      background: #ffd8dc;
    }
    .compact .matrix {
      grid-template-columns: repeat(5, 1.6rem);
    }
    .compact .matrix > span:not(.axis-y) {
      font-size: 0.5rem;
    }
    @media (max-width: 28rem) {
      .matrix {
        grid-template-columns: repeat(5, 2rem);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RiskMatrixComponent {
  readonly initialLikelihood = input<number>(0);
  readonly initialSeverity = input<number>(0);
  readonly residualLikelihood = input<number>(0);
  readonly residualSeverity = input<number>(0);
  readonly compact = input(false);
  protected readonly likelihoods = [1, 2, 3, 4, 5];
  protected readonly severities = [5, 4, 3, 2, 1];
  protected readonly score = ramsRiskScore;
  protected readonly riskBand = ramsRiskBand;
  protected readonly riskClass = ramsRiskClass;
  protected initialScore(): number {
    return this.score(this.initialLikelihood(), this.initialSeverity());
  }
  protected residualScore(): number {
    return this.score(this.residualLikelihood(), this.residualSeverity());
  }
}
