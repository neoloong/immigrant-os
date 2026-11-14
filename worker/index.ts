/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import type { D1BindingLike, R2BindingLike } from "../lib/runtime-env";
import { handleAccessAuth } from "../lib/access-auth";
import { handleMcp } from "../lib/mcp";
import { handleAgentTokens } from "../lib/agent-tokens";
import { agentDiscovery, agentGuide } from "../lib/agent-onboarding";
import type { AccessEnv } from "../lib/access-jwt";

interface Env extends AccessEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1BindingLike;
  BUCKET: R2BindingLike;
  AGENT_MCP_ENABLED?: string;
  AUTH_MODE?: string;
  SESSION_SECRET?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    (globalThis as typeof globalThis & {
      __IMMIGRANT_SITE_BINDINGS__?: Pick<Env, "DB" | "BUCKET">;
    }).__IMMIGRANT_SITE_BINDINGS__ = { DB: env.DB, BUCKET: env.BUCKET };
    (globalThis as typeof globalThis & {
      __IMMIGRANT_AUTH_CONFIG__?: { authMode?: string; sessionSecret?: string };
    }).__IMMIGRANT_AUTH_CONFIG__ = { authMode: env.AUTH_MODE, sessionSecret: env.SESSION_SECRET };
    const url = new URL(request.url);

    // Only these exact routes are public/independently authenticated. The web
    // Access bridge and all existing authenticated routes remain unchanged.
    const agentsEnabled = env.AGENT_MCP_ENABLED === "true";
    if (url.pathname === "/mcp") return handleMcp(request, agentsEnabled);
    if (url.pathname === "/agents" || url.pathname === "/llms.txt") {
      if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
      const guide = url.pathname === "/agents";
      return new Response(request.method === "HEAD" ? null : guide ? agentGuide(url.origin, agentsEnabled) : agentDiscovery(url.origin, agentsEnabled), {
        headers: { "content-type": guide ? "text/html; charset=utf-8" : "text/plain; charset=utf-8", "cache-control": "no-store",
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" },
      });
    }
    const authResponse = await handleAccessAuth(request, env);
    if (authResponse) return authResponse;
    if (url.pathname === "/api/agent-tokens") {
      const response = await handleAgentTokens(request, agentsEnabled);
      response.headers.set("cache-control", "private, no-store");
      return response;
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    if (url.pathname.startsWith("/api/")) {
      response.headers.set("cache-control", "private, no-store");
    }
    return response;
  },
};

export default worker;
