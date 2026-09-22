#!/usr/bin/env node

import process from "node:process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_SHOP_DOMAIN = "kwadwo-e4bf4mc4.myshopify.com";
const CONFIRM_FLAG = "--confirm-test-data";
const CLEANUP_FLAG = "--cleanup";

const CUSTOMER_PREFIX = "admin-recovery-seed-customer-";
const CHECKOUT_PREFIX = "admin-recovery-seed-checkout-";
const MESSAGE_PREFIX = "admin-recovery-seed-message-";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const CUSTOMERS = [
  {
    firstName: "Amelia",
    lastName: "Carter",
    email: "amelia.carter@example.com",
    phone: "+447700900101",
    recoveryCount: 11,
  },
  {
    firstName: "Marcus",
    lastName: "Johnson",
    email: "marcus.johnson@example.com",
    phone: "+447700900102",
    recoveryCount: 5,
  },
  {
    firstName: "Priya",
    lastName: "Shah",
    email: "priya.shah@example.com",
    phone: "+447700900103",
    recoveryCount: 4,
  },
  {
    firstName: "Daniel",
    lastName: "Okafor",
    email: "daniel.okafor@example.com",
    phone: "+447700900104",
    recoveryCount: 3,
  },
  {
    firstName: "Sofia",
    lastName: "Martins",
    email: "sofia.martins@example.com",
    phone: "+447700900105",
    recoveryCount: 2,
  },
  {
    firstName: "Hannah",
    lastName: "Williams",
    email: "hannah.williams@example.com",
    phone: "+447700900106",
    recoveryCount: 2,
  },
  {
    firstName: "Yusuf",
    lastName: "Khan",
    email: "yusuf.khan@example.com",
    phone: "+447700900107",
    recoveryCount: 1,
  },
  {
    firstName: "Mei",
    lastName: "Chen",
    email: "mei.chen@example.com",
    phone: "+447700900108",
    recoveryCount: 1,
  },
  {
    firstName: "Luca",
    lastName: "Romano",
    email: "luca.romano@example.com",
    phone: "+447700900109",
    recoveryCount: 1,
  },
  {
    firstName: "Aisha",
    lastName: "Rahman",
    email: "aisha.rahman@example.com",
    phone: "+447700900110",
    recoveryCount: 1,
  },
];

const PRODUCTS = [
  { title: "Linen Overshirt", variant: "Stone / M", price: 54.0 },
  { title: "Everyday Trainers", variant: "White / UK 7", price: 79.0 },
  { title: "Ribbed Midi Dress", variant: "Forest / 10", price: 68.0 },
  { title: "Merino Crew Jumper", variant: "Navy / M", price: 62.0 },
  { title: "Leather Crossbody Bag", variant: "Tan", price: 89.0 },
  { title: "Ceramic Travel Mug", variant: "Sage", price: 24.0 },
  { title: "Relaxed Trousers", variant: "Charcoal / 32", price: 58.0 },
  { title: "Cotton Oxford Shirt", variant: "Sky / M", price: 49.0 },
  { title: "Lightweight Rain Jacket", variant: "Olive / M", price: 96.0 },
  { title: "Studio Backpack", variant: "Black", price: 74.0 },
];

const RECOVERY_PROFILES = [
  { status: "ENGAGED", outcome: "IN_PROGRESS", longConversation: true },
  { status: "COMPLETED", outcome: "RECOVERED" },
  { status: "EXPIRED", outcome: "NO_RESPONSE" },
  { status: "CANCELLED", outcome: "DECLINED" },
  { status: "MESSAGE_SENT", outcome: "IN_PROGRESS" },
  { status: "DETECTED", outcome: null },
  { status: "COMPLETED", outcome: "RECOVERED" },
  { status: "ENGAGED", outcome: "IN_PROGRESS" },
  { status: "EXPIRED", outcome: "EXPIRED" },
  { status: "CANCELLED", outcome: "DECLINED" },
  { status: "COMPLETED", outcome: "RECOVERED" },
];

