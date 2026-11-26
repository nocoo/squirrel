import { describe, expect, it, vi } from "vitest";
import {
  AUTHOR_PROFILE_URL,
  fetchAuthorProfile,
  hashEmail,
  normalizeEmail,
  parseAuthorProfile,
} from "../src/lib/author-profile";

describe("author-profile", () => {
  it("normalizes and SHA-256 hashes emails consistently", async () => {
    expect(normalizeEmail("  Nocoo@Hexly.AI ")).toBe("nocoo@hexly.ai");
    const h1 = await hashEmail("nocoo@hexly.ai");
    const h2 = await hashEmail("  NOCOO@hexly.ai  ");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("parses valid profile responses and rejects invalid shapes", () => {
    expect(parseAuthorProfile({ name: "Nocoo", avatar: "https://lizheng.blog/a.png" })).toEqual({
      name: "Nocoo",
      avatar: "https://lizheng.blog/a.png",
    });
    expect(parseAuthorProfile({ name: "", avatar: "" })).toEqual({ name: null, avatar: null });
    expect(parseAuthorProfile(null)).toEqual({ name: null, avatar: null });
    expect(parseAuthorProfile("invalid")).toEqual({ name: null, avatar: null });
  });

  it("queries hashed endpoint without raw email and handles hits/misses gracefully", async () => {
    const email = "nocoo@hexly.ai";
    const expectedHash = await hashEmail(email);

    const hitFetch = vi.fn<typeof fetch>(async () =>
      Response.json({ name: "Nocoo", avatar: "https://lizheng.blog/avatar.png" }),
    );
    const hit = await fetchAuthorProfile(email, AUTHOR_PROFILE_URL, hitFetch);
    expect(hit).toEqual({ name: "Nocoo", avatar: "https://lizheng.blog/avatar.png" });
    expect(hitFetch).toHaveBeenCalledTimes(1);
    const calledUrl = String(hitFetch.mock.calls[0]?.[0]);
    expect(calledUrl).toBe(`${AUTHOR_PROFILE_URL}?hash=${expectedHash}`);
    expect(calledUrl).not.toContain("nocoo");

    const notFoundFetch = vi.fn<typeof fetch>(
      async () => new Response("Not Found", { status: 404 }),
    );
    expect(await fetchAuthorProfile(email, AUTHOR_PROFILE_URL, notFoundFetch)).toEqual({
      name: null,
      avatar: null,
    });

    const rateLimitFetch = vi.fn<typeof fetch>(
      async () => new Response("Too Many Requests", { status: 429 }),
    );
    expect(await fetchAuthorProfile(email, AUTHOR_PROFILE_URL, rateLimitFetch)).toEqual({
      name: null,
      avatar: null,
    });

    const badJsonFetch = vi.fn<typeof fetch>(async () => new Response("not-json", { status: 200 }));
    expect(await fetchAuthorProfile(email, AUTHOR_PROFILE_URL, badJsonFetch)).toEqual({
      name: null,
      avatar: null,
    });

    const failFetch = vi.fn<typeof fetch>(async () => {
      throw new Error("timeout");
    });
    expect(await fetchAuthorProfile(email, AUTHOR_PROFILE_URL, failFetch)).toEqual({
      name: null,
      avatar: null,
    });
  });
});
