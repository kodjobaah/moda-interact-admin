#!/usr/bin/env python3
# Moda Interact - Shopify dashboard test-data generator.
#
# Requirements:
#   python3 -m pip install "psycopg[binary]"
#
# Examples:
#   python3 shopify_dashboard_test_data.py seed --shop-id cmtlveegh0000qj0iomk8hko7
#   python3 shopify_dashboard_test_data.py status --shop-id cmtlveegh0000qj0iomk8hko7
#   python3 shopify_dashboard_test_data.py clean --shop-id cmtlveegh0000qj0iomk8hko7
#
# DATABASE_URL is read from the environment unless --database-url is supplied.
#
# The comprehensive seed covers:
#   - all 6 checkout-recovery statuses
#   - all 4 conversation types
#   - all 5 message statuses
#   - inbound/outbound messages
#   - CUSTOMER / AGENT / AUTOMATION / HUMAN senders
#   - all 4 dashboard usage metric labels
#   - linked and unlinked usage events
#   - OPEN/current and multiple PAID/past billing periods
#   - >10 customers for customer pagination
#   - >10 usage events for usage pagination
#   - one customer with multiple recoveries
#   - guest/no-customer recoveries
#   - recoveries with and without conversations
#
# Safety:
#   - it never deletes or replaces the Shop
#   - it never overwrites an existing ShopSettings or Subscription
#   - clean removes only rows whose deterministic IDs start with --prefix
#   - if ShopSettings/Subscription are missing, test-owned access rows are created

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

DEFAULT_PREFIX = "mi_dash_test"


def utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def month_start(dt: datetime, offset: int = 0) -> datetime:
    year = dt.year
    month = dt.month + offset
    while month <= 0:
        month += 12
        year -= 1
    while month > 12:
        month -= 12
        year += 1
    # +1 second avoids a likely collision with a real monthly period at midnight.
    return datetime(year, month, 1, 0, 0, 1)


@dataclass(frozen=True)
class RecoverySpec:
    key: str
    status: str
    period: str
    price: str
    customer_key: str | None
    first_name: str | None
    last_name: str | None
    email: str | None
    conversation_type: str | None = "RECOVERY"
    full_message_matrix: bool = False


RECOVERY_SPECS = [
    RecoverySpec("r01", "COMPLETED",    "current", "129.99", "customer01", "Ama",   "Mensah",  "ama.dashboard@example.com",   "RECOVERY", True),
    RecoverySpec("r02", "DETECTED",     "current", "42.50",  None,         None,    None,      None,                          None),
    RecoverySpec("r03", "MESSAGE_SENT", "current", "64.00",  "customer03", "Yaw",   "Asare",   "yaw.dashboard@example.com",   "RECOVERY"),
    RecoverySpec("r04", "ENGAGED",      "current", "91.75",  "customer04", "Akua",  "Osei",    "akua.dashboard@example.com",  "PRODUCT_DISCOVERY"),
    RecoverySpec("r05", "EXPIRED",      "current", "118.00", "customer05", "Abena", "Darko",   "abena.dashboard@example.com", "PRODUCT_SUPPORT"),
    RecoverySpec("r06", "CANCELLED",    "current", "76.20",  "customer06", "Kofi",  "Adjei",   "kofi.dashboard@example.com",  "POST_PURCHASE"),
    RecoverySpec("r07", "DETECTED",     "current", "55.10",  "customer07", "Esi",   "Addo",     "esi.dashboard@example.com"),
    RecoverySpec("r08", "MESSAGE_SENT", "current", "143.40", "customer08", "Nana",  "Boateng", "nana.dashboard@example.com"),
    RecoverySpec("r09", "ENGAGED",      "current", "88.80",  "customer09", "Kojo",  "Owusu",   "kojo.dashboard@example.com"),
    RecoverySpec("r10", "COMPLETED",    "current", "210.00", "customer10", "Adwoa", "Agyeman", "adwoa.dashboard@example.com"),
    RecoverySpec("r11", "COMPLETED",    "past1",   "249.00", "customer11", "Kwame", "Appiah",  "kwame.dashboard@example.com"),
    RecoverySpec("r12", "EXPIRED",      "past1",   "31.25",  "customer12", "Efua",  "Arthur",   "efua.dashboard@example.com"),
    RecoverySpec("r13", "COMPLETED",    "past2",   "175.25", "customer13", "Yaa",   "Badu",     "yaa.dashboard@example.com"),
    RecoverySpec("r14", "CANCELLED",    "past2",   "96.00",  "customer14", "Joe",   "Tetteh",   "joe.dashboard@example.com"),
    # Same customer as r01 to exercise customer grouping + recovery picker.
    RecoverySpec("r15", "COMPLETED",    "past3",   "84.50",  "customer01", "Ama",   "Mensah",   "ama.dashboard@example.com"),
    # Historical guest.
    RecoverySpec("r16", "MESSAGE_SENT", "past3",   "67.30",  None,         None,    None,       None),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed or remove Moda Interact Shopify dashboard test data."
    )
    parser.add_argument("command", choices=["seed", "clean", "status"])
    parser.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL"),
        help="PostgreSQL connection URL. Defaults to DATABASE_URL.",
    )
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--shop-id", help='commerce."Shop"."id"')
    target.add_argument("--shop-domain", help='commerce."Shop"."domain"')
    parser.add_argument(
        "--prefix",
        default=DEFAULT_PREFIX,
        help=f"Deterministic ID prefix (default: {DEFAULT_PREFIX})",
    )
    return parser.parse_args()