function argument(name) {
  const prefix = `--${name}=`;
  const exact = process.argv.find((value) => value.startsWith(prefix));
  if (exact) return exact.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function at(base, offsetMs) {
  return new Date(base.getTime() + offsetMs);
}

function money(value) {
  return Number(value.toFixed(2));
}

function cartFor(globalIndex) {
  const itemCount = 2 + (globalIndex % 3);
  const items = [];

  for (let offset = 0; offset < itemCount; offset += 1) {
    const product = PRODUCTS[(globalIndex + offset * 3) % PRODUCTS.length];
    const quantity = offset === 0 && globalIndex % 7 === 0 ? 2 : 1;

    items.push({
      title: product.title,
      variant_title: product.variant,
      quantity,
      price: product.price.toFixed(2),
    });
  }

  const total = items.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0,
  );

  return { items, total: money(total) };
}

function firstProduct(cart) {
  return cart.items[0]?.title ?? "your items";
}

function shortConversation({
  customer,
  cart,
  checkoutUrl,
  outcome,
  status,
}) {
  const first = firstProduct(cart);
  const total = `£${cart.total.toFixed(2)}`;

  if (status === "MESSAGE_SENT") {
    return [
      {
        direction: "OUTBOUND",
        senderType: "AUTOMATION",
        content:
          `Hi ${customer.firstName}, you left ${first} and a few other items in your basket (${total}). ` +
          `Your checkout is still available here: ${checkoutUrl}`,
      },
    ];
  }

  if (outcome === "NO_RESPONSE" || outcome === "EXPIRED") {
    return [
      {
        direction: "OUTBOUND",
        senderType: "AUTOMATION",
        content:
          `Hi ${customer.firstName}, it looks like you left ${first} in your basket. ` +
          `If you still want it, you can continue here: ${checkoutUrl}`,
      },
      {
        direction: "OUTBOUND",
        senderType: "AUTOMATION",
        content:
          `Just a quick reminder in case you meant to come back to your basket. ` +
          `I can also help with sizing, delivery or returns.`,
      },
    ];
  }

  if (outcome === "DECLINED") {
    return [
      {
        direction: "OUTBOUND",
        senderType: "AUTOMATION",
        content:
          `Hi ${customer.firstName}, you still have ${first} in your basket. ` +
          `Would you like any help before checking out?`,
      },
      {
        direction: "INBOUND",
        senderType: "CUSTOMER",
        content: "Thanks, but I have changed my mind for now.",
      },
      {
        direction: "OUTBOUND",
        senderType: "AGENT",
        content:
          "No problem at all. I will leave it there and won't keep nudging you about this basket.",
      },
      {
        direction: "INBOUND",
        senderType: "CUSTOMER",
        content: "Perfect, thank you.",
      },
    ];
  }

  if (outcome === "RECOVERED") {
    return [
      {
        direction: "OUTBOUND",
        senderType: "AUTOMATION",
        content:
          `Hi ${customer.firstName}, your basket is still waiting. ` +
          `It currently comes to ${total}. Want any help before you finish checking out?`,
      },
      {
        direction: "INBOUND",
        senderType: "CUSTOMER",
        content: `Yes please. Is the ${first} still in stock?`,
      },
      {
        direction: "OUTBOUND",
        senderType: "AGENT",
        content:
          `Yes — the option currently in your basket is still available. ` +
          `I can also help with delivery or returns if that is useful.`,
      },
      {
        direction: "INBOUND",
        senderType: "CUSTOMER",
        content: "How long is standard delivery?",
      },
      {
        direction: "OUTBOUND",
        senderType: "AGENT",
        content:
          "Standard UK delivery is normally shown at checkout based on your postcode. Your saved checkout link is still active.",
      },
      {
        direction: "INBOUND",
        senderType: "CUSTOMER",
        content: "Great, I have just completed the order.",
      },
      {
        direction: "OUTBOUND",
        senderType: "AGENT",
        content:
          "Great — thanks for letting me know. Your checkout has been recovered successfully.",
      },
      {
        direction: "INBOUND",
        senderType: "CUSTOMER",
        content: "Thanks for the help.",
      },
    ];
  }

  return [
    {
      direction: "OUTBOUND",
      senderType: "AUTOMATION",
      content:
        `Hi ${customer.firstName}, you left ${first} in your basket. ` +
        `Your saved checkout is here: ${checkoutUrl}`,
    },
    {
      direction: "INBOUND",
      senderType: "CUSTOMER",
      content: "Hi, I am still deciding. Can you help me with the sizing?",
    },
    {
      direction: "OUTBOUND",
      senderType: "AGENT",
      content:
        "Of course. Tell me which item you are unsure about and what fit you normally prefer.",
    },
    {
      direction: "INBOUND",
      senderType: "CUSTOMER",
      content: `It is the ${first}. I usually prefer a relaxed fit.`,
    },
    {
      direction: "OUTBOUND",
      senderType: "AGENT",
      content:
        "For a relaxed fit, the size currently in your basket should give you a little extra room without looking oversized.",
    },
    {
      direction: "INBOUND",
      senderType: "CUSTOMER",
      content: "That helps. I will have another look now.",
    },
  ];
}

