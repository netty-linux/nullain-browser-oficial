# OpenBot contracts for Nullain Stage 3

Inspection date: 2026-09-08. Checkout inspected read-only: OpenBot `ba3ab6e4aa97d015264dbdc891654a7f449c6517`.

The running OpenBot exposes authenticated agent routes and governed computer routes. Its computer gateway resolves a bot identifier server-side, applies deployment policy, records audit events, and delegates lifecycle to its configured provider. The Nullain client must therefore never treat a browser-supplied computer identifier as authority.

Confirmed contracts include agent listing/registration, per-agent profile storage, `GET /api/computers/:botId/status`, governed stop/reset, control request/take/release, audit records, and per-agent plugin grants. The Docker-supervisor provider isolates profiles by bot; the shared provider explicitly does not. The active provider must be checked at runtime before enabling a per-bot computer feature.

Stage 3A requirements: persist a server-owned mapping from a Nullain bot to an authorized OpenBot agent; resolve that mapping in server routes; gate it by a feature flag; preserve the legacy Nullain computer; and proxy only confirmed allowlisted routes with ownership checks. Stage 3B remains separate because OpenBot plugin/OAuth grants and Nullain Composio are distinct credential systems.

No credentials, endpoints containing tokens, environment values, or OpenBot configuration values are recorded here.
