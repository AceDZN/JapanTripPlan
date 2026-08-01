"use client";

import Link from "next/link";
import { Authenticated, useQuery } from "convex/react";
import { ExternalLink, Heart, Loader2, MapPin, ShoppingBag } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { yen } from "@/lib/ops";

/**
 * "While you are out today, these are the things people wanted."
 *
 * A wish lands here two ways: someone pinned it to this day, or the research
 * found a shop that sits on this day's route. The second is the interesting
 * one — you are already walking past the Pokémon Center in Shibuya, and this
 * is what turns that into a reminder rather than a regret on the flight home.
 *
 * Renders nothing at all when signed out: wishes are family-only, and the day
 * page itself is public.
 */

type WishShop = {
  shop: string;
  shopJa?: string;
  area?: string;
  dayN?: number;
  priceYen?: number;
  url?: string;
  note?: string;
};

type DayWish = {
  id: string;
  title: string;
  titleEn?: string;
  titleJa?: string;
  note?: string;
  url?: string;
  priceYen?: number;
  priority: string;
  visibility: string;
  ownerName: string;
  status: string;
  whereToBuy?: WishShop[];
  images: { url: string | null; alt?: string }[];
};

function Board({ dayN }: { dayN: number }) {
  const wishes = useQuery(api.wishes.listForDay, { dayN }) as DayWish[] | undefined;

  // Undefined while loading, empty on most days — either way the section
  // should not reserve space on a page that is already dense.
  if (!wishes || wishes.length === 0) return null;

  return (
    <section className="panel day-wishes">
      <h2>
        <Heart size={16} />
        מה רצינו להשיג היום
      </h2>

      <ul className="day-wish-list">
        {wishes.map((wish) => {
          // The shops that are actually on today's route, not every shop found.
          const here = (wish.whereToBuy ?? []).filter((shop) => shop.dayN === dayN);
          const image = wish.images.find((img) => img.url);

          return (
            <li className="day-wish" key={wish.id}>
              {image?.url ? (
                <img src={image.url} alt={image.alt ?? wish.title} loading="lazy" />
              ) : null}

              <div className="day-wish-body">
                <p className="day-wish-title">
                  <strong>{wish.title}</strong>
                  {wish.status === "researching" ? (
                    <span className="chip day-wish-busy">
                      <Loader2 size={11} />
                      eve בודקת
                    </span>
                  ) : null}
                </p>

                {wish.titleEn || wish.titleJa ? (
                  <span className="name-foreign" dir="ltr">
                    {[wish.titleEn, wish.titleJa].filter(Boolean).join(" · ")}
                  </span>
                ) : null}

                <p className="day-wish-owner">
                  {wish.ownerName} · {wish.priority === "must" ? "חובה" : "רוצה"}
                  {wish.priceYen ? <span dir="ltr"> · ~{yen(wish.priceYen)}</span> : null}
                </p>

                {here.length > 0 ? (
                  <ul className="day-wish-shops">
                    {here.map((shop, index) => (
                      <li key={`${shop.shop}-${index}`}>
                        <ShoppingBag size={12} />
                        <span>
                          {shop.shop}
                          {shop.shopJa ? (
                            <span className="name-foreign" dir="ltr" lang="ja">
                              {shop.shopJa}
                            </span>
                          ) : null}
                        </span>
                        {shop.area ? (
                          <span className="day-wish-area">
                            <MapPin size={11} />
                            {shop.area}
                          </span>
                        ) : null}
                        {shop.priceYen ? (
                          <span dir="ltr" className="day-wish-price">
                            {yen(shop.priceYen)}
                          </span>
                        ) : null}
                        {shop.url ? (
                          <a href={shop.url} target="_blank" rel="noreferrer">
                            <ExternalLink size={11} />
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <Link className="text-link" href="/wishes">
        כל הרשימות
      </Link>
    </section>
  );
}

export function DayWishes({ dayN }: { dayN: number }) {
  return (
    <Authenticated>
      <Board dayN={dayN} />
    </Authenticated>
  );
}
