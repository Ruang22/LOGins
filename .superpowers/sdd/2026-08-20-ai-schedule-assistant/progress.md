# SDD ledger — plan: docs/superpowers/plans/2026-08-20-ai-schedule-assistant.md

## Preflight interface scan

| Tasks | Shared surface | Finding |
|---|---|---|
| 1 → 2 | `server/`, PostgreSQL service | Task 1 supplies independently startable server/database; Task 2 supplies Prisma schema and seed. Compatible. |
| 2 → 3 | Prisma models and credit fields | Task 2 creates the entities and fields Task 3 consumes. Compatible. |
| 3 → 4 → 7 | scheduling service and teacher API | Task 3 owns rules, Task 4 exposes them, Task 7 consumes only API. Compatible. |
| 4 → 5 → 7 | parent identity and order API | Task 4 provides parent scoping; Task 5 adds orders; Task 7 consumes both. Compatible. |
| 3 → 6 → 7 | saved lesson boundary | Task 6 returns only an unsaved AI suggestion; Task 7 confirms through Task 4 API. Compatible. |
| 7 → 8 | runnable client and server | Task 8 adds end-to-end coverage over completed surfaces. Compatible. |

| Task | Internal consistency finding |
|---|---|
| 1 | Ruling: skip `git init` in the task because this standalone project has already been initialized on `feature/ai-schedule-assistant` with the approved specification committed. Cost if wrong: a later worker may assume an empty Git history; the current branch and `b5d8576` are the baseline. |
| 2 | Schema, seed test, migration and seed command agree. |
| 3 | Rule tests and credit transitions agree with the specification. |
| 4 | Role tests match the declared REST routes. |
| 5 | Idempotent order test matches the transaction requirement. |
| 6 | Validation test matches the no-mutation AI boundary. |
| 7 | Component confirmation test matches the teacher-confirmation requirement. |
| 8 | End-to-end scenarios cover all required workflow states. |

Task 1: complete (commits b5d8576..c1bd2a0, review clean)
Task 2: fix round 1/5 (4 addressed, 0 open; commits 76870af..eb7dd56)
Task 2: complete (commits c1bd2a0..eb7dd56, review clean)
Task 3: fix round 1/5 (3 addressed, 1 open; commits ca55e3a..e73d498)
Task 3: fix round 2/5 (1 addressed, 0 open; commits e73d498..03fb296)
Task 3: complete (commits eb7dd56..03fb296, review clean)
Task 4: fix round 1/5 (2 addressed, 0 open; commits 4595c7a..4a16ff3)
Task 4: complete (commits 03fb296..4a16ff3, review clean)
Task 5: fix round 1/5 (1 addressed, 0 open; commits 9213de7..6c357c9)
Task 5: complete (commits 4a16ff3..6c357c9, review clean)
Task 6: fix round 1/5 (1 addressed, 0 open; commits 784006f..456302c)
Task 6: complete (commits 6c357c9..456302c, review clean)
Task 7: fix round 1/5 (2 addressed, 1 open; commits 3b31109..b09d6ad)
Task 7: fix round 2/5 (1 addressed, 0 open; commits b09d6ad..f20df8f)
Task 7: complete (commits 456302c..f20df8f, review clean)
Task 8: fix round 1/5 (3 addressed, 1 open — simulated payment UI asserted total as available; commits 00cd673..c203e94)
Task 8: fix round 2/5 (1 addressed, 0 open; commits c203e94..7425bb0)
Task 8: code review complete (commits f20df8f..7425bb0, review clean; real PostgreSQL/browser execution remains externally blocked until Docker Desktop's WSL engine starts)

Final review fix wave: complete pending browser verification (commit `8bd4a33`; server-authoritative simulated package catalog; persisted `Order.packageId`, `paymentMode`, and `paidAt`; teacher order review is read-only; minute-precision AI validation; serialized server and E2E suites). Ruling: do not add a teacher payment-confirm endpoint in the simulation. Parent confirmation at `POST /api/parent/orders/:id/simulate-payment` is the sole authorized simulated-payment mutation; teachers can only list actual orders. Cost if wrong: a later real/manual-QR workflow needs an explicitly designed, separately authorized confirmation endpoint and its own audit/crediting rules rather than repurposing this simulation flow.

Migration-history correction: ruled that historical paid orders retain
`paidAt = NULL` because neither order timestamps nor predicates can reconstruct
payment provenance. The unreleased demo history now persists derived
`packageId` and default `paymentMode` without backfilling `paidAt`; only new
simulated-payment confirmations write the timestamp. Superseded migrations
`20260820030000` and `20260820040000` were removed and the known local Docker
demo databases were authorized for reset because their data is synthetic and
disposable. Cost: any real database that previously applied the bad history
requires manual review rather than an automated correction.
