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
the consumer. Only a SHA-256 token hash is stored. Database time limits admission
to 60 seconds. An atomic conditional UPDATE consumes the token once across all
workers, matching the expected CallSid and AccountSid; a UNIQUE CallSid prevents
repeated webhook delivery from issuing parallel grants. A duplicate webhook fails
closed (503), rather than reusing or exposing a token. Wrong account/call/token,
expired grants, malformed stream IDs, and replay are rejected without starting
voice providers. A socket has ten seconds to submit start and cannot start twice.

The bearer token authenticates stream admission; there is no new dependency on
custom WebSocket headers or query-string support. The upgrade itself is not
signature-validated. Do not log TwiML bodies, custom parameters, or tokens at a
proxy/APM layer; possession of the token plus its matching call/account metadata
is a capability until consumption/expiry. Use TLS end to end at the public edge.
Existing status callback endpoints are unchanged and are not used as routing authority.

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
- `voice_stream_grants`: hashed single-use admission tokens, unique CallSid,
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
   `migrations/007_secure_voice_routing.sql`. This is transactional and intentionally
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
The runtime needs SELECT on configuration and INSERT/UPDATE on grants; only
operators should be able to author/activate mappings and definitions.

## Rollback

First stop new voice ingress and drain or terminate active sessions. Prefer leaving
additive tables in place while reverting to a reviewed safe application release.
**Do not restore the old tenant-1 fallback to regain availability.** If the new
contract cannot run, keep voice ingress disabled while correcting configuration.

If removing this contract is necessary, export the four new tables securely first,
then run `migrations/rollback/007_secure_voice_routing.sql` with the application
stopped. It drops only the four new tables, in dependency order, without CASCADE;
`master_tenants`, KB rows and voice profiles remain. Restore configuration from
that export only after review before re-enabling this routing implementation.

## Validation and limits

`npm test` runs mocked routing/provider tests, actual Express signature requests,
actual WebSocket handler/controller tests in an isolated module harness, existing
ACA-062 diagnostics regressions, and an embedded PostgreSQL (PGlite) migration
up/down test. Synthetic tenants only; no production environment/DB is loaded.
PGlite verifies DDL, E.164/unique/FK constraints, real resolver SQL and atomic grant
claims. It does not replace a staging test against the target PostgreSQL version
or a real Twilio audio test. Raw audio/STT/TTS framing is unchanged.

Known existing confirmation and booking defects remain separate work. Public
WebSocket connection rate limiting and operational retention need follow-up;
unverified connections cannot reach voice/tenant data but still use socket resources.
