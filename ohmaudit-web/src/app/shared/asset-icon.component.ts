import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import type { AssetIconKey } from '../core/api.service';
import { assetIconOption } from './asset-icons';

@Component({
  selector: 'oa-asset-icon',
  imports: [HugeiconsIconComponent],
  template: `
    <hugeicons-icon
      [icon]="icon()"
      [size]="size()"
      color="currentColor"
      [strokeWidth]="1.7"
      aria-hidden="true"
    />
  `,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      line-height: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetIconComponent {
  readonly iconKey = input.required<AssetIconKey>();
  readonly size = input<number | string>(22);
  protected readonly icon = computed(() => assetIconOption(this.iconKey()).icon);
}