function longConversation({ customer, cart, checkoutUrl }) {
  const first = firstProduct(cart);

  const pairs = [
    [
      `Hi — yes, I was looking at the ${first}. Is the size in my basket still available?`,
      "Yes. The option currently saved in your basket is still available.",
    ],
    [
      "I am between two sizes. Does it come up small?",
      "It is designed for a regular fit. If you prefer more room, staying with the larger of your usual two sizes is the safer choice.",
    ],
    [
      "I normally wear a medium but sometimes size up for layering.",
      "If you plan to layer a jumper underneath, sizing up would give you more room through the body and sleeves.",
    ],
    [
      "That makes sense. What is the return window?",
      "The exact return terms are shown by the store, but you can review them before placing the order from the checkout journey.",
    ],
    [
      "Can I still change the size from the basket link?",
      "Yes. Open the saved checkout and you can review the items before payment. If the store allows edits at that stage, you can adjust it there.",
    ],
    [
      "How much is the basket at the moment?",
      `The current basket total in this recovery is £${cart.total.toFixed(2)} before any delivery charge shown at checkout.`,
    ],
    [
      "Do I have more than one item in there?",
      `Yes. There are ${cart.items.length} different line items in the saved basket.`,
    ],
    [
      "What else is in it?",
      `Alongside the ${first}, you also have ${cart.items
        .slice(1)
        .map((item) => item.title)
        .join(", ")}.`,
    ],
    [
      "Ah yes, I remember now. Is standard delivery available?",
      "Delivery options depend on the address and are calculated in the checkout. The saved checkout link will show the available methods.",
    ],
    [
      "I am in London, so hopefully it should be straightforward.",
      "That should be easy to confirm once your postcode is entered. The checkout will show the live delivery choices.",
    ],
    [
      "Does the checkout link expire soon?",
      "The basket is still active right now. If the store changes stock or the checkout expires, the saved state may no longer be available.",
    ],
    [
      "Could you send the link again?",
      `Absolutely: ${checkoutUrl}`,
    ],
    [
      "Thanks. I am opening it now.",
      "No problem. I can stay here while you check it.",
    ],
    [
      "The items are still there. I am checking the delivery options.",
      "Great. Take your time — if anything looks unclear, tell me what you see and I can help explain it.",
    ],
    [
      "It says standard delivery is available.",
      "Perfect. If that works for you, you can continue through payment from the same checkout.",
    ],
    [
      "Before I do, can you remind me which colour the overshirt is?",
      "The saved basket shows the Stone option.",
    ],
    [
      "Good. That is the one I wanted.",
      "Great — then the basket still matches what you were looking for.",
    ],
    [
      "I am just comparing the total with another shop.",
      "Understood. The current saved basket total here is still the amount shown above, before any delivery charge.",
    ],
    [
      "The difference is small. I prefer this colour.",
      "That sounds like the main trade-off. The saved checkout is ready whenever you decide.",
    ],
    [
      "Can I come back to this chat if I close the checkout?",
      "Yes. You can continue the conversation here while the recovery remains active.",
    ],
    [
      "Okay, I am going to think about it for ten minutes.",
      "Of course. I will leave the checkout link here so it is easy to find.",
    ],
    [
      "I am back. I think I am going to order.",
      "Sounds good. Open the saved checkout, review the final delivery details, and continue when you are ready.",
    ],
    [
      "I have reached the payment step. I will finish it shortly.",
      "Great. I will keep the conversation open. If the order completes, the recovery should update accordingly.",
    ],
  ];

  const messages = [
    {
      direction: "OUTBOUND",
      senderType: "AUTOMATION",
      content:
        `Hi ${customer.firstName}, it looks like you left a basket behind. ` +
        `I can help with product questions, delivery or checkout. ${checkoutUrl}`,
    },
  ];

  for (const [customerText, agentText] of pairs) {
    messages.push(
      {
        direction: "INBOUND",
        senderType: "CUSTOMER",
        content: customerText,
      },
      {
        direction: "OUTBOUND",
        senderType: "AGENT",
        content: agentText,
      },
    );
  }

  return messages; // 47 messages: 1 initial + 23 customer/agent pairs.
}

