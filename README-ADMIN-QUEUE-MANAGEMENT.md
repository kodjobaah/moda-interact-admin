# Admin queue management — pre-launch operator notes

The queue monitor displays declared, source-verified BullMQ queues and jobs. An empty
queue with zero workers is not evidence of a deployment failure: a worker may be
in another process or not yet deployed. The inventory is intentionally an explicit
allowlist; it does not scan shared Redis keys or discover arbitrary queues.

## Remove one terminally failed job

1. Open **Platform Queues** and select the appropriate queue.
2. Open the **Failed** job list and select the exact job.
3. As a non-bypassed **SUPER_ADMIN**, enter the exact job ID in the confirmation field.
4. Select **Remove failed job**. The server rechecks queue name, job name, ID,
   the failed state, and removes only that job; other job states are refused.
5. Verify the failed count and list after refresh. Logs record the admin and a
   hash of the deleted job identity without logging its payload or Redis URL.

Removing a BullMQ failed job **does not** undo WhatsApp provider sends, billing
operations, committed ledger effects, R2 objects, Shopify state, or database
records. It also does not remove other jobs or orphaned Redis index keys. Confirm
that the job is historical and not needed for reconciliation before removal.

This feature deliberately does not provide queue drain, retry, remove waiting,
remove active, delete by shop, or Redis-wide deletion. Those require separately
reviewed lifecycle-aware operations. Admin mutation requires authenticated
SUPER_ADMIN and a same-origin POST; developer auth bypass is refused.

## Verification

```bash
node --test tests/security/admin-queue-monitor.test.mjs \
  tests/security/admin-queue-jobs.test.mjs \
  tests/security/admin-queue-job-detail.test.mjs \
  tests/security/admin-queue-job-removal.test.mjs
npx tsc --noEmit
npm run lint
```

The registry covers the Shopify, WooCommerce, pending recovery, WhatsApp,
merchant communications, billing, knowledge, and recovery-follow-up queues
verified from Background and Shared. Job names on shared queues are listed
under their **one physical queue** rather than counted as separate queues.