def require_psycopg():
    try:
        import psycopg  # type: ignore
        return psycopg
    except ImportError:
        print(
            'Missing dependency: psycopg\n\n'
            'Install it with:\n'
            '  python3 -m pip install "psycopg[binary]"\n',
            file=sys.stderr,
        )
        raise SystemExit(2)


def resolve_shop(cur, shop_id: str | None, shop_domain: str | None) -> dict[str, Any]:
    if shop_id:
        cur.execute(
            '''
            SELECT "id", "domain", "status"::text
            FROM commerce."Shop"
            WHERE "id" = %s
            ''',
            (shop_id,),
        )
    else:
        cur.execute(
            '''
            SELECT "id", "domain", "status"::text
            FROM commerce."Shop"
            WHERE lower("domain") = lower(%s)
            ''',
            (shop_domain,),
        )

    row = cur.fetchone()
    if not row:
        identifier = shop_id or shop_domain
        raise RuntimeError(
            f"Shop '{identifier}' was not found. "
            "Let the Shopify app resolve/install the shop first."
        )

    return {"id": row[0], "domain": row[1], "status": row[2]}


def owned_id(prefix: str, kind: str, key: str) -> str:
    return f"{prefix}_{kind}_{key}"


def delete_owned_rows(cur, shop_id: str, prefix: str, *, verbose: bool = True) -> dict[str, int]:
    prefix_len = len(prefix)
    deleted: dict[str, int] = {}

    statements = [
        ("usage events", 'DELETE FROM billing."UsageEvent" WHERE "shopId" = %s AND LEFT("id", %s) = %s'),
        ("billing periods", 'DELETE FROM billing."BillingPeriod" WHERE "shopId" = %s AND LEFT("id", %s) = %s'),
        # CheckoutRecovery cascades to Conversation + ConversationMessage.
        ("recoveries", 'DELETE FROM commerce."CheckoutRecovery" WHERE "shopId" = %s AND LEFT("id", %s) = %s'),
        ("customers", 'DELETE FROM commerce."Customer" WHERE "shopId" = %s AND LEFT("id", %s) = %s'),
        # Access rows are removed only when this script created them.
        ("subscriptions", 'DELETE FROM billing."Subscription" WHERE "shopId" = %s AND LEFT("id", %s) = %s'),
        ("shop settings", 'DELETE FROM shopify."ShopSettings" WHERE "shopId" = %s AND LEFT("id", %s) = %s'),
    ]

    for label, sql in statements:
        cur.execute(sql, (shop_id, prefix_len, prefix))
        deleted[label] = cur.rowcount

    # Test plan is global; remove only when no subscription still references it.
    cur.execute(
        '''
        DELETE FROM billing."BillingPlan" bp
        WHERE LEFT(bp."id", %s) = %s
          AND NOT EXISTS (
            SELECT 1
            FROM billing."Subscription" s
            WHERE s."planId" = bp."id"
          )
        ''',
        (prefix_len, prefix),
    )
    deleted["billing plans"] = cur.rowcount

    if verbose:
        print("Removed test rows:")
        for label, count in deleted.items():
            print(f"  {label:18s} {count}")

    return deleted


