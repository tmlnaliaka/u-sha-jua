# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Working assumption from the existing application: emergency coordinators monitor incoming reports and responder availability; field responders update assignment status; civilians can submit distress reports and follow a report.

## Product Purpose

u-SHA-jua brings geolocated incident reports, response status, and available units into one shared view so teams can coordinate emergency response.

## Positioning

The application pairs a live incident queue with a map and responder fleet, with a low-bandwidth mode for constrained connections.

## Operating Context

The interface is centered on Nairobi and Kenya. Dispatch work is map-led; field and civilian workflows also need to remain usable on smaller screens.

## Capabilities and Constraints

The repository contains a React and Leaflet client with a FastAPI service. The client supports incident reporting and status changes, responder dispatch and status updates, shelter and weather layers, analytics, and operational tools. Production data sources, deployment guarantees, and service-level targets are not established by the interface and must not be implied.

## Brand Commitments

The product name is u-SHA-jua. The repository describes a Kenya and East Africa focus. No other visual identity or voice rules are confirmed.

## Evidence on Hand

The working evidence is the application source and API in this repository. No verified customer stories, outcome metrics, or deployment claims are available.

## Product Principles

- Make incident location, urgency, and status easy to scan.
- Keep dispatch actions close to the incident they affect.
- Show the difference between connected, delayed, and unavailable data.
- Preserve practical use on small screens and constrained connections.

## Accessibility & Inclusion

The app includes a low-bandwidth control. No formal accessibility conformance target is documented.