function messageRows({
  recoveryIndex,
  detectedAt,
  messages,
}) {
  const firstMessageAt = at(detectedAt, 25 * 60 * 1000);

  return messages.map((message, index) => {
    const createdAt = at(firstMessageAt, index * 95 * 1000);
    const outbound = message.direction === "OUTBOUND";

    return {
      providerMessageId: `${MESSAGE_PREFIX}${String(recoveryIndex + 1).padStart(3, "0")}-${String(index + 1).padStart(3, "0")}`,
      direction: message.direction,
      senderType: message.senderType,
      status: outbound ? "READ" : "DELIVERED",
      content: message.content,
      createdAt,
      sentAt: outbound ? at(createdAt, 3_000) : null,
      deliveredAt: outbound ? at(createdAt, 8_000) : null,
      readAt: outbound ? at(createdAt, 25_000) : null,
    };
  });
}

function lifecycleFor({ status, detectedAt }) {
  const events = [
    {
      fromStatus: null,
      toStatus: "DETECTED",
      reason: "Abandoned checkout detected from Shopify checkout activity.",
      source: "seed:checkout-detection",
      occurredAt: detectedAt,
    },
  ];

  if (status === "DETECTED") return events;

  const messageSentAt = at(detectedAt, 25 * 60 * 1000);
  events.push({
    fromStatus: "DETECTED",
    toStatus: "MESSAGE_SENT",
    reason: "Initial recovery WhatsApp message sent.",
    source: "seed:outreach",
    occurredAt: messageSentAt,
  });

  if (status === "MESSAGE_SENT") return events;

  if (status === "EXPIRED") {
    events.push({
      fromStatus: "MESSAGE_SENT",
      toStatus: "EXPIRED",
      reason: "Recovery window expired before checkout completion.",
      source: "seed:expiry",
      occurredAt: at(detectedAt, 48 * HOUR_MS),
    });
    return events;
  }

  const engagedAt = at(detectedAt, 34 * 60 * 1000);
  events.push({
    fromStatus: "MESSAGE_SENT",
    toStatus: "ENGAGED",
    reason: "Customer replied to the recovery conversation.",
    source: "seed:customer-reply",
    occurredAt: engagedAt,
  });

  if (status === "ENGAGED") return events;

  if (status === "COMPLETED") {
    events.push({
      fromStatus: "ENGAGED",
      toStatus: "COMPLETED",
      reason: "Checkout completed after recovery conversation.",
      source: "seed:shopify-order",
      occurredAt: at(detectedAt, 2 * HOUR_MS),
    });
    return events;
  }

  if (status === "CANCELLED") {
    events.push({
      fromStatus: "ENGAGED",
      toStatus: "CANCELLED",
      reason: "Customer declined further recovery contact.",
      source: "seed:customer-declined",
      occurredAt: at(detectedAt, 70 * 60 * 1000),
    });
  }

  return events;
}

function recoveryTimestamps(status, detectedAt, messages) {
  const messageSentAt =
    status === "DETECTED" ? null : at(detectedAt, 25 * 60 * 1000);
  const engagedAt =
    ["ENGAGED", "COMPLETED", "CANCELLED"].includes(status)
      ? at(detectedAt, 34 * 60 * 1000)
      : null;
  const completedAt =
    status === "COMPLETED" ? at(detectedAt, 2 * HOUR_MS) : null;
  const expiredAt =
    status === "EXPIRED" ? at(detectedAt, 48 * HOUR_MS) : null;

  const lastMessageAt = messages.length
    ? messages[messages.length - 1].createdAt
    : detectedAt;

  const finalAt =
    completedAt ??
    expiredAt ??
    (status === "CANCELLED"
      ? at(detectedAt, 70 * 60 * 1000)
      : lastMessageAt);

  return {
    messageSentAt,
    engagedAt,
    completedAt,
    expiredAt,
    lastExternalActivityAt: finalAt,
  };
}

