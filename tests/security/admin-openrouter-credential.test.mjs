import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function source(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

const [page, action, service, panel, form, submitButton, crypto] =
  await Promise.all([
    source("src/app/(protected)/commerce-models/credentials/page.tsx"),
    source("src/app/actions/openrouter-credential.ts"),
    source("src/lib/admin/openrouter-credential.ts"),
    source(
      "src/components/admin/openrouter-credential/openrouter-credential-panel.tsx",
    ),
    source(
      "src/components/admin/openrouter-credential/openrouter-credential-form.tsx",
    ),
    source(
      "src/components/admin/openrouter-credential/openrouter-credential-submit-button.tsx",
    ),
    source("src/lib/admin/openrouter-credential-crypto.ts"),
  ]);

test("protected page and status read authorize Platform Admin independently and select no envelope fields", () => {
  assert.match(page, /requirePlatformAdminPage\(\)/);
  assert.match(page, /getOpenRouterCredentialStatus\(\)/);
  assert.match(page, /canMutate=\{principal\.role === "SUPER_ADMIN"\}/);
  assert.match(service, /requirePlatformAdminRead\(\)/);
  assert.match(
    service,
    /where: \{ environment \},\s*select: \{\s*editVersion: true,\s*updatedAt: true,\s*updatedByAdminId: true,/,
  );
  assert.doesNotMatch(
    service.slice(
      service.indexOf("export type OpenRouterCredentialStatus"),
      service.indexOf("export type OpenRouterCredentialMutation"),
    ),
    /ciphertext|nonce|authTag|keyId|secret|fingerprint|hash/,
  );
});

test("all three direct Server Actions independently require SUPER_ADMIN before parsing or mutation", () => {
  for (const name of [
    "setOpenRouterCredentialAction",
    "replaceOpenRouterCredentialAction",
    "removeOpenRouterCredentialAction",
  ]) {
    const start = action.indexOf(`export async function ${name}`);
    assert.ok(start >= 0, `${name} should be exported`);
    const next = action.indexOf("export async function", start + 1);
    const body = action.slice(start, next < 0 ? undefined : next);
    assert.ok(
      body.indexOf("requireSuperAdmin()") < body.indexOf("return finish("),
    );
  }
  assert.match(action, /principal\.role !== "SUPER_ADMIN"/);
  assert.match(action, /revalidatePath\("\/commerce-models\/credentials"\)/);
  assert.match(action, /OpenRouter credential update could not be completed\./);
  assert.doesNotMatch(action, /return\s+cause|JSON\.stringify\(cause/);
});

test("UI exposes role-appropriate controls, local typed-value visibility, and no stored reveal, test, or environment selection", () => {
  const ui = `${panel}\n${form}`;
  assert.match(panel, /canMutate && !status\.configured/);
  assert.match(panel, /canMutate && status\.configured/);
  assert.match(form, /Set credential/);
  assert.match(form, /Replace credential/);
  assert.match(panel, /Remove credential/);
  assert.match(form, /type=\{showSecret \? "text" : "password"\}/);
  assert.match(form, /Show entered credential/);
  assert.match(form, /Hide entered credential/);
  assert.match(form, /A saved\s+credential cannot be viewed from Admin\./);
  assert.match(form, /autoComplete="new-password"/);
  assert.match(form, /spellCheck=\{false\}/);
  assert.doesNotMatch(
    `${page}\n${ui}`,
    /environment selector|<select|Reveal|Test credential/i,
  );
  assert.match(panel, /name="confirmation"/);
});

test("all mutation controls acquire synchronous single-flight gates, show pending state, and clear submitted secrets", () => {
  for (const component of [form, panel]) {
    assert.match(component, /const inFlight = useRef\(false\)/);
    assert.match(component, /if \(inFlight\.current[\s\S]*?return;/);
    assert.ok(
      component.indexOf("inFlight.current = true") <
        component.indexOf("await "),
    );
    assert.match(component, /flushSync\(\(\) => \{/);
    assert.ok(
      component.indexOf("setPending(true)") < component.indexOf("await "),
    );
    assert.match(component, /aria-busy=\{pending\}/);
    assert.match(component, /finally[\s\S]*?inFlight\.current = false/);
  }
  assert.match(form, /secretRef\.current\.value = ""/);
  assert.match(form, /setShowSecret\(false\)/);
  assert.match(form, /Saving OpenRouter credential…/);
  assert.match(panel, /Removing OpenRouter credential…/);
  assert.match(submitButton, /disabled=\{disabled \|\| pending\}/);
  assert.match(submitButton, /aria-busy=\{pending\}/);
  assert.match(submitButton, /pendingLabel: string/);
  assert.match(submitButton, /pending \? pendingLabel : children/);
  assert.match(form, /Setting credential…/);
  assert.match(form, /Replacing credential…/);
  assert.match(panel, /pendingLabel="Removing credential…"/);
  assert.match(form, /router\.refresh\(\)/);
  assert.match(panel, /router\.refresh\(\)/);
  assert.ok(
    form.indexOf('secretRef.current.value = ""') <
      form.indexOf("setMessage(result.message)"),
  );
  assert.match(
    form,
    /const \[refreshRequired, setRefreshRequired\] = useState\(false\)/,
  );
  assert.match(form, /if \(inFlight\.current \|\| refreshRequired\) return;/);
  assert.match(
    form,
    /if \(result\.refreshRequired\) setRefreshRequired\(true\)/,
  );
  assert.match(form, /const locked = refreshRequired/);
  assert.doesNotMatch(form, /conflictVersion === editVersion/);
  assert.match(
    panel,
    /if \(result\.refreshRequired\) setConflictVersion\(status\.editVersion\)/,
  );
});

test("set mode is not mistaken for an existing refresh conflict when editVersion is null", () => {
  assert.match(
    form,
    /const \[refreshRequired, setRefreshRequired\] = useState\(false\)/,
  );
  assert.match(form, /if \(inFlight\.current \|\| refreshRequired\) return;/);
  assert.doesNotMatch(form, /conflictVersion === editVersion/);
});

test("credential form data is captured before pending state disables successful controls", () => {
  for (const [name, component] of [
    ["set/replace", form],
    ["remove", panel],
  ]) {
    const snapshot = component.indexOf(
      "const formData = new FormData(event.currentTarget);",
    );
    const pending = component.indexOf("flushSync(() => {");
    assert.ok(snapshot >= 0, `${name} should capture FormData`);
    assert.ok(pending >= 0, `${name} should enter pending state`);
    assert.ok(
      snapshot < pending,
      `${name} must capture enabled form controls before pending disables them`,
    );
  }
});

test("production credential code has no decrypt, provider call, or secret-derived logging", () => {
  assert.doesNotMatch(
    `${service}\n${action}\n${panel}\n${form}\n${submitButton}\n${crypto}`,
    /createDecipheriv|OPENROUTER_API_KEY|fetch\(|console\.|createHash|fingerprint|digest\(/i,
  );
});
