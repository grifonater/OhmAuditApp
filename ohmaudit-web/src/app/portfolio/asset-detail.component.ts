import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ApiService,
  type AssetDetail,
  type AssetDocument,
  type AssetMedia,
} from '../core/api.service';
import { AssetIconComponent } from '../shared/asset-icon.component';
import { resolvedAssetIconKey } from '../shared/asset-icons';
import { DeferredLoadDirective } from '../shared/deferred-load.directive';
import { ImageViewerComponent } from '../shared/image-viewer.component';

interface GalleryImage {
  media: AssetMedia;
  context: string;
}

@Component({
  selector: 'oa-asset-detail',
  imports: [AssetIconComponent, DeferredLoadDirective, ImageViewerComponent, RouterLink],
  templateUrl: './asset-detail.component.html',
  styleUrl: './asset-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetDetailComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pendingImages = new Set<string>();
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly assetId = this.route.snapshot.paramMap.get('assetId') ?? '';
  protected readonly asset = signal<AssetDetail | undefined>(undefined);
  protected readonly loading = signal(true);
  protected readonly busyDocumentId = signal<string | undefined>(undefined);
  protected readonly error = signal('');
  protected readonly imageUrls = signal<Record<string, string>>({});
  protected readonly selectedImage = signal<GalleryImage | undefined>(undefined);
  protected readonly resolvedAssetIconKey = resolvedAssetIconKey;
  protected readonly isEvAsset = computed(() =>
    this.asset()?.assetType.toLowerCase().includes('ev'),
  );
  protected readonly isEmergencyLightingAsset = computed(() =>
    this.asset()?.assetType.toLowerCase().includes('emergency'),
  );
  protected readonly gallery = computed<GalleryImage[]>(() => {
    const asset = this.asset();
    if (!asset) return [];
    const images = new Map<string, GalleryImage>();
    for (const media of asset.media) {
      if (media.mimeType.startsWith('image/'))
        images.set(media.id, { media, context: 'Asset image' });
    }
    for (const inspection of asset.inspections) {
      for (const revision of inspection.revisions) {
        for (const item of revision.media) {
          if (!item.media.mimeType.startsWith('image/') || images.has(item.media.id)) continue;
          images.set(item.media.id, {
            media: {
              ...item.media,
              ...(item.caption
                ? { caption: item.caption }
                : item.media.caption
                  ? { caption: item.media.caption }
                  : {}),
            },
            context: `${inspection.inspectionType} - revision ${revision.revisionNumber}`,
          });
        }
      }
    }
    return [...images.values()];
  });
  protected readonly modelMetadata = computed(() =>
    Object.entries(this.asset()?.assetModel?.metadata ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      Object.values(this.imageUrls()).forEach((url) => URL.revokeObjectURL(url));
    });
    void this.load();
  }

  protected async loadImage(mediaId: string): Promise<void> {
    if (this.imageUrls()[mediaId] || this.pendingImages.has(mediaId)) return;
    this.pendingImages.add(mediaId);
    try {
      const blob = await this.api.downloadMedia(this.organisationId, mediaId);
      if (this.destroyRef.destroyed || !this.gallery().some(({ media }) => media.id === mediaId))
        return;
      this.imageUrls.update((urls) => ({ ...urls, [mediaId]: URL.createObjectURL(blob) }));
    } catch {
      // Keep the image placeholder when evidence is no longer available.
    } finally {
      this.pendingImages.delete(mediaId);
    }
  }

  protected async openDocument(document: AssetDocument, download: boolean): Promise<void> {
    if (!document.mediaId && !document.inspectionRevisionId) return;
    this.busyDocumentId.set(document.id);
    this.error.set('');
    try {
      const blob = document.mediaId
        ? await this.api.downloadMedia(this.organisationId, document.mediaId)
        : await this.api.downloadDocumentPdf(this.organisationId, document.id);
      const url = URL.createObjectURL(blob);
      if (download) {
        const anchor = window.document.createElement('a');
        anchor.href = url;
        anchor.download = this.documentFilename(document, blob.type);
        anchor.click();
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The document could not be opened.');
    } finally {
      this.busyDocumentId.set(undefined);
    }
  }

  protected formatDate(value: string | null | undefined, includeTime = false): string {
    if (!value) return 'Not recorded';
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(new Date(value));
  }

  protected displayValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return 'Not recorded';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
      return value.toString();
    if (typeof value === 'object') return JSON.stringify(value) ?? 'Not recorded';
    return 'Not recorded';
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.api.getAsset(this.organisationId, this.assetId);
      this.asset.set(result.asset);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The asset could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }

  private documentFilename(document: AssetDocument, mimeType: string): string {
    const base = document.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-|-$/gu, '');
    const extension = mimeType.includes('pdf') ? 'pdf' : document.mediaId ? 'file' : 'pdf';
    return `${base || 'asset-document'}.${extension}`;
  }
}