def ensure_dashboard_access(cur, shop: dict[str, Any], prefix: str, now: datetime) -> list[str]:
    warnings: list[str] = []
    shop_id = shop["id"]

    cur.execute(
        '''
        SELECT "id", "onboardingCompleted", "plan"
        FROM shopify."ShopSettings"
        WHERE "shopId" = %s
        ''',
        (shop_id,),
    )
    settings = cur.fetchone()

    if settings is None:
        cur.execute(
            '''
            INSERT INTO shopify."ShopSettings" (
              "id", "shopId", "onboardingCompleted", "plan",
              "recoveryDelayMinutes", "createdAt", "updatedAt"
            )
            VALUES (%s, %s, true, %s, 30, %s, %s)
            ''',
            (
                owned_id(prefix, "settings", "dashboard"),
                shop_id,
                f"{prefix}-plan",
                now,
                now,
            ),
        )
        print("Created test ShopSettings (onboardingCompleted=true).")
    elif not settings[1]:
        warnings.append(
            "Existing ShopSettings has onboardingCompleted=false. "
            "The script did not overwrite it, so /app will show onboarding."
        )

    cur.execute(
        '''
        SELECT "id", "status", "planHandle"
        FROM billing."Subscription"
        WHERE "shopId" = %s
        ''',
        (shop_id,),
    )
    subscription = cur.fetchone()

    if subscription is None:
        plan_id = owned_id(prefix, "plan", "dashboard")
        plan_handle = f"{prefix}-plan"

        cur.execute(
            '''
            INSERT INTO billing."BillingPlan" (
              "id", "handle", "name", "entitlements", "limits",
              "active", "createdAt", "updatedAt"
            )
            VALUES (
              %s, %s, 'Dashboard Test Plan',
              %s::jsonb, %s::jsonb,
              true, %s, %s
            )
            ON CONFLICT ("handle") DO UPDATE
            SET
              "name" = EXCLUDED."name",
              "entitlements" = EXCLUDED."entitlements",
              "limits" = EXCLUDED."limits",
              "active" = true,
              "updatedAt" = EXCLUDED."updatedAt"
            ''',
            (
                plan_id,
                plan_handle,
                json.dumps(
                    {
                        "checkout_recovery": True,
                        "product_search": True,
                        "ai_conversations": True,
                        "order_support": True,
                    }
                ),
                json.dumps(
                    {
                        "monthly_conversations": 5000,
                        "monthly_recoveries": 10000,
                        "monthly_messages": 50000,
                    }
                ),
                now,
                now,
            ),
        )

        cur.execute(
            'SELECT "id" FROM billing."BillingPlan" WHERE "handle" = %s',
            (plan_handle,),
        )
        actual_plan_id = cur.fetchone()[0]

        cur.execute(
            '''
            INSERT INTO billing."Subscription" (
              "id", "shopId", "planId", "provider", "planHandle", "status",
              "currentPeriodStart", "currentPeriodEnd",
              "trialEndsAt", "cancelAtPeriodEnd",
              "providerSubscriptionId", "lastSyncedAt",
              "createdAt", "updatedAt"
            )
            VALUES (
              %s, %s, %s, 'SHOPIFY', %s, 'ACTIVE',
              %s, %s,
              NULL, false,
              NULL, %s,
              %s, %s
            )
            ''',
            (
                owned_id(prefix, "subscription", "dashboard"),
                shop_id,
                actual_plan_id,
                plan_handle,
                month_start(now, 0),
                month_start(now, 1),
                now,
                now,
                now,
            ),
        )
        print("Created test BillingPlan + ACTIVE Subscription.")
    elif subscription[1] not in ("ACTIVE", "TRIALING"):
        warnings.append(
            f"Existing Subscription status is {subscription[1]!r}. "
            "The dashboard loader accepts only ACTIVE/TRIALING and the script "
            "did not overwrite the existing subscription."
        )

    return warnings


