export interface AssetRegisterRenderPayload {
  templateVersion: 'asset-register-a4-v1';
  generatedAt: string;
  customerName: string;
  siteName: string;
  siteReference?: string;
  filterDescription: string;
  assets: Array<{
    assetReference: string;
    displayName: string;
    assetType: string;
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    status: string;
  }>;
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const text = (value: string | undefined): string => escapeHtml(value?.trim() || '-');

export function renderAssetRegisterHtml(payload: AssetRegisterRenderPayload): string {
  const rows = payload.assets
    .map(
      (asset) => `<tr>
        <td><strong>${text(asset.assetReference)}</strong></td>
        <td>${text(asset.displayName)}</td>
        <td>${text(asset.assetType)}</td>
        <td>${text([asset.manufacturer, asset.model].filter(Boolean).join(' '))}</td>
        <td>${text(asset.serialNumber)}</td>
        <td><span class="status">${text(asset.status)}</span></td>
      </tr>`,
    )
    .join('');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Asset register</title><style>
    @page{size:A4 landscape;margin:13mm 12mm 16mm}*{box-sizing:border-box}body{margin:0;color:#142b3b;font:9px/1.4 Arial,sans-serif}header{display:flex;justify-content:space-between;gap:12mm;padding-bottom:6mm;border-bottom:2px solid #177c7e}h1{margin:1mm 0 0;font-size:22px}.eyebrow{color:#177c7e;font-size:8px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.meta{text-align:right;color:#53647b}.summary{display:flex;justify-content:space-between;gap:8mm;margin:5mm 0;padding:3mm 4mm;border-radius:2mm;background:#eef7f7}.summary strong{font-size:11px}table{width:100%;border-collapse:collapse;table-layout:fixed}th{padding:2.5mm 2mm;color:#fff;background:#173f56;font-size:7px;letter-spacing:.06em;text-align:left;text-transform:uppercase}td{padding:2.4mm 2mm;border-bottom:1px solid #dce4e8;vertical-align:top;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#f7f9fa}.status{font-size:7px;font-weight:800}.empty{padding:15mm;text-align:center;color:#53647b}
  </style></head><body><header><div><div class="eyebrow">Site asset report</div><h1>${text(payload.siteName)}</h1><div>${text(payload.customerName)}${payload.siteReference ? ` · ${text(payload.siteReference)}` : ''}</div></div><div class="meta">Generated ${text(payload.generatedAt)}<br>${text(payload.filterDescription)}</div></header><section class="summary"><span><strong>${payload.assets.length}</strong> assets included</span><span>${text(payload.filterDescription)}</span></section>${payload.assets.length ? `<table><thead><tr><th>Reference</th><th>Name</th><th>Type</th><th>Make / model</th><th>Serial</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">No assets match the selected criteria.</div>'}</body></html>`;
}
