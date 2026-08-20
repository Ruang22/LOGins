# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vue 3 + JavaScript client; Node.js + Express REST API; PostgreSQL relational database. The specific model provider is intentionally undecided until the owner creates an API account and key.

## Users

- Primary: a private tutoring-class teacher arranging English lessons for students from grade 7 through grade 12.
- Secondary: parents checking only their own child's schedule, lesson balance, attendance history, and orders.

## Product Purpose

Help a teacher turn natural-language scheduling requests into reviewable English lesson reservations while enforcing time, grade, and lesson-credit rules. Let parents see their child's information and purchase lesson packages in a truthful simulated-payment flow.

## Positioning

An AI-assisted tutoring scheduler that combines natural-language course creation with per-student lesson-credit accounting and same-grade group lessons.

## Operating Context

The teacher schedules one-hour English lessons to the minute for individual students or students in the same grade. A reservation consumes one credit for every participating student; completing the lesson moves that credit from reserved to attended, and cancellation releases it.

## Capabilities and Constraints

- AI parses a teacher's natural-language request into structured course data; the teacher must confirm before any reservation is saved.
- A group lesson may include multiple students only when they are in the same grade.
- A teacher cannot be double-booked. A student needs a positive available balance: total credits minus attended credits minus reserved credits.
- The first release uses a PostgreSQL database and synthetic demonstration data. The server, not the browser, is the source of truth for scheduling, lesson credits, and order states.
- The parent portal uses demonstration accounts and filters data by account. It is not production authentication, but filtering must be enforced by the server.
- Payment is simulated: an order becomes paid only through the demonstration flow. A later QR-code flow requires teacher confirmation and must not be represented as automatic payment reconciliation.
- Real model API credentials are server-side environment variables only and are not committed.
- The client, server, and database schema/migrations are developed as separate layers with defined API contracts.

## Evidence on Hand

No real student, parent, payment, or tutoring data is available. All names, schedules, balances, packages, and order records in the product must be clearly synthetic demonstration data.

## Product Principles

- Teacher confirmation is required before an AI suggestion changes a schedule or credit balance.
- Course-credit accounting must be explicit, reversible, and auditable.
- Surface conflicts and invalid AI output before state changes.
- Keep parent information scoped to the signed-in demonstration account.
- Demonstrate real workflow value without making false claims about payment or AI automation.
