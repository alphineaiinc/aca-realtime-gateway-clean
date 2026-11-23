# Knowledge upload security release gate

Status: draft only; requires coordinated PR #125 rate-limit schema.

## Controls in draft
- JWT authentication establishes a tenant identity before any quota key is selected.
- Shared PostgreSQL per-tenant quota (`knowledge-upload`, five requests per 60 seconds) runs before local upload reservation and multipart parsing.
- Multer uses in-memory storage with a 10 MiB file limit, one file, no form fields and at most two multipart parts.
- PDF signature and extracted text size are bounded before embedding or database writes.
- Parser cleanup is guaranteed; parser and upload errors return generic responses.
- Existing active-upload count (four) and one-active-upload-per-tenant reservation remain **per Node process only**, not a distributed semaphore. They must not be represented as a global cap.

## Dependencies and required validation
1. Apply `migrations/draft_aca_rate_limit_buckets.sql` from coordinated PR #125 only in isolated CI/staging after separate authorization. This upload PR cannot be enabled in a deployment before the migration and shared limiter are present.
2. Verify exact-head CI, including actual PostgreSQL quota integration, fail-closed 503 on limiter-store outage, per-tenant isolation, and no multipart parsing before quota acceptance.
3. Validate Render instance count, memory limits, reverse-proxy/body-size limits and aggregate concurrent upload capacity. If a global concurrent cap is required, implement a leased PostgreSQL semaphore with expiry/recovery and safe release; do not assume the in-process reservation provides it.
4. Confirm PDF parser CPU/memory behavior against adversarial compressed PDFs and cancellation of embedding work after client disconnect.
5. Complete fresh CodeQL alert reconciliation and independent security review.

No merge, migration on staging/production, deployment, or alert dismissal is authorized by this draft.

## Disconnect behavior
The draft stops further chunk processing and database writes after a closed response is observed, including after an in-flight embedding returns. It does not cancel an already-dispatched provider call or database statement, and previously written chunks are not rolled back. Local capacity is retained until the processing handler exits. A distributed concurrent admission control remains a separate required gate.

## Distributed admission candidate
An unmounted transaction-scoped PostgreSQL advisory-lock primitive and five mock unit tests are included. It is not a live concurrency cap. Before wiring, prove dedicated transaction ownership, rollback on every exit, connection loss behavior, no reentrant acquisition, transaction pool compatibility, bounded connection usage and real concurrent PostgreSQL tests. Hash collisions conservatively deny admission. Do not hold an unbounded transaction across provider calls; evaluate capacity isolation and cancellation before activation.
