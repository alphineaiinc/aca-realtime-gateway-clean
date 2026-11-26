# ACA-029: verified call routing and explicit workflows

## Trust boundary and root cause

Previously the voice webhook was unsigned, passed no called number, and the stream
accepted arbitrary tenant IDs (defaulting to 1). The resolver queried nonexistent
`tenants` tables and converted errors into successful tenant 1 / medical routing.
The controller re-resolved those untrusted identifiers each turn. There was no
reliable tenant-to-workflow contract.

Now only POST `/twilio/voice` creates grants. It validates the Twilio signature
against a configured public HTTPS URL and expected AccountSid, then resolves the
signed `To` through a unique E.164 mapping to `master_tenants.id`. Routing failures
are generic on HTTP; the resolver returns structured internal reason codes without
exception text, identifiers, or credentials. GET `/twilio/voice` no longer starts calls.

The new routing metadata tables are the only database reads during authorization.
Phone and workflow assignments must each have exactly one active match, and the
workflow definition must be complete and active before voice configuration, STT,
TTS, or the session controller is invoked. Unknown/missing/inactive/ambiguous
mappings, malformed schemas and database failures are denied. No tenant or
industry assignment is inferred. No customer assignments or workflows are seeded.

## Stream transport and replay protection

Twilio's Stream URL supports WSS but not query parameters. Nested `<Parameter>`
values arrive in `start.customParameters`. See:
- https://www.twilio.com/docs/voice/twiml/stream#custom-parameters
- https://www.twilio.com/docs/voice/media-streams/websocket-messages#start-message
- https://www.twilio.com/docs/usage/security#validating-requests

The signed webhook returns a cryptographically random 256-bit opaque token in
`routingToken`. `calledNumber` is included for interoperability but is ignored by
the consumer. The database stores a SHA-256 token hash for admission and an
AES-256-GCM encrypted copy for webhook retry recovery. The encryption key is
HKDF-derived from `TWILIO_AUTH_TOKEN` with a separate application purpose string;
no plaintext token is persisted. Never log the ciphertext or response body.
Database time limits admission to 60 seconds. An atomic conditional UPDATE consumes
the token once across all workers, matching CallSid and AccountSid.

A signed webhook retry for the same CallSid/account/tenant/number returns the
**same pending token and TwiML** via an atomic INSERT/ON CONFLICT operation. Retries
do not rotate the token or extend its expiry. Multiple returned copies still share
one single-use database claim, so parallel streams cannot both enter voice services.
Once the grant is consumed or expired, or a signed request conflicts with the
original assignment, the webhook returns HTTP 200 with an empty `<Response/>`
(no Stream). This acknowledges terminal replay without another admission or a 503
retry loop. A replayed TwiML token is also rejected by stream admission. Actual DB
failures or damaged/unrecoverable ciphertext remain 503, with no replacement grant.

Twilio request signatures have no timestamp freshness guarantee. CallSid tombstones
therefore remain required. A terminal replay response does not reconnect or resume
an existing stream; an empty TwiML response can end a call if Twilio applies it as
new instructions. Verify Twilio's real retry/call behavior in staging, including a
lost initial response and retries after stream admission. Do not promise seamless
reconnection after a consumed grant. Rotating `TWILIO_AUTH_TOKEN` makes outstanding
encrypted grants unrecoverable for webhook retries; coordinate rotation and drain
or wait out the 60-second admission window.

Wrong account/call/token, expired grants, malformed stream IDs, and replay are
rejected without starting voice providers. A socket has ten seconds to finish
routing and voice initialization and cannot process concurrent start messages.
Only bounded media frames can queue during initialization (128 messages / 64 KiB);
they are delivered to STT only after validation and initialization succeed. Buffer
overflow, stop, error, timeout, or disconnect cancels startup and cleans the session.