async function clearFixtures(shopId) {
  const recoveryResult = await prisma.checkoutRecovery.deleteMany({
    where: {
      shopId,
      checkoutToken: { startsWith: CHECKOUT_PREFIX },
    },
  });

  const customerResult = await prisma.customer.deleteMany({
    where: {
      shopId,
      shopifyCustomerId: { startsWith: CUSTOMER_PREFIX },
    },
  });

  return {
    recoveries: recoveryResult.count,
    customers: customerResult.count,
  };
}

async function main() {
  if (!process.argv.includes(CONFIRM_FLAG)) {
    throw new Error(
      `Refusing to modify the database. Re-run with ${CONFIRM_FLAG} after confirming this is a development/test database.`,
    );
  }

  const shopDomain = argument("shop") ?? DEFAULT_SHOP_DOMAIN;

  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
    select: { id: true, domain: true, status: true },
  });

  if (!shop) {
    throw new Error(`No Shop row exists for ${shopDomain}.`);
  }

  console.log(`Target shop: ${shop.domain}`);
  console.log(`Shop id: ${shop.id}`);
  console.log(`Shop status: ${shop.status}`);

  const cleared = await clearFixtures(shop.id);
  if (cleared.recoveries || cleared.customers) {
    console.log(
      `Removed previous fixture data: ${cleared.recoveries} recoveries, ${cleared.customers} customers.`,
    );
  }

  if (hasFlag("cleanup")) {
    console.log("Recovery admin fixture cleanup complete.");
    return;
  }

  // Create in reverse order so Amelia is the most recently-created seed customer
  // and is easy to find on the first Customer page.
  const customerIds = new Map();

  for (let index = CUSTOMERS.length - 1; index >= 0; index -= 1) {
    const customer = CUSTOMERS[index];

    const created = await prisma.customer.create({
      data: {
        shopId: shop.id,
        shopifyCustomerId: `${CUSTOMER_PREFIX}${String(index + 1).padStart(2, "0")}`,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        phones: {
          create: {
            phone: customer.phone,
            startedAt: at(new Date(), -(120 - index) * DAY_MS),
          },
        },
      },
      select: { id: true },
    });

    customerIds.set(index, created.id);
  }

  let globalRecoveryIndex = 0;
  let longConversationLink = null;

  for (let customerIndex = 0; customerIndex < CUSTOMERS.length; customerIndex += 1) {
    const customer = CUSTOMERS[customerIndex];
    const customerId = customerIds.get(customerIndex);

    if (!customerId) {
      throw new Error(`Missing seeded customer id for index ${customerIndex}.`);
    }

    for (
      let customerRecoveryIndex = 0;
      customerRecoveryIndex < customer.recoveryCount;
      customerRecoveryIndex += 1
    ) {
      const profile =
        RECOVERY_PROFILES[
          (globalRecoveryIndex + customerRecoveryIndex) %
            RECOVERY_PROFILES.length
        ];

      const checkoutToken =
        `${CHECKOUT_PREFIX}${String(globalRecoveryIndex + 1).padStart(3, "0")}`;

      // Spread recoveries over roughly the last 3 months, keeping the first
      // customer's examples newest so they are convenient to inspect.
      const detectedAt = at(
        new Date(),
        -(4 + globalRecoveryIndex * 52) * HOUR_MS,
      );

      const cart = cartFor(globalRecoveryIndex);
      const checkoutUrl = `https://${shop.domain}/checkouts/${checkoutToken}`;

      const rawMessages =
        profile.status === "DETECTED"
          ? []
          : profile.longConversation
            ? longConversation({ customer, cart, checkoutUrl })
            : shortConversation({
                customer,
                cart,
                checkoutUrl,
                outcome: profile.outcome,
                status: profile.status,
              });

      const messages = messageRows({
        recoveryIndex: globalRecoveryIndex,
        detectedAt,
        messages: rawMessages,
      });

      const lifecycle = lifecycleFor({
        status: profile.status,
        detectedAt,
      });

      const timestamps = recoveryTimestamps(
        profile.status,
        detectedAt,
        messages,
      );

      const inboundCount = messages.filter(
        (message) => message.direction === "INBOUND",
      ).length;
      const lastInbound = [...messages]
        .reverse()
        .find((message) => message.direction === "INBOUND");

      const generation =
        customerIndex === 0 && customerRecoveryIndex >= 9 ? 2 : 1;

      const created = await prisma.checkoutRecovery.create({
        data: {
          shopId: shop.id,
          customerId,
          checkoutToken,
          cartToken: `cart-${checkoutToken}`,
          status: profile.status,
          generation,
          currency: "GBP",
          totalPrice: cart.total.toFixed(2),
          checkoutUrl,
          lineItems: cart.items,
          detectedAt,
          lastExternalActivityAt: timestamps.lastExternalActivityAt,
          messageSentAt: timestamps.messageSentAt,
          engagedAt: timestamps.engagedAt,
          completedAt: timestamps.completedAt,
          expiredAt: timestamps.expiredAt,
          createdAt: detectedAt,
          statusHistory: {
            create: lifecycle,
          },
          ...(profile.status !== "DETECTED"
            ? {
                conversation: {
                  create: {
                    outcome: profile.outcome ?? "IN_PROGRESS",
                    languageTag: "en-GB",
                    languageSource: "SHOPIFY",
                    countryCode: "GB",
                    currencyCode: "GBP",
                    timeZone: "Europe/London",
                    inboundVersion: inboundCount,
                    lastProcessedVersion: inboundCount,
                    summary:
                      profile.longConversation
                        ? `Ongoing recovery conversation with ${customer.firstName}; customer asked detailed sizing, delivery and checkout questions.`
                        : `Seeded ${profile.outcome ?? "IN_PROGRESS"} recovery conversation for admin UI testing.`,
                    lastInboundAt: lastInbound?.createdAt ?? null,
                    lastMessageAt:
                      messages[messages.length - 1]?.createdAt ?? null,
                    createdAt: detectedAt,
                    messages: {
                      create: messages,
                    },
                  },
                },
              }
            : {}),
        },
        select: {
          id: true,
          status: true,
          customerId: true,
          conversation: {
            select: {
              id: true,
              _count: { select: { messages: true } },
            },
          },
        },
      });

      if (profile.longConversation) {
        longConversationLink = {
          customerId,
          recoveryId: created.id,
          conversationId: created.conversation?.id ?? null,
          messageCount: created.conversation?._count.messages ?? 0,
        };
      }

      console.log(
        [
          `✓ recovery ${String(globalRecoveryIndex + 1).padStart(2, "0")}`,
          `${customer.firstName} ${customer.lastName}`,
          `status=${created.status}`,
          `messages=${created.conversation?._count.messages ?? 0}`,
          `total=£${cart.total.toFixed(2)}`,
        ].join(" | "),
      );

      globalRecoveryIndex += 1;
    }
  }

  console.log("");
  console.log("Recovery admin test fixture complete.");
  console.log(`Customers: ${CUSTOMERS.length}`);
  console.log(`Recoveries: ${globalRecoveryIndex}`);
  console.log(
    "Amelia Carter has 11 recoveries, which exercises the 8-row recovery pagination.",
  );
  console.log(
    "There are 10 seeded customers, which exercises the 8-row customer pagination.",
  );

  if (longConversationLink) {
    console.log(
      `Long conversation messages: ${longConversationLink.messageCount} (exercises the 20-message pagination).`,
    );
    console.log("");
    console.log("Open the long recovery conversation directly:");
    console.log(
      `http://localhost:3000/?tenant=${encodeURIComponent(shop.id)}` +
        `&tab=logs&customerId=${encodeURIComponent(longConversationLink.customerId)}` +
        `&recoveryId=${encodeURIComponent(longConversationLink.recoveryId)}` +
        `&drawerTab=conversation`,
    );
  }

  console.log("");
  console.log("Open Recovery Logs:");
  console.log(
    `http://localhost:3000/?tenant=${encodeURIComponent(shop.id)}&tab=logs`,
  );

  console.log("");
  console.log("Cleanup:");
  console.log(
    `node scripts/seed-recovery-admin-test-data.mjs --shop=${shop.domain} --cleanup ${CONFIRM_FLAG}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
