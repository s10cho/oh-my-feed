import { buildMetadata } from "./generated/build-metadata.js";

export function createWorker(metadata = buildMetadata) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);

      if (url.pathname === "/healthz") {
        return Response.json(metadata, {
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }

      return env.ASSETS.fetch(request);
    },
  };
}

export default createWorker();
