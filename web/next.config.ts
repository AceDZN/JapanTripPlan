import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /*
     * Pictures live in Convex storage, so every one of them is a REMOTE image
     * and has to be allow-listed by host.
     *
     * The path is scoped to `/api/storage/**` deliberately: the hostname is
     * Convex's, not ours, and an unscoped wildcard would let anyone with a
     * Convex deployment use our optimizer as a free CDN by handing us their
     * URLs. Two deployments are listed because dev and prod are separate hosts.
     *
     * Optimisation used to be OFF here (`unoptimized: true`) while images were
     * files in `public/`. Turning it on is what makes the migration pay off: a
     * 1600px stored original is transformed once per (width, quality, format)
     * and then served from the Vercel CDN for up to 31 days, so a phone in
     * Japan fetches a ~30 kB WebP rather than the 840 kB source — and Convex's
     * metered egress is touched roughly once a month per image rather than on
     * every page view.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "flippant-labrador-606.convex.cloud",
        pathname: "/api/storage/**",
      },
      {
        protocol: "https",
        hostname: "fortunate-lyrebird-190.convex.cloud",
        pathname: "/api/storage/**",
      },
    ],
  },

  logging: {
    /*
     * Do not pipe the browser console into the dev terminal.
     *
     * Next 16 forwards browser console output to the terminal, defaulting to
     * `'warn'`. In this project every single forwarded line has come from a
     * Chrome extension injecting scripts into the page — MetaMask failing to
     * connect, React DevTools, a couple of inspectors throwing inside their own
     * `injectedScript.js`. None of it is this app, and there is no origin
     * filter available: the option only takes a level, and extensions log at
     * error level too.
     *
     * The cost of turning it off is real and worth stating: the service-worker
     * RSC bug ("Cannot read properties of null (reading 'enqueueModel')") was
     * diagnosed from exactly these forwarded lines. Real client-side errors are
     * still visible in DevTools and in the browser pane's console — this only
     * stops them being mirrored here.
     *
     * Debugging something client-side? Flip this to `'error'` (or `true` for
     * everything) for the session, and expect the extension noise back with it.
     */
    browserToTerminal: false,
  },
};

export default nextConfig;
