# Scheduling

Shared Schedule Rules describe recurrence. A rolling, approximately five-year horizon materialises Schedule Occurrences with future, upcoming, due, overdue, completed, skipped, or superseded state.

The hourly Scheduler Worker queries occurrences entering configured windows and creates idempotent Notification Events. It does not scan every module table. Completion links an Inspection to its occurrence and ensures the next occurrence exists while preserving history.

Milestone 4 materialises five years of occurrences when a rule is created, including safe month-end recurrence. The admin calendar reads occurrences rather than calculating dates in the browser. The Scheduler Worker calls an authenticated internal API tick, advances future/upcoming/due/overdue states, and creates deduplicated notification events. Organisation preferences control in-app/email channels, default lead time, overdue reminders, and submitted-inspection alerts.