The bearer token authenticates stream admission; there is no new dependency on
custom WebSocket headers or query-string support. The upgrade itself is not
signature-validated. Do not log TwiML bodies, custom parameters, or tokens at a
proxy/APM layer; possession of the token plus its matching call/account metadata
is a capability until consumption/expiry. Use TLS end to end at the public edge.
Status callbacks now require signed form POST requests and are never used as routing authority. See the Phase B contract below.

At consumption, phone/workflow authorization is checked again. Reassignment to
another tenant or deactivation before admission is denied. The resulting deeply
frozen context is bound immutably to the call session. The controller loads the
schema from that context instead of looking up identifiers again. Language, region,
voice-profile queries, and TTS all use the same canonical tenant. Changing an
assignment during an admitted call does not change that call's snapshot; end an
active call separately if emergency revocation is required.

## Required configuration (names only)

New routing requirements:
- `TWILIO_AUTH_TOKEN`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_VOICE_WEBHOOK_URL`
- `TWILIO_STREAM_URL`

Existing application requirements, including `DATABASE_URL`, `OPENAI_API_KEY`,
`JWT_SECRET`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`, remain unchanged.
No new credentials belong in source control. Missing/invalid routing configuration
returns 503. Set the webhook URL to the exact externally signed HTTPS URL with
path `/twilio/voice`, no query or fragment. Set the stream URL to the public WSS
URL with path `/ws/twilio-stream`, no query or fragment. Proxy headers and client
Host values are not used to reconstruct the signed URL. The configured Twilio
account must own the incoming voice numbers. Subaccounts require their own
matching AccountSid/auth-token configuration; this version supports one account
per deployment, not an account credential-selection registry.

## Database contract and workflow schema

`migrations/007_secure_voice_routing.sql` adds four tables:
- `tenant_phone_numbers`: normalized E.164 primary key; required FK to
  `master_tenants(id)`; inactive by default. Numbers must already be normalized;
  the application never guesses a country code or strips formatting.
- `voice_workflow_definitions`: reusable `(workflow_id, version)` primary key,
  complete JSON schema, inactive by default. Treat activated versions as immutable;
  author a new version for a changed definition.
- `tenant_workflow_configs`: one row per canonical tenant; required composite FK
  to an explicit workflow version; inactive by default. Tenant language and region
  remain separate in `master_tenants`, not in shared workflow definitions.
- `voice_stream_grants`: hashed single-use admission tokens, encrypted retry recovery, unique CallSid,
  AccountSid, tenant FK, called number, expiry and consumed timestamp.

Assumptions: `public.master_tenants.id` is an integer primary key;
`preferred_lang` and `region` exist. No duplicate `tenants` table is introduced.
No changes are made to `kb_entries` or its nullable tenant FK. Existing KB paths
continue receiving canonical tenant identity; the active voice controller does
not introduce any new knowledge-base query.

The workflow engine consumes `cluster_id` as a compatibility field for the
explicit workflow identifier. A valid definition requires:
- `cluster_id`: lowercase identifier matching `workflow_id`.
- `version`: positive integer matching the definition row version.
- `slot_definitions`: nonempty object of named slots, each with a supported type
  (`string`, `integer`, `number`, `date`, `time`, `phone`).
- `intents`: nonempty list of unique named intents with explicit `required_slots`,
  `optional_slots`, and nonempty `confirmation_slots`; all slots must be defined.
- `intake_profile`: explicit nonempty fallback `required` list, `optional` list,
  and `slotQuestions` with a nonempty question for every defined slot.

Descriptions, voice rules and workflow rules can accompany those engine fields;
this patch does not introduce an action executor. Definitions are intake/extraction
workflows supported by the existing engine, not executable booking integrations.
The runtime validates complete definitions before admission. Slot enforcement uses
the configured intent's requirements and questions, rather than selecting an
industry profile by label. `generic` is only a legacy extraction-heuristic mode;
it never selects a workflow or supplies required slots. Heuristic slot updates are
limited to explicitly configured slots. The existing confirmation acceptance/block
behavior and booking persistence are deliberately not fixed in this story.
`config/clusterIntakeSchemas.js` alone is not a compatible full definition and is
never silently loaded. Synthetic examples exist only in tests, not in migrations.

