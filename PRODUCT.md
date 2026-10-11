# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Emergency-operations administrators coordinate reports and response across Kenya and East Africa. Survivors and community members submit hazard reports and track their own cases. The admin dashboard is the priority operational surface; the survivor portal remains separate.

## Product Purpose

u-SHA-jua combines community-submitted hazard reports, dispatcher verification, and geospatial response coordination. Success means that responders can find, assess, and act on urgent reports while survivors can communicate incident information and see its status.

## Positioning

Community reports stay explicitly unverified until a dispatcher confirms them, while public hazard warnings are presented as separate source-attributed information. The OpenStreetMap incident map remains usable without optional map-provider credentials.

## Operating Context

Administrators triage incoming reports, inspect evidence and map locations, confirm or reject reports, and dispatch responders. Users may be working under constrained-bandwidth conditions. Survivors submit reports and follow only reports associated with their account.

## Capabilities and Constraints

- The web client is React, TypeScript, Vite, and React Leaflet; the API is FastAPI.
- Administrators have a distinct, provisioned role. Survivor registration cannot create an administrator.
- OpenStreetMap is the no-key base map. OpenWeather overlays, Mapbox satellite context, Google Maps reverse geocoding, Gemini-assisted extraction/evidence notes, and Africa's Talking SMS are optional integrations.
- External hazard feeds are informative and must remain distinct from dispatcher-verified community incidents.
- Product-specific response guides appear only after dispatcher confirmation and do not replace local emergency services.
- **Inferred for this implementation:** External live-alert records supplement, but never automatically create or verify, incident reports.

## Evidence on Hand

- `README.md` documents the platform workflows, integrations, deployment, and API.
- Existing auth, report, evidence-review, map, dispatch, SMS, and response-guide implementations are in `client/src` and `server/`.
- No real-world operational outcomes, customer endorsements, or service guarantees are established; do not imply them.

## Product Principles

- Keep survivor reporting and administrator operations separate.
- Make report verification state unmistakable.
- Preserve a usable map when optional providers are unavailable.
- Attribute external alerts to their source and show their age.
- Prefer clear, actionable information over dashboard density.

## Accessibility & Inclusion

The product is web-based and supports constrained bandwidth. Preserve keyboard focus, readable contrast, responsive layouts, and non-color status cues.
