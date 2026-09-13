import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("promotion report uses a bounded page size", () => {
  assert.match(readReportSource(), /PROMOTION_REPORT_PAGE_SIZE = 25/);
});

test("promotion report contract keeps selected, used, exhausted, and remaining fields distinct", () => {
  const source = readReportSource();
  assert.match(source, /firstSelectedAt/);
  assert.match(source, /firstUsedAt/);
  assert.match(source, /exhaustedAt/);
  assert.match(source, /quantity - grant\.reservedQuantity - grant\.committedQuantity/);
});

function readReportSource(): string {
  return fs.readFileSync("src/lib/admin/promotion-report.ts", "utf8");
}