`tenant_voice_profile` is queried by `(tenant_id, lang_code)`, its reported unique
key. `master_tenants.preferred_lang` selects the language (en-US if absent). Returned
objects expose `language_code` as an alias of `lang_code`, so mismatched legacy
columns cannot override the keyed language. Operators must review legacy rows
with null/wrong `lang_code` separately; this migration does not rewrite profiles.

## Proposed rollout — human execution only

1. Back up configuration and review the new DDL with a database owner. Do not run
   all historical migrations blindly: the old migration history is incomplete.
2. In an isolated staging database with synthetic tenants, apply only
   `migrations/007_secure_voice_routing.sql`, then
   `migrations/008_voice_webhook_retries.sql`. If 007 is already present, apply only
   008. It adds nullable `token_ciphertext` for encrypted retry recovery. Drain
   existing calls/grants before switching versions: pre-008 pending grants have
   no recoverable ciphertext and must not be reissued. These are transactional and intentionally
   does not use IF NOT EXISTS: incompatible preexisting tables must stop rollout.
3. An authorized operator inventories existing Twilio voice numbers and verifies
   ownership/tenant identity out of band. Insert canonical E.164 mappings inactive;
   never infer assignments from names, number patterns or tenant ID sequences.
4. Author/review complete reusable workflow definitions with business owners.
   Validate each JSON locally with `validateWorkflowSchema` exported from
   `src/voice/clusterSchemaLoader.js`; insert definition versions inactive. Assign
   each tenant to an explicit version in `tenant_workflow_configs`, inactive.
5. Review all assignments and voice-profile language keys. Activate approved
   definitions, tenant workflow assignments, and phone mappings in one reviewed
   transaction. No activation is automatic. Existing tenants remain denied until
   all three active records and a valid definition exist.
6. Verify required environment names and exact public URL/signing behavior in
   staging. Install dependencies using `npm ci --ignore-scripts`, run `npm test`,
   then perform a controlled staging Twilio call. Check replay rejection, audio,
   language, and multi-worker token consumption without logging token material.
7. Before any separately approved production deployment, apply the additive
   migration and populate/review existing numbers and assignments as above while
   the old app is still running. The strict app must not be activated first: it
   intentionally rejects missing tables/configurations. Schedule the transition
   and drain existing calls. Deploy only through the usual human approval process.

No Neon migration, Twilio settings change, Render deployment, or merge was
performed for this PR. Status/SMS handling is outside this routing change.

Grant rows include phone/call metadata. Plan retention with the security owner:
this patch performs no deletion. Deleting expired grants also deletes the CallSid
webhook-replay tombstone, so arbitrary TTL cleanup is not safe. A future bounded
retention design must preserve call replay prevention or define a signed-webhook
freshness policy. Until then, monitor table growth and restrict DB privileges.
The runtime needs SELECT on configuration and SELECT/INSERT/UPDATE on grants; only
operators should be able to author/activate mappings and definitions.

## Rollback

First stop new voice ingress and drain or terminate active sessions. Prefer leaving
additive tables in place while reverting to a reviewed safe application release.
**Do not restore the old tenant-1 fallback to regain availability.** If the new
contract cannot run, keep voice ingress disabled while correcting configuration.

If removing this contract is necessary, export the four new tables securely first,
then run `migrations/rollback/008_voice_webhook_retries.sql` followed by
`migrations/rollback/007_secure_voice_routing.sql` with the application stopped.
For a hardening-only rollback, remove 008 only after draining grants and restoring
a reviewed compatible application; the earlier 503 retry behavior will return.
Rollback 008 removes only the retry ciphertext column. Rollback 007 drops the four
routing tables in dependency order, without CASCADE; `master_tenants`, KB rows
and voice profiles remain. Restore configuration from
that export only after review before re-enabling this routing implementation.

## Validation and limits

