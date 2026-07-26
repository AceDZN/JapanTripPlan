/**
 * Preloaded into a `next start` process with `--import` so the server renders
 * as if it were mid-trip. Server components call `new Date()` at render time,
 * which is the only way to reach the "today" branch of the home page from an
 * HTTP test.
 */

const FROZEN = new Date("2026-10-05T09:00:00+09:00").getTime();
const RealDate = Date;

class FrozenDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(FROZEN);
    else super(...args);
  }

  static now() {
    return FROZEN;
  }
}

globalThis.Date = FrozenDate;
