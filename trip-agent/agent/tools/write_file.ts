// The agent is read-only over files. Plan edits go through edit_plan_doc, which proposes a change in Convex.
import { disableTool } from "eve/tools";

export default disableTool();