`npm test` runs mocked routing/provider tests, actual Express signature requests,
actual WebSocket handler/controller tests in an isolated module harness, existing
ACA-062 diagnostics regressions, and an embedded PostgreSQL (PGlite) migration
up/down test. Synthetic tenants only; no production environment/DB is loaded.
PGlite verifies DDL, E.164/unique/FK constraints, real resolver SQL and atomic grant
claims. It does not replace a staging test against the target PostgreSQL version
or a real Twilio audio test. Raw audio/STT/TTS framing is unchanged.

Known existing confirmation and booking defects remain separate work. Operational grant retention and fleet-wide ingress rate limits need follow-up.
The application enforces process-local caps of 256 admitted/initializing connections
and 32 pending initializations. Pending counts release on admission; total capacity
releases exactly once on socket close/forced termination. Rejected sockets close
with 1013. These do not replace proxy/edge limits across replicas or raw HTTP upgrade
flood protection.

Twilio messages are limited to 16 KiB before JSON parsing; binary, malformed,
unexpected, duplicate-start, mismatched-stream and invalid-base64 events close the
connection without further tenant/provider access. Valid authenticated DTMF events
are safely ignored because the existing workflow has no keypad action; pressing a
key must not terminate an otherwise valid call. Root express-ws transport also
limits complete inbound messages to 1 MiB and disables compression. That transport
ceiling is shared with web chat; verify representative chat payloads in staging.
Unauthenticated traffic cannot extend the ten-second startup deadline. Admitted
streams time out after 30 seconds without valid events; normal Twilio media refreshes
this timer. Peers ignoring close are forcibly terminated after one second.
Provider teardown and session removal are idempotent, and late STT/TTS callbacks
cannot send audio or dispatch work after cleanup. There is no booking confirmation
or persistence change in this hardening pass.


## Phase B: content-free diagnostics, callbacks, infrastructure failures and speech lifecycle

No additional database migration is needed. Phone/workflow mappings, immutable
session identity and atomic grant consumption are unchanged.

### Diagnostic privacy boundary

`src/voice/voiceLogger.js` allowlists bounded numeric metrics, booleans, finite
state/status enums, fixed event codes, and a small set of nested error codes.
All other values are discarded, including call/stream/account/tenant identifiers,
phone numbers, routing contexts, transcripts, replies, slots, token material,
API-key fragments, raw SDK errors/stacks and provider response bodies. Unknown
nested objects, arrays, JSON strings and accessor properties are never serialized.
The Twilio debug buffer applies the same boundary when collecting an event, rather
than depending on admin authentication to make sensitive content safe.

The affected root entry point, Twilio/controller/session/state modules, database
startup diagnostics, STT/TTS modules and retrieval errors use the module-local
operational console boundary. It does not replace the process-wide console or
change provider inputs/outputs. Retrieval retry telemetry uses a fixed failure
code instead of a raw error message. Numeric counts and state/status events remain
available, but per-call log correlation and full-text debugging are intentionally
removed. There is no flag to enable unsafe raw logging. Review proxy/APM/provider
logging separately; this application change cannot sanitize external systems.

### Status callback signing contract

Both `/twilio/status` and `/twilio/stream-status` now support **POST only** with
`application/x-www-form-urlencoded` (charset parameters allowed). GET and other
methods return 405 with `Allow: POST`; no GET signing contract is established in
the repository, so even signed GETs are rejected. JSON and other content types
return 415. Route-local parsing uses a 16 KiB body limit, 64 parameters and no
nested form objects; oversized requests return 413 and malformed forms return 400.

Signatures use the existing `TWILIO_AUTH_TOKEN` and `TWILIO_ACCOUNT_SID`. Canonical
URLs default to the fixed endpoint path on the configured
`TWILIO_VOICE_WEBHOOK_URL` origin. Optional names for explicitly configured public
callback URLs are `TWILIO_STATUS_WEBHOOK_URL` and
`TWILIO_STREAM_STATUS_WEBHOOK_URL`. Overrides must be HTTPS, have the exact endpoint
path and no credentials, query or fragment. The stream-status override is also used
in generated TwiML. Invalid server configuration fails closed with 503. Request
Host and forwarded headers are never used to select a signature-validation URL.

