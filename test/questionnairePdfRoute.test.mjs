import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

let fixture;
globalThis.__questionnairePdfRouteFixture = () => fixture;

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/app/api/matter/[matterId]/route") {
      const source = `export async function GET() {
        const fixture = globalThis.__questionnairePdfRouteFixture();
        fixture.calls += 1;
        return fixture.response;
      }`;
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    if (specifier.startsWith("@/lib/")) {
      return {
        url: pathToFileURL(path.resolve(`src/lib/${specifier.slice(6)}.js`)).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { GET } = await import("../src/app/api/matter/[matterId]/questionnaire/pdf/route.js");
hooks.deregister();

test("PDF route preserves an authentication failure without generating a document", async () => {
  fixture = {
    calls: 0,
    response: Response.json({ success: false, error: "Admin session is required" }, { status: 401 }),
  };
  const response = await GET({}, { params: Promise.resolve({ matterId: "matter-1" }) });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(fixture.calls, 1);
});

test("PDF route returns a private attachment containing the recorded answers", async () => {
  fixture = {
    calls: 0,
    response: Response.json({
      success: true,
      application: { id: "app-1", type: "Protection Visa (Subclass 866)", reference: "Jane Doe - Protection Visa" },
      questionnaire: {
        profiles: [{ id: "main", relationship: "main_applicant", given_names: "Jane", family_name: "Doe" }],
        profiles_data: { main: { details: { given_names: "Jane", family_name: "Doe", has_passport: false } } },
      },
      questionnaireDefinition: null,
    }),
  };

  const response = await GET({}, { params: Promise.resolve({ matterId: "matter-1" }) });
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="Jane-Doe-questionnaire-answers.pdf"; filename*=UTF-8\'\'Jane%20Doe-questionnaire-answers.pdf',
  );
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(Number(response.headers.get("content-length")), bytes.byteLength);
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("ascii"), "%PDF-");
  assert.equal(fixture.calls, 1);
});
