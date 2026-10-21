import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { transitionHumanMessagingRestriction, reviewHumanModerationAssessment } from '../../src/lib/admin/human-messaging-mutations.ts';
import { readHumanMessagingDashboard } from '../../src/lib/admin/human-messaging.ts';

const postgres = process.env.ARCH040_ADMIN_DISPOSABLE_POSTGRES === '1';
const db = new PrismaClient();
const principalId = `arch040-admin-${randomUUID()}`;
const admin = { id: principalId, role: 'SUPER_ADMIN' as const, developmentBypass: false };
const note = 'A documented merchant conduct review';
const transition = (shopId: string, intent: 'SUSPEND' | 'RESTORE', expectedRevision: number) =>
  transitionHumanMessagingRestriction(db, admin, {
    shopId, intent, expectedRevision, reasonCode: 'POLICY_ABUSE', reasonNote: note,
  });
const code = (value: string) => (error: unknown) => (error as { code?: string }).code === value;

if (!postgres) {
  test('requires a disposable PostgreSQL database', { skip: true }, () => {});
} else {
  test('Shopify and Woo HUMAN restrictions are audited, CAS-safe and independent of Shop/AI', async () => {
    const shopify = `arch040-shopify-${randomUUID()}`;
    const woo = `arch040-woo-${randomUUID()}`;
    try {
      await db.platformAdmin.create({ data: {
        id: principalId, email: `${principalId}@example.invalid`, role: 'SUPER_ADMIN',
        provider: 'fixture', providerSubject: principalId, active: true,
      } });
      await db.shop.create({ data: { id: shopify, domain: `${shopify}.myshopify.com` } });
      await db.shop.create({ data: { id: woo, domain: `https://${woo}.invalid`, platform: 'WOOCOMMERCE' } });
      const initial = await readHumanMessagingDashboard(db, woo, 1, 1);
      assert.equal(initial.status, 'ACTIVE');
      assert.equal(initial.revision, 0);
      assert.equal(await transition(shopify, 'SUSPEND', 0), 1);
      assert.equal(await transition(woo, 'SUSPEND', 0), 1);
      await assert.rejects(() => transition(woo, 'SUSPEND', 0), code('STALE'));
      await assert.rejects(() => transition(woo, 'SUSPEND', 1), code('ALREADY_TARGET'));
      const ordinary = { id: principalId, role: 'ADMIN' as const, developmentBypass: false };
      await assert.rejects(() => transitionHumanMessagingRestriction(db, ordinary, {
        shopId: woo, intent: 'RESTORE', expectedRevision: 1, reasonCode: 'OTHER', reasonNote: note,
      }), code('FORBIDDEN'));
      // Concurrent restore attempts at the same revision cannot both audit a transition.
      const raced = await Promise.allSettled([transition(woo, 'RESTORE', 1), transition(woo, 'RESTORE', 1)]);
      assert.equal(raced.filter((x) => x.status === 'fulfilled').length, 1);
      assert.equal(raced.filter((x) => x.status === 'rejected').length, 1);
      const current = await db.shopHumanMessagingRestriction.findUniqueOrThrow({ where: { shopId: woo } });
      assert.equal(current.status, 'ACTIVE');
      assert.equal(current.revision, 2);
      assert.equal((await db.shopHumanMessagingRestrictionEvent.findMany({ where: { shopId: woo } })).length, 2);
      assert.equal((await db.shop.findUniqueOrThrow({ where: { id: woo } })).status, 'ACTIVE');
      assert.equal((await db.shopHumanMessagingRestriction.findUniqueOrThrow({ where: { shopId: shopify } })).status, 'SUSPENDED');
      // A failed audit write must roll back the actual PostgreSQL restriction
      // update. A future event cannot be pre-seeded: DATABASE-001 intentionally
      // rejects events whose revision does not match the restriction row.
      // Prisma $extends changes the static transaction overloads. The fixture
      // deliberately exposes only the same $transaction port the service uses.
      const failingAuditDatabase = db.$extends({
        query: {
          shopHumanMessagingRestrictionEvent: {
            async create() {
              throw new Error('fixture_audit_insert_failed');
            },
          },
        },
      }) as unknown as Parameters<typeof transitionHumanMessagingRestriction>[0];
      await assert.rejects(
        () => transitionHumanMessagingRestriction(failingAuditDatabase, admin, {
          shopId: woo, intent: 'SUSPEND', expectedRevision: 2,
          reasonCode: 'OTHER', reasonNote: note,
        }),
        /fixture_audit_insert_failed/,
      );
      const stillActive = await db.shopHumanMessagingRestriction.findUniqueOrThrow({ where: { shopId: woo } });
      assert.equal(stillActive.revision, 2);
      assert.equal(stillActive.status, 'ACTIVE');
      assert.equal(await db.shopHumanMessagingRestrictionEvent.count({ where: { shopId: woo } }), 2);
      // A missing shop must not create state or history.
      await assert.rejects(() => transition(`nonexistent-${randomUUID()}`, 'SUSPEND', 0), code('NOT_FOUND'));

      const customer = await db.customer.create({ data: { shopId: woo } });
      const recovery = await db.checkoutRecovery.create({ data: {
        shopId: woo, checkoutToken: `arch040-checkout-${randomUUID()}`,
        customerId: customer.id, lastExternalActivityAt: new Date(),
      } });
      const conversation = await db.conversation.create({ data: {
        type: 'RECOVERY', shopId: woo, customerId: customer.id, checkoutRecoveryId: recovery.id,
      } });
      const message = await db.conversationMessage.create({ data: {
        conversationId: conversation.id, direction: 'INBOUND', senderType: 'CUSTOMER',
        status: 'DELIVERED', content: 'Test-only example that stays private',
      } });
      const assessment = await db.conversationModerationAssessment.create({ data: {
        shopId: woo, conversationId: conversation.id, subject: 'CUSTOMER_MESSAGE',
        conversationMessageId: message.id, contentSha256: createHash('sha256').update(message.content).digest('hex'),
        inputKind: 'TEXT', requestedModel: 'omni-moderation-latest', policyVersion: 'v1',
      } });
      const token = `fixture-${randomUUID()}`;
      await db.conversationModerationAssessment.update({ where: { id: assessment.id }, data: {
        decision: 'CHECKING', attemptCount: 1, leaseToken: token, leaseExpiresAt: new Date(Date.now() + 120_000),
      } });
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('moda.moderation_lease_token', ${token}, true)`;
        await tx.conversationModerationAssessment.update({ where: { id: assessment.id }, data: {
          decision: 'BLOCK', flagged: true, returnedModel: 'omni-moderation-latest',
          categories: { violence: true, sexual: false },
          reasonCode: 'content_flagged', assessedAt: new Date(),
          leaseToken: null, leaseExpiresAt: null,
        } });
      });
      const before = await readHumanMessagingDashboard(db, woo, 1, 1);
      assert.equal(before.incidents.items[0]?.subject, 'CUSTOMER');
      assert.deepEqual(before.incidents.items[0]?.categories, ['violence']);
      assert.equal(before.incidents.items[0]?.reviewed, false);
      assert.equal(before.history.items.length, 2);
      await assert.rejects(() => reviewHumanModerationAssessment(db, admin, {
        shopId: shopify, assessmentId: assessment.id, disposition: 'ACKNOWLEDGED',
      }), code('NOT_FOUND'));
      await reviewHumanModerationAssessment(db, admin, {
        shopId: woo, assessmentId: assessment.id, disposition: 'ACKNOWLEDGED',
      });
      await assert.rejects(() => reviewHumanModerationAssessment(db, admin, {
        shopId: woo, assessmentId: assessment.id, disposition: 'FALSE_POSITIVE',
      }), code('ALREADY_REVIEWED'));
      const after = await db.conversationModerationAssessment.findUniqueOrThrow({ where: { id: assessment.id } });
      assert.equal(after.decision, 'BLOCK');
      assert.equal(after.reviewedByPlatformAdminId, principalId);
      assert.equal(after.reviewDisposition, 'ACKNOWLEDGED');
      assert.equal((await readHumanMessagingDashboard(db, woo, 1, 1)).incidents.items[0]?.reviewed, true);
    } finally {
      await db.shop.deleteMany({ where: { id: { in: [shopify, woo] } } });
      await db.platformAdmin.deleteMany({ where: { id: principalId } });
      await db.$disconnect();
    }
  });
}
