# Checkout routing policy

Admin owns the complete `recovery.routingAgent` JSON value in the existing deployment-scoped `PlatformConfiguration` record. Saving uses SUPER_ADMIN authorization, serializable compare-and-swap and the existing atomic policy audit. No defaults, reset, copied credentials or normal Commerce configuration writes are supported.

The exact structure and business validation live in `src/lib/admin/platform-configuration/routing-agent-contract.ts`. It contains schemaVersion, enabled, modelBinding, promptRevisionId, wrapperAudience, confidenceThreshold, budget, retry, input, decisionTTLms and retentionMs. Every value must be provided even when disabled. Model provider parameters and reasoning stay in the existing model catalogue. Model binding is either `FIXED_CATALOGUE` with a platform model entry ID or `VERIFIED_SHOP_INHERIT` with no model ID. Inheritance never invents a shop before ownership proof.

Reference validation occurs inside the save transaction and must also occur in Background immediately before model use. The fixed entry and its PLATFORM availability must be enabled; provider/model/configuration must pass the existing Shared model structure parser. The prompt must be PUBLISHED, PLATFORM, not shop-owned, have a matching SHA-256, sourceContext `{purpose:"RECOVERY_ROUTING",schemaVersion:1}`, and not be an active normal Commerce prompt. Missing or invalid settings make semantic routing unavailable; Background uses the neutral ROUTER clarification path without an arbitrary model fallback. Persist resolved config revision, model editVersion, prompt ID/hash and budgets with each routing decision.

## Routing prompt publication

The dedicated editor publishes an immutable routing-only revision into the existing platform prompt lineage. It locks the lineage and compares the operator's expected latest revision number before appending. Publication audits purpose, content hash and revision number. It does not update `CommerceAgentConfiguration`, and publication alone does not save or enable the policy.

Normal Agent Instructions omits routing revisions from history and draft seeds and refuses their update, publication or activation. The worker's normal active-pointer resolver remains separate; the routing reader must require the purpose tag and use only the configured exact revision.

## Verification

`npm run test:arch076-routing-agent:unit` covers the policy, references, authorization and rendered fields. `npm run test:arch076-routing-agent:postgres` creates and removes a disposable PostgreSQL container, applies existing migrations, and checks publication isolation, normal draft seed preservation, CAS/audit, environment scope and reference failures. Neither suite calls a model, Meta or a live database. Architecture SYSTEM-TEST remains deferred.