def create_periods(cur, shop_id: str, prefix: str, now: datetime) -> dict[str, dict[str, Any]]:
    periods = {
        "current": {
            "id": owned_id(prefix, "period", "current"),
            "start": month_start(now, 0),
            "end": month_start(now, 1),
            "status": "OPEN",
        },
        "past1": {
            "id": owned_id(prefix, "period", "past1"),
            "start": month_start(now, -1),
            "end": month_start(now, 0),
            "status": "PAID",
        },
        "past2": {
            "id": owned_id(prefix, "period", "past2"),
            "start": month_start(now, -2),
            "end": month_start(now, -1),
            "status": "PAID",
        },
        "past3": {
            "id": owned_id(prefix, "period", "past3"),
            "start": month_start(now, -3),
            "end": month_start(now, -2),
            "status": "PAID",
        },
    }

    for period in periods.values():
        cur.execute(
            '''
            INSERT INTO billing."BillingPeriod" (
              "id", "shopId", "periodStart", "periodEnd",
              "status", "createdAt", "updatedAt"
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ''',
            (
                period["id"],
                shop_id,
                period["start"],
                period["end"],
                period["status"],
                now,
                now,
            ),
        )

    return periods


def period_timestamp(period: dict[str, Any], ordinal: int) -> datetime:
    start: datetime = period["start"]
    end: datetime = period["end"]
    span = max(2, (end - start).days)
    day = 1 + (ordinal * 2) % max(1, span - 1)
    candidate = start + timedelta(days=day, hours=9 + (ordinal % 7))
    return min(candidate, end - timedelta(minutes=10))


def status_dates(status: str, detected_at: datetime) -> dict[str, datetime | None]:
    return {
        "messageSentAt": detected_at + timedelta(minutes=5)
        if status in {"MESSAGE_SENT", "ENGAGED", "COMPLETED"}
        else None,
        "engagedAt": detected_at + timedelta(minutes=20)
        if status in {"ENGAGED", "COMPLETED"}
        else None,
        "completedAt": detected_at + timedelta(minutes=45)
        if status == "COMPLETED"
        else None,
        "expiredAt": detected_at + timedelta(days=1)
        if status == "EXPIRED"
        else None,
    }


def conversation_outcome(status: str) -> str:
    if status == "COMPLETED":
        return "RECOVERED"
    if status == "EXPIRED":
        return "EXPIRED"
    if status == "CANCELLED":
        return "DECLINED"
    if status == "DETECTED":
        return "NO_RESPONSE"
    return "IN_PROGRESS"


def insert_customer(cur, shop_id: str, prefix: str, spec: RecoverySpec, now: datetime) -> str | None:
    if spec.customer_key is None:
        return None

    customer_id = owned_id(prefix, "customer", spec.customer_key)

    cur.execute(
        '''
        INSERT INTO commerce."Customer" (
          "id", "shopId", "phone", "email", "firstName", "lastName",
          "shopifyCustomerId", "createdAt", "updatedAt"
        )
        VALUES (%s, %s, NULL, %s, %s, %s, %s, %s, %s)
        ON CONFLICT ("shopId", "shopifyCustomerId") DO UPDATE
        SET
          "email" = EXCLUDED."email",
          "firstName" = EXCLUDED."firstName",
          "lastName" = EXCLUDED."lastName",
          "updatedAt" = EXCLUDED."updatedAt"
        RETURNING "id"
        ''',
        (
            customer_id,
            shop_id,
            spec.email,
            spec.first_name,
            spec.last_name,
            f"{prefix}-shopify-{spec.customer_key}",
            now,
            now,
        ),
    )
    return cur.fetchone()[0]