Check the actual staging Twilio configuration against these URL/method contracts
before activation; no live settings were inspected or changed. Deployments using
GET callbacks must explicitly move to reviewed POST configuration or separately
approve/implement a complete GET contract. No insecure GET compatibility fallback
exists. Callback signatures, account and CallSid shape are verified before any
callback-derived operational event. Invalid callbacks produce no callback-data log
record. Valid callbacks record only allowlisted status/event enums, not arbitrary
StreamError/StreamName fields or identifiers. Authentication does not require DB,
workflow, KB or voice-provider access.

### Infrastructure response contract

`ROUTING_UNAVAILABLE` and unexpected resolver exceptions now yield HTTP 503 with
`Retry-After: 5`, never a Stream. Grant-store errors retain 503 and the same retry
hint. Invalid signatures/account bindings and malformed identity requests remain
denials; unknown/inactive/unconfigured/invalid workflow mappings remain 403.
Database failures cannot become another tenant or create a grant. Recovery uses
the existing unextended token lifetime and atomic retry/claim contract. A retry
hint is not a promise that Twilio will retry: validate the configured Twilio retry
policy in staging. Persistent schema/permission misconfiguration still requires
operator intervention, not unlimited retries. WebSocket database failure continues
to deny admission; HTTP status codes do not apply to an admitted upgrade.

### Speech lifecycle

Greeting preparation now moves `GREETING -> READY_TO_SPEAK`; successful audio start
moves `READY_TO_SPEAK -> SPEAKING`, and a matching playback mark moves
`SPEAKING -> AWAITING_INPUT`. Prepared local repair responses may move from
LISTENING/AWAITING_INPUT/AWAITING_END_OF_TURN to READY_TO_SPEAK before synthesis.
Direct LISTENING -> SPEAKING remains invalid. Speaking flags and outbound audio
require a successful transition. Synthesis failure before playback recovers from
READY_TO_SPEAK to LISTENING. Barge-in uses the existing SPEAKING -> LISTENING path;
repeated marks and late results do not mutate a cleaned-up/incorrect-state session.

These changes do not change booking confirmation dispatch/acceptance or persistence,
provider selection, audio framing, workflow assignments or token replay semantics.
Existing real Twilio audio/retry, target PostgreSQL, ingress-rate-limit, grant
retention and external logging checks remain necessary before production approval.


## Corrective local review: speech ownership and provider errors

Every real TTS operation now claims an opaque, per-session speech owner. New caller
input, interruption and cleanup invalidate the old owner before asynchronous
completion can send audio or alter state. A cancelled greeting cannot win a race
against a newer caller response, and its late failure cannot reset the caller's
playback state. State transitions must succeed before caller processing begins;
direct LISTENING -> SPEAKING is still prohibited.

Pending input has its own version. A completed response acknowledges only the
version it processed, and only after both media and mark have been accepted by
`ws.send` callbacks. Newer input is retained and dispatched after the in-flight
turn exits. Failed/cancelled delivery retains input and does not mark it committed.
There is no unbounded automatic TTS retry of the same failed turn. Accepted-for-
delivery means accepted by the local WebSocket transport, not proof that a caller
heard the audio. Partial-send failure and active interruption clear Twilio's queued
audio; distinct playback marks prevent an old completion from ending new speech.

TTS errors crossing the public synthesis boundary contain only the fixed
`TTS_PROVIDER_ERROR` code, a sanitized message, an allowlisted provider name and an
optional bounded HTTP status. They do not include original causes, provider bodies,
request objects, credentials, transcripts, or original error stacks. The actual
voice-preview route also uses the existing strict operational logging boundary.
Regression tests exercise its real Express/JWT path with synthetic provider-body
canaries, rather than inspecting only direct TTS log calls.

The tenant/workflow/token-grant contract and migration files are unchanged.
Real Twilio scheduling, audio interruption and delivery semantics still need
controlled staging validation; local queue acceptance is not a playback receipt.
