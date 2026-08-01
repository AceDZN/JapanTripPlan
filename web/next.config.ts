import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
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
