import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Refresh the shekel/dollar/euro rate once a day.
 *
 * 03:00 UTC is 06:00 in Israel and midday in Japan — comfortably after the
 * feed's own ~00:30 UTC publish, and before anybody is entering charges in
 * either place. A failed run writes nothing (see `fx.ts`); the board shows the
 * date of the rate it is actually converting at, so a missed day is visible
 * rather than silent.
 */
crons.daily("refresh fx rates", { hourUTC: 3, minuteUTC: 0 }, internal.fx.refresh, {});

export default crons;
