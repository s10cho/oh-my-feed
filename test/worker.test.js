import assert from "node:assert/strict";
import test from "node:test";
import { createWorker } from "../src/worker.js";

const metadata = {
  variant: "variant_b_discover",
  branch: "spike/ai-tools-network",
  commitSha: "fcd9bb7a0f7c929d77aaba5ba799c1442233d1a3",
  buildTimestamp: "2026-09-01T12:00:00.000Z",
};

function createAssets() {
  return {
    fetch(request) {
      return new Response(`asset:${new URL(request.url).pathname}`, {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    },
  };
}

test("healthz returns only public deployment metadata", async () => {
  const worker = createWorker(metadata);

  const response = await worker.fetch(
    new Request("https://discover.ohmyfeed.stream/healthz"),
    { ASSETS: createAssets(), SECRET_VALUE: "must-not-leak" },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.deepEqual(await response.json(), metadata);
});

test("non-health requests are served by Workers Static Assets", async () => {
  const worker = createWorker(metadata);
  const request = new Request("https://discover.ohmyfeed.stream/styles.css");

  const response = await worker.fetch(request, { ASSETS: createAssets() });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "asset:/styles.css");
});