def insert_recovery(
    cur,
    shop: dict[str, Any],
    prefix: str,
    spec: RecoverySpec,
    customer_id: str | None,
    detected_at: datetime,
    now: datetime,
) -> str:
    recovery_id = owned_id(prefix, "recovery", spec.key)
    dates = status_dates(spec.status, detected_at)

    cur.execute(
        '''
        INSERT INTO commerce."CheckoutRecovery" (
          "id", "shopId", "checkoutToken", "cartToken", "customerId",
          "status", "currency", "totalPrice", "checkoutUrl", "lineItems",
          "detectedAt", "messageSentAt", "engagedAt", "completedAt", "expiredAt",
          "createdAt", "updatedAt"
        )
        VALUES (
          %s, %s, %s, %s, %s,
          %s::commerce."CheckoutRecoveryStatus",
          'GBP', %s, %s, %s::jsonb,
          %s, %s, %s, %s, %s,
          %s, %s
        )
        ''',
        (
            recovery_id,
            shop["id"],
            f"{prefix}-checkout-{spec.key}",
            f"{prefix}-cart-{spec.key}",
            customer_id,
            spec.status,
            Decimal(spec.price),
            f"https://{shop['domain']}/checkouts/{prefix}-{spec.key}",
            json.dumps(
                [
                    {
                        "title": f"Dashboard test product {spec.key}",
                        "quantity": 1,
                        "price": spec.price,
                    }
                ]
            ),
            detected_at,
            dates["messageSentAt"],
            dates["engagedAt"],
            dates["completedAt"],
            dates["expiredAt"],
            now,
            now,
        ),
    )
    return recovery_id


def insert_conversation_and_messages(
    cur,
    prefix: str,
    spec: RecoverySpec,
    recovery_id: str,
    detected_at: datetime,
    now: datetime,
) -> tuple[str | None, list[str]]:
    if spec.conversation_type is None:
        return None, []

    conversation_id = owned_id(prefix, "conversation", spec.key)
    cur.execute(
        '''
        INSERT INTO whatsapp."Conversation" (
          "id", "checkoutRecoveryId", "type", "outcome",
          "inboundVersion", "lastProcessedVersion",
          "summary", "lastInboundAt", "lastMessageAt",
          "createdAt", "updatedAt"
        )
        VALUES (
          %s, %s,
          %s::whatsapp."ConversationType",
          %s::whatsapp."ConversationOutcome",
          1, 1,
          %s, NULL, NULL,
          %s, %s
        )
        ''',
        (
            conversation_id,
            recovery_id,
            spec.conversation_type,
            conversation_outcome(spec.status),
            f"Dashboard test conversation for {spec.key}",
            now,
            now,
        ),
    )

    if spec.full_message_matrix:
        messages = [
            ("m01", "OUTBOUND", "AUTOMATION", "SENT",      "We saved your checkout for you."),
            ("m02", "INBOUND",  "CUSTOMER",   "READ",      "Thanks — I have a question before I buy."),
            ("m03", "OUTBOUND", "AGENT",      "DELIVERED", "Of course. I can help with that."),
            ("m04", "OUTBOUND", "HUMAN",      "PENDING",   "A human follow-up is queued."),
            ("m05", "OUTBOUND", "AGENT",      "FAILED",    "This message is intentionally failed test data."),
        ]
    else:
        messages = [
            ("m01", "OUTBOUND", "AUTOMATION", "SENT", "Your checkout is still available."),
            ("m02", "INBOUND",  "CUSTOMER",   "READ", "Thanks, I saw your message."),
        ]

    ids: list[str] = []
    last_inbound: datetime | None = None
    last_message: datetime | None = None

    for index, (message_key, direction, sender_type, status, content) in enumerate(messages):
        message_id = owned_id(prefix, "message", f"{spec.key}_{message_key}")
        created_at = detected_at + timedelta(minutes=10 + index * 5)
        sent_at = created_at if status in {"SENT", "DELIVERED", "READ", "FAILED"} else None
        delivered_at = created_at + timedelta(seconds=30) if status in {"DELIVERED", "READ"} else None
        read_at = created_at + timedelta(minutes=1) if status == "READ" else None

        cur.execute(
            '''
            INSERT INTO whatsapp."ConversationMessage" (
              "id", "conversationId", "providerMessageId",
              "inReplyToProviderId",
              "direction", "senderType", "status",
              "content", "createdAt",
              "sentAt", "deliveredAt", "readAt"
            )
            VALUES (
              %s, %s, %s, NULL,
              %s::whatsapp."MessageDirection",
              %s::whatsapp."MessageSenderType",
              %s::whatsapp."MessageStatus",
              %s, %s,
              %s, %s, %s
            )
            ''',
            (
                message_id,
                conversation_id,
                f"{prefix}-provider-{spec.key}-{message_key}",
                direction,
                sender_type,
                status,
                content,
                created_at,
                sent_at,
                delivered_at,
                read_at,
            ),
        )
        ids.append(message_id)
        last_message = created_at
        if direction == "INBOUND":
            last_inbound = created_at

    cur.execute(
        '''
        UPDATE whatsapp."Conversation"
        SET
          "lastInboundAt" = %s,
          "lastMessageAt" = %s,
          "updatedAt" = %s
        WHERE "id" = %s
        ''',
        (last_inbound, last_message, now, conversation_id),
    )

    return conversation_id, ids


