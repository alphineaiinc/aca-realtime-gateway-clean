# Stage 2 disabled narrow integration

## Authorization and cancellation
Owner only: verify effective issue editor and repository variable permissions before any pilot. Approve exact final SHA, start, expiry and issue updated_at epoch milliseconds. Insert unique Stage 2 marker containing SHA:start:expiry on #153 while blocked, no Stage 1 marker. Record server updated_at and set start at least two seconds later.

GitHub updated_at has one-second granularity: edits in the same timestamp second may retain the original version, including pre-start removal and restoration. Do not assume every edit advances it. An edit timestamped during the approved window differs from the original version. On cancellation keep the marker absent, clear enable and approval variables, verify both disabled settings and marker absence, and confirm a strictly advanced server version before any fresh authorization. If the server version has not advanced, remain disabled and perform a separately authorized body-only edit after the timestamp second has elapsed, then verify the server response. Never restore an old marker. Fresh owner approval and new version required; keep Stage 1 marker absent. Verify actual edit side effects and timestamp behavior on final host before pilot.

## Operational acceptance
In-flight GET may finish; no new GET after expiry. Duplicate distinct first-attempt read-only ticks permitted within bounded window, no durable deduplication; concurrency excludes overlap, reruns denied. Historical CI only. Actual host permissions, two scheduled observations, denied tick, stop/output suppression, rerun denial, non-overlap, timeout and zero spend remain acceptance gates. Distinguish observed from denied. No main change or activation authorized.

## Fixture isolation
Standard ACA CI discovers test/*.test.js; the dedicated pinned Manager fixture lives in fixtures/ and is explicitly invoked by stage2-narrow-fixture.yml with both exact checkouts. No assertion is skipped or weakened. Both standard PR CI and dedicated fixture must pass.

## On-demand candidate
Manual dispatch on main, first attempt only, shares the scheduled concurrency group and exact admission, stop, expiry and output controls. Disabled manual invocation must return denied without API observation. Manual success is not evidence of cron delivery. Existing owner permission, cancellation and scheduled acceptance requirements remain. New integrated SHA requires fresh configuration approval; old SHA must remain disabled. No activation or integration authorized by this draft.
