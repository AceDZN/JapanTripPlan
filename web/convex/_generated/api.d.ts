/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as checklist from "../checklist.js";
import type * as content from "../content.js";
import type * as crons from "../crons.js";
import type * as fx from "../fx.js";
import type * as http from "../http.js";
import type * as images from "../images.js";
import type * as importData from "../importData.js";
import type * as lib_contentPolicy from "../lib/contentPolicy.js";
import type * as lib_family from "../lib/family.js";
import type * as lib_guards from "../lib/guards.js";
import type * as money from "../money.js";
import type * as private_ from "../private.js";
import type * as suggestions from "../suggestions.js";
import type * as trip from "../trip.js";
import type * as wishes from "../wishes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  checklist: typeof checklist;
  content: typeof content;
  crons: typeof crons;
  fx: typeof fx;
  http: typeof http;
  images: typeof images;
  importData: typeof importData;
  "lib/contentPolicy": typeof lib_contentPolicy;
  "lib/family": typeof lib_family;
  "lib/guards": typeof lib_guards;
  money: typeof money;
  private: typeof private_;
  suggestions: typeof suggestions;
  trip: typeof trip;
  wishes: typeof wishes;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
