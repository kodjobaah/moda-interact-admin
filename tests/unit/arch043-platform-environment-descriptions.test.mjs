import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

function checkFieldEnvironment(source, fieldExpression, ...names) {
  const line = source.split("\n").find((entry) => entry.includes(fieldExpression));
  assert.ok(line, `Missing field ${fieldExpression}`);
  assert.match(line, /withEnvironmentReference\(/, `Missing environment help for ${fieldExpression}`);
  for (const name of names) assert.ok(line.includes(`"${name}"`), `Missing ${name} for ${fieldExpression}`);
}

test("Shopify, R2, WooCommerce and Meta inputs disclose their environment references", () => {
  const source = read("src/lib/admin/platform-configuration/secrets-contracts.ts");
  checkFieldEnvironment(source, 'secret("apiKey", "API key")', "SHOPIFY_API_KEY");
  checkFieldEnvironment(source, 'secret("apiSecret", "API secret")', "SHOPIFY_API_SECRET");
  checkFieldEnvironment(source, 'secret("accessKeyId", "R2 access key ID")', "MERCHANT_KNOWLEDGE_R2_ACCESS_KEY_ID");
  checkFieldEnvironment(source, 'secret("consumerKey", "Consumer key")', "WOOCOMMERCE_CUSTOMER_KEY");
  checkFieldEnvironment(source, 'secret("consumerSecret", "Consumer secret")', "WOOCOMMERCE_CUSTOMER_SECRET");
  checkFieldEnvironment(source, 'secret("verifyToken", "Verify token")', "WHATSAPP_VERIFY_TOKEN");
  checkFieldEnvironment(source, 'secret("accessToken", "Partner access token")', "SHOPIFY_PARTNER_ACCESS_TOKEN", "SHOPIFY_PARTNER_API_TOKEN");
  checkFieldEnvironment(source, 'secret("openAiApiKey", "OpenAI API key", true)', "OPENAI_API_KEY", "WHATSAPP_OPENAI_API_KEY");
});

test("Policy inputs disclose known environment references without changing configuration semantics", () => {
  const source = read("src/lib/admin/platform-configuration/contracts.ts");
  checkFieldEnvironment(source, 'integer("workerConcurrency", "Worker concurrency"', "WOO_COUPON_SYNC_WORKER_CONCURRENCY");
  checkFieldEnvironment(source, 'model("groqModelId", "Groq model ID")', "GROQ_TRANSCRIPTION_MODEL");
  checkFieldEnvironment(source, 'grafana("baseUrl", "Grafana base URL")', "GRAFANA_BASE_URL");
  assert.doesNotMatch(source, /process\.env\./);
});

test("Environment references are displayed through the existing field-description renderer", () => {
  const field = read("src/components/admin/platform-configuration/configuration-field.tsx");
  assert.match(field, />\{field\.description\}<\/p>/);
});
