# Documents

Structured immutable Inspection Revisions are the source of truth. Versioned HTML/CSS templates, organisation branding snapshots, and customer/site snapshots render synchronously through the PDF Worker and Cloudflare Browser Rendering.

Issued documents record the template version. Reprinting with the original template differs from rendering old data with the current template. Cached PDFs may be added later but never become the sole historical source. R2 objects remain private unless explicitly classified for public delivery.

Milestone 6 stores immutable revision data, validation output, organisation/customer/site/asset snapshots, signatures, defects, template key and template version. Approval and certificate issuance are separate audited actions. The API synchronously calls the PDF Worker, which currently emits a compact valid PDF and can later adopt Cloudflare Browser Rendering without changing persisted document semantics.
