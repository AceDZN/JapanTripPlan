/** Cover photo per guide category (categories come from the sync script). */
const guideImages: Record<string, string> = {
  overview: "/images/cities/tokyo.jpg",
  flights: "/images/days/day-01.jpg",
  stay: "/images/days/day-02.jpg",
  transport: "/images/days/day-11.jpg",
  anime: "/images/places/akihabara-electric-town.jpg",
  food: "/images/places/dotonbori.jpg",
  daytrips: "/images/cities/kamakura.jpg",
  mitzvah: "/images/places/tokyo-dome-city.jpg",
  tips: "/images/cities/kyoto.jpg",
  itinerary: "/images/days/day-09.jpg",
  budget: "/images/cities/osaka.jpg",
  checklist: "/images/days/day-17.jpg",
};

export function guideImage(category: string): string {
  return guideImages[category] ?? "/images/cities/tokyo.jpg";
}