def insert_usage_event(
    cur,
    *,
    shop_id: str,
    prefix: str,
    key: str,
    period_id: str,
    metric: str,
    quantity: Decimal,
    source_type: str | None,
    source_id: str | None,
    occurred_at: datetime,
    reported_at: datetime | None,
    now: datetime,
) -> None:
    cur.execute(
        '''
        INSERT INTO billing."UsageEvent" (
          "id", "shopId", "billingPeriodId",
          "metric", "quantity", "idempotencyKey",
          "sourceType", "sourceId",
          "occurredAt", "reportedAt",
          "provider", "providerResponse", "createdAt"
        )
        VALUES (
          %s, %s, %s,
          %s, %s, %s,
          %s, %s,
          %s, %s,
          'SHOPIFY', NULL, %s
        )
        ''',
        (
            owned_id(prefix, "usage", key),
            shop_id,
            period_id,
            metric,
            quantity,
            f"{prefix}:usage:{key}",
            source_type,
            source_id,
            occurred_at,
            reported_at,
            now,
        ),
    )


def seed(cur, shop: dict[str, Any], prefix: str) -> None:
    now = utc_now_naive()

    print(f"Target shop: {shop['domain']} ({shop['id']})")
    print("Cleaning previous rows created with this prefix...")
    delete_owned_rows(cur, shop["id"], prefix, verbose=False)

    warnings = ensure_dashboard_access(cur, shop, prefix, now)
    periods = create_periods(cur, shop["id"], prefix, now)

    for ordinal, spec in enumerate(RECOVERY_SPECS):
        period = periods[spec.period]
        detected_at = period_timestamp(period, ordinal)

        customer_id = insert_customer(cur, shop["id"], prefix, spec, now)
        recovery_id = insert_recovery(
            cur, shop, prefix, spec, customer_id, detected_at, now
        )
        conversation_id, message_ids = insert_conversation_and_messages(
            cur, prefix, spec, recovery_id, detected_at, now
        )

        is_past = spec.period != "current"
        reported_at = period["end"] + timedelta(hours=1) if is_past else None

        insert_usage_event(
            cur,
            shop_id=shop["id"],
            prefix=prefix,
            key=f"{spec.key}_checkout_recovery",
            period_id=period["id"],
            metric="checkout_recovery",
            quantity=Decimal("1"),
            source_type="CheckoutRecovery",
            source_id=recovery_id,
            occurred_at=detected_at,
            reported_at=reported_at,
            now=now,
        )

        if conversation_id:
            insert_usage_event(
                cur,
                shop_id=shop["id"],
                prefix=prefix,
                key=f"{spec.key}_conversation",
                period_id=period["id"],
                metric="conversation",
                quantity=Decimal("1"),
                source_type="Conversation",
                source_id=conversation_id,
                occurred_at=detected_at + timedelta(minutes=10),
                reported_at=reported_at,
                now=now,
            )

        if message_ids:
            insert_usage_event(
                cur,
                shop_id=shop["id"],
                prefix=prefix,
                key=f"{spec.key}_agent_message",
                period_id=period["id"],
                metric="agent_message",
                quantity=Decimal("1"),
                source_type="ConversationMessage",
                source_id=message_ids[0],
                occurred_at=detected_at + timedelta(minutes=15),
                reported_at=reported_at,
                now=now,
            )
            second_source = message_ids[1] if len(message_ids) > 1 else message_ids[0]
            insert_usage_event(
                cur,
                shop_id=shop["id"],
                prefix=prefix,
                key=f"{spec.key}_whatsapp_message",
                period_id=period["id"],
                metric="whatsapp_message",
                quantity=Decimal("1"),
                source_type="ConversationMessage",
                source_id=second_source,
                occurred_at=detected_at + timedelta(minutes=20),
                reported_at=reported_at,
                now=now,
            )

    # Explicitly exercise "Unlinked" in the UsageEvents table.
    insert_usage_event(
        cur,
        shop_id=shop["id"],
        prefix=prefix,
        key="current_unlinked",
        period_id=periods["current"]["id"],
        metric="whatsapp_message",
        quantity=Decimal("2"),
        source_type="SyntheticDashboardTest",
        source_id=owned_id(prefix, "missing_source", "current"),
        occurred_at=period_timestamp(periods["current"], 21),
        reported_at=None,
        now=now,
    )
    insert_usage_event(
        cur,
        shop_id=shop["id"],
        prefix=prefix,
        key="past_unlinked",
        period_id=periods["past1"]["id"],
        metric="agent_message",
        quantity=Decimal("3"),
        source_type="SyntheticDashboardTest",
        source_id=owned_id(prefix, "missing_source", "past"),
        occurred_at=period_timestamp(periods["past1"], 22),
        reported_at=periods["past1"]["end"] + timedelta(hours=1),
        now=now,
    )

    print("\nSeed complete.")
    print(f"  recoveries:      {len(RECOVERY_SPECS)}")
    print("  recovery states: DETECTED, MESSAGE_SENT, ENGAGED, COMPLETED, EXPIRED, CANCELLED")
    print("  billing periods: 1 OPEN + 3 PAID")
    print("  usage metrics:   checkout_recovery, conversation, agent_message, whatsapp_message")
    print("  special cases:   guest, multi-recovery customer, no-conversation recovery, unlinked usage")
    print("  pagination:      >10 customer groups and >10 usage events")

    if warnings:
        print("\nWarnings:")
        for warning in warnings:
            print(f"  - {warning}")

    print("\nUseful dashboard routes:")
    print("  /app")
    print(f"  /app?view=detail&bill=current&billId={periods['current']['id']}")
    print(f"  /app/usage?bill=current&billId={periods['current']['id']}")
    print(f"  /app?view=detail&bill=past&billId={periods['past1']['id']}")
    print(f"  /app/usage?bill=past&billId={periods['past1']['id']}")


