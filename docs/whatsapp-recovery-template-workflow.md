# Recovery template workflow

The six-scenario dashboard is the default WhatsApp templates route. The version catalogue and previous direct stage URLs remain available. Each recovery definition has a resumable workspace: Compose (immutable saved source or clone), Translate and review, Meta approval, Publish and assign. Existing in-progress work is read from PostgreSQL; navigation does not create a new definition, run or publication. Dashboard counts are advisory evidence for the configured WABA, not current send eligibility.

New recovery saves request translations only after the immutable English transaction commits. A failed request preserves the saved definition; retry from its translation stage. Replaying the same save reuses the immutable source's run even if the model selection has changed. Existing translation workers and manual retry remain unchanged. Consolidated review requires explicit confirmation of the selected previews, rechecks the exact run and candidate digests, and commits the existing per-locale audit and review writes in one transaction. It does not register with Meta, publish or assign shops. Meta submission remains explicit and is monitored through the existing status service.

## Publication and assignments

- Future shops only: configure/replace the default, without changing existing shop variants.
- One shop or selected shops: publish to those shops, leaving the default unchanged.
- All existing and future shops: configure the default and publish to eligible existing shops. Explicitly acknowledge every replacement of an existing version (including linked variants), or use a narrower scope.
- Alternative-product templates retain existing supported-shop scope semantics and are not checkout defaults.

The scenario dashboard displays default and latest checkout version separately. Its shop inventory shows current-sender approved/enabled variants by shop and version; a different version is not necessarily an intentional override. Choose any eligible version from history and use the publication scope selector. The combined review, approval and publication validation gates remain authoritative. No new schema or worker is required. The common-layout upgrade workflow and website link change are deferred.

## Validation

```sh
npm run prisma:generate
npx tsc --noEmit
node scripts/test-unit.mjs tests/unit/whatsapp-template-workflow.test.ts tests/unit/whatsapp-template-workflow-ui.test.mjs
npm run test:arch047-admin-authoring:unit
npm run test:arch047-admin-translations:unit
npm run test:arch047-admin-compilation:unit
npm run test:arch047-admin-compilation:components
npm run test:arch047-admin-meta:unit
npm run test:arch047-admin-publication:unit
npm run test:whatsapp-recovery-defaults:unit
npm run test:arch047-admin-translations:postgres
npm run test:arch047-admin-compilation:postgres
npm run test:whatsapp-recovery-defaults:postgres
```

The PostgreSQL suites use existing disposable database harnesses. Manual acceptance: open an existing unfinished discount template from the scenario dashboard; resume its actual stage without cloning or resubmitting unnecessarily. For a new clone, confirm one automatic translation run, review selected previews, explicitly submit to Meta, then publish to the desired scope. Verify the default and assignment inventory independently. Test shop-only assignment and future-only default replacement in a disposable/test store cohort, and check broad replacement confirmation. Existing merchant defaults and assignments must remain unchanged by deployment alone.
