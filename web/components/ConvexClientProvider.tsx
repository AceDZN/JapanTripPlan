"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

/**
 * Client-side Convex, authenticated by Clerk.
 *
 * `ConvexProviderWithClerk` forwards the Clerk JWT (template "convex") on every
 * request, which is what lets `requireFamily()` identify who is calling.
 *
 * OFFLINE: this must never be load-bearing for reading the trip. Clerk's script
 * comes from its own origin and will not load in a Tokyo basement with no
 * signal. Every trip page is server-rendered from Convex and precached by
 * `public/sw.js`, so a failure here leaves the itinerary fully readable and
 * only makes sign-in and the private sections inert. Public Convex queries do
 * not require a token, so live updates still work whenever the network does.
 */
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
