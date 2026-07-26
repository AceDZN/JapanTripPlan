// Trip content is bundled in agent/data/content.ts and served by read_guide/get_day; no sandbox filesystem reads.
import { disableTool } from "eve/tools";

export default disableTool();
