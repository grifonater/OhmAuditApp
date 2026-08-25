# Module system

Core provides shared tenants, users, Customers, Sites, Assets, Visits, media, documents, schedules, search, audit, notifications, and integrations. Specialist modules extend these foundations without importing one another’s business logic.

Module access is per Organisation and capability. `EntitlementService.can(organisationId, capability)` is the single policy boundary. Templates, validation rules, and guidance are versioned. Important workflows may use purpose-built UI rather than becoming a generic form builder.