def print_status(cur, shop: dict[str, Any], prefix: str) -> None:
    shop_id = shop["id"]
    prefix_len = len(prefix)

    print(f"Target shop: {shop['domain']} ({shop_id})")

    cur.execute(
        '''
        SELECT "status"::text, COUNT(*)
        FROM commerce."CheckoutRecovery"
        WHERE "shopId" = %s AND LEFT("id", %s) = %s
        GROUP BY "status"
        ORDER BY "status"::text
        ''',
        (shop_id, prefix_len, prefix),
    )
    recovery_rows = cur.fetchall()

    cur.execute(
        '''
        SELECT "metric", COUNT(*), COALESCE(SUM("quantity"), 0)
        FROM billing."UsageEvent"
        WHERE "shopId" = %s AND LEFT("id", %s) = %s
        GROUP BY "metric"
        ORDER BY "metric"
        ''',
        (shop_id, prefix_len, prefix),
    )
    usage_rows = cur.fetchall()

    cur.execute(
        '''
        SELECT "status", COUNT(*)
        FROM billing."BillingPeriod"
        WHERE "shopId" = %s AND LEFT("id", %s) = %s
        GROUP BY "status"
        ORDER BY "status"
        ''',
        (shop_id, prefix_len, prefix),
    )
    period_rows = cur.fetchall()

    cur.execute(
        '''
        SELECT COUNT(*)
        FROM commerce."Customer"
        WHERE "shopId" = %s AND LEFT("id", %s) = %s
        ''',
        (shop_id, prefix_len, prefix),
    )
    customer_count = cur.fetchone()[0]

    cur.execute(
        '''
        SELECT COUNT(*)
        FROM whatsapp."ConversationMessage" m
        JOIN whatsapp."Conversation" c ON c."id" = m."conversationId"
        JOIN commerce."CheckoutRecovery" r ON r."id" = c."checkoutRecoveryId"
        WHERE r."shopId" = %s AND LEFT(r."id", %s) = %s
        ''',
        (shop_id, prefix_len, prefix),
    )
    message_count = cur.fetchone()[0]

    print("\nSeeded recovery statuses:")
    if recovery_rows:
        for status, count in recovery_rows:
            print(f"  {status:14s} {count}")
    else:
        print("  none")

    print(f"\nSeeded customers: {customer_count}")
    print(f"Seeded messages:  {message_count}")

    print("\nSeeded usage:")
    if usage_rows:
        for metric, count, quantity in usage_rows:
            print(f"  {metric:20s} events={count:2d} quantity={quantity}")
    else:
        print("  none")

    print("\nSeeded billing periods:")
    if period_rows:
        for status, count in period_rows:
            print(f"  {status:8s} {count}")
    else:
        print("  none")

    cur.execute(
        '''
        SELECT "id", "onboardingCompleted"
        FROM shopify."ShopSettings"
        WHERE "shopId" = %s
        ''',
        (shop_id,),
    )
    settings = cur.fetchone()

    cur.execute(
        '''
        SELECT "id", "status", "planHandle"
        FROM billing."Subscription"
        WHERE "shopId" = %s
        ''',
        (shop_id,),
    )
    subscription = cur.fetchone()

    print("\nDashboard access:")
    print(f"  ShopSettings: {settings if settings else 'MISSING'}")
    print(f"  Subscription: {subscription if subscription else 'MISSING'}")


def main() -> int:
    args = parse_args()
    if not args.database_url:
        print(
            "DATABASE_URL is required. Set it in the environment or pass --database-url.",
            file=sys.stderr,
        )
        return 2

    psycopg = require_psycopg()

    try:
        with psycopg.connect(args.database_url) as conn:
            with conn.cursor() as cur:
                shop = resolve_shop(cur, args.shop_id, args.shop_domain)

                if args.command == "seed":
                    seed(cur, shop, args.prefix)
                elif args.command == "clean":
                    print(f"Target shop: {shop['domain']} ({shop['id']})")
                    delete_owned_rows(cur, shop["id"], args.prefix)
                    print("Cleanup complete. The Shop itself was not modified.")
                else:
                    print_status(cur, shop, args.prefix)

        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
