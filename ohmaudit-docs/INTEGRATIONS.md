# Integrations

External systems are adapters behind interfaces such as EVBackendProvider, BillingProvider, EmailProvider, SmsProvider, AIProvider, MapProvider, and InspectionDataImporter.

Webhook adapters verify provider signatures, persist external event IDs for idempotency, limit/reject replays where applicable, retain raw payloads securely when justified, and transform accepted data into versioned internal events. Provider secrets never reach Angular.
