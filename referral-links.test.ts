import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { agentContactLinks, publicLinkStatus, publicSiteOrigin } from "../src/lib/siteOrigin";
import { REFERRAL_COOKIE, signReferral, verifyReferral } from "../src/lib/referrals";
import { GET } from "../src/app/r/[code]/route";

const firstCode = "AGFIRST2026";
const secondCode = "AGSECOND2026";
const preview = new Headers({ "x-forwarded-host": "virtuals.arena.site", "x-forwarded-proto": "https" });
const published = new Headers({ "x-forwarded-host": "virtuals.example.org", "x-forwarded-proto": "https" });

async function test() {
  const envKeys = ["SITE_URL", "NEXT_PUBLIC_SITE_URL", "REFERRAL_SECRET", "SESSION_SECRET", "VERCEL_ENV"] as const;
  const cleanEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  try {
    for (const key of envKeys) delete process.env[key];
    assert.equal(publicSiteOrigin(preview), null);
    assert.equal(publicSiteOrigin(new Headers({ host: "localhost:3000" }), "http://localhost:3000/"), null);
    assert.equal(publicSiteOrigin(new Headers({ host: "3000-test.e2b.app" }), "https://3000-test.e2b.app/"), null);
    assert.equal(publicSiteOrigin(published), "https://virtuals.example.org");
    assert.deepEqual(agentContactLinks(null, firstCode), { loginLink: null, referralLink: null });

    process.env.NEXT_PUBLIC_SITE_URL = "https://virtuals.arena.site";
    assert.equal(publicSiteOrigin(published), null);
    process.env.NEXT_PUBLIC_SITE_URL = "https://virtuals.example.org/signin";
    let origin = publicSiteOrigin(preview);
    assert.equal(origin, "https://virtuals.example.org");
    assert.equal(publicLinkStatus(origin), "referrals-not-configured");
    assert.equal(agentContactLinks(origin, firstCode).referralLink, null);
    assert.equal(agentContactLinks(origin, firstCode).loginLink, `https://virtuals.example.org/signin?agent=${firstCode}`);

    process.env.SITE_URL = "https://accounts.example.net";
    process.env.REFERRAL_SECRET = "abc123-only-for-referral-test-abcdef1234";
    origin = publicSiteOrigin(preview);
    assert.equal(publicLinkStatus(origin), "ready");
    assert.deepEqual(agentContactLinks(origin, firstCode), {
      loginLink: `https://accounts.example.net/signin?agent=${firstCode}`,
      referralLink: `https://accounts.example.net/r/${firstCode}`,
    });
    assert.equal(agentContactLinks(origin, "../bad").referralLink, null);
    assert.equal(verifyReferral(`${firstCode}.${Date.now()}.${"é".repeat(64)}`), null);

    const calls: string[] = [];
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      assert.equal(request.method, "POST");
      const rpc = new URL(request.url).pathname;
      const { p_code: code } = await request.json();
      calls.push(`${rpc}:${code}`);
      if (rpc.endsWith("/valid_referral")) return Response.json(code === firstCode || code === secondCode);
      if (rpc.endsWith("/track_referral_click")) return new Response(null, { status: 204 });
      throw new Error(`Unexpected Supabase request: ${rpc}`);
    };
    const follow = (code: string, cookie?: string) => GET(
      new NextRequest(`https://virtuals.example.org/r/${code}`, { headers: cookie ? { cookie } : undefined }),
      { params: Promise.resolve({ code }) },
    );

    const attributed = await follow(firstCode);
    assert.equal(attributed.status, 307);
    assert.equal(attributed.headers.get("location"), "/", "redirect must stay on the host that owns the cookie");
    assert.match(attributed.headers.get("cache-control") || "", /no-store/);
    const cookie = attributed.cookies.get(REFERRAL_COOKIE);
    assert.ok(cookie?.httpOnly && cookie.secure);
    assert.equal(verifyReferral(cookie.value), firstCode);
    assert.equal(calls.length, 2, "a valid click is validated and tracked once");

    const laterClick = await follow(secondCode, `${REFERRAL_COOKIE}=${signReferral(firstCode)}`);
    assert.equal(laterClick.headers.get("location"), "/");
    assert.equal(laterClick.headers.get("set-cookie"), null);
    assert.equal(calls.length, 2, "a second click never replaces first-click attribution");

    const disabled = await follow("UNAVAILABLE");
    assert.equal(disabled.headers.get("location"), "/");
    assert.equal(disabled.headers.get("set-cookie"), null);
    assert.equal(calls.length, 3, "unavailable codes do not set attribution or count as referrals");

    console.log("Public link generation and first-click referral routing passed (mocked Supabase). ");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of envKeys) {
      if (cleanEnv[key] === undefined) delete process.env[key];
      else process.env[key] = cleanEnv[key];
    }
  }
}

test().catch((error) => { console.error(error); process.exitCode = 1; });
