import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/security-headers';

// Vercel sets this at build time. The release pipeline reads it back from
// production to know when the deployment it asked for is the one serving.
const commit = process.env.VERCEL_GIT_COMMIT_SHA;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16 writes its own CLAUDE.md and AGENTS.md on dev. CLAUDE.md is the
  // team's working agreement and is authored by hand, so Next must not
  // clobber it.
  agentRules: false,
  // Fail the production build on a type error rather than shipping it.
  // Next 16 dropped the `eslint` build key; linting runs as its own
  // script and in CI.
  typescript: { ignoreBuildErrors: false },
  experimental: {
    // A photograph goes through a server action. Next refuses anything
    // over 1 MB by default, which is a phone photograph that could not
    // be drawn down in the browser (HEIC) — refused with an error page.
    // Photographs are drawn down to 2000 px first; this is the ceiling
    // for the ones that cannot be, kept under the 4.5 MB a Vercel
    // function accepts at all.
    serverActions: { bodySizeLimit: '4mb' },
  },
  async headers() {
    // Antetele de securitate merg pe tot, mereu. Auditul le-a găsit
    // lipsă cu totul (R2): fără `frame-ancestors`, contul se pune
    // într-un iframe străin; fără `Referrer-Policy`, id-urile din URL
    // pleacă la fiecare navigare spre exterior.
    const headers = [...securityHeaders(process.env.NEXT_PUBLIC_SUPABASE_URL)];
    if (commit) headers.push({ key: 'x-app-commit', value: commit });
    return [{ source: '/:path*', headers }];
  },
};

export default nextConfig;
