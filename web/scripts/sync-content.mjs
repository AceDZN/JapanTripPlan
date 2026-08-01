import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

const projectDir = process.cwd();
const workspaceSourceDir = path.resolve(projectDir, "..", "JAPAN2026");
const generatedDir = path.resolve(process.cwd(), "app", "generated");
const publicDir = path.resolve(process.cwd(), "public", "markdown");
const sourceDir = await access(workspaceSourceDir)
  .then(() => workspaceSourceDir)
  .catch(() => publicDir);

const guideMeta = {
  "00-OVERVIEW.md": ["תמונת מצב", "המסלול המשפחתי השלם, סדרי העדיפויות ושערי ההזמנה", "overview"],
  "01-FLIGHTS.md": ["טיסות", "מסלול הטיסות הסגור והפרטים שעוד צריך להשלים", "flights"],
  "02-ACCOMMODATION.md": ["לינה", "המלונות המובילים, מחירים והחלטות פתוחות", "stay"],
  "03-TRANSPORT.md": ["תחבורה", "כל המעברים של המסלול השלם, כולל קיוטו, אוסקה ואוג׳י", "transport"],
  "04-ANIME-POKEMON-GHIBLI.md": ["אנימה, גיימינג וקוואי", "PokePark, נינטנדו, ג׳יבלי, UZUMASA, מנגה וחוויות קוואי", "anime"],
  "05-FOOD-GUIDE.md": ["ראמן ואוכל", "חוויות ראמן, אוכל משפחתי וארוחות העוגן של כל יום", "food"],
  "06-DAY-TRIPS.md": ["טיולי יום", "קמקורה ואנושימה, ויום טודורוקי־סטגאיה של פארקים, טוטורו ופסטיבל קארי", "daytrips"],
  "07-BAR-MITZVAH.md": ["החגיגה המשפחתית", "Tokyo Dome City, זמן משפחתי וארוחת חגיגה", "mitzvah"],
  "08-PRACTICAL-TIPS.md": ["טיפים שימושיים", "אריזה, אינטרנט, כסף, אפליקציות והתנהלות", "tips"],
  "09-DAILY-ITINERARY.md": ["המסלול היומי", "17 ימים של אנימה, גיימינג, ראמן וקוואי בקצב משפחתי", "itinerary"],
  "10-BUDGET.md": ["תקציב", "מעטפות עלות, רישום הזמנות ושליטה בהוצאות המשתנות", "budget"],
  "11-PRE-TRIP-CHECKLIST.md": ["הכנות לטיול", "מה עושים, מתי ואיפה — כרטיסים, אפליקציות, מסמכים, מזג אוויר וציוד", "checklist"],
};

await mkdir(generatedDir, { recursive: true });
await mkdir(publicDir, { recursive: true });

marked.setOptions({ gfm: true, breaks: false });

const files = (await readdir(sourceDir))
  .filter((file) => guideMeta[file] && !file.includes("ARCHIVE"))
  .sort();

const guides = [];

for (const file of files) {
  const markdown = await readFile(path.join(sourceDir, file), "utf8");
  const slug = file.replace(/^\d+-/, "").replace(/\.md$/, "").toLowerCase();
  const [title, description, category] = guideMeta[file];
  const html = await marked.parse(markdown);

  guides.push({
    slug,
    file,
    title,
    description,
    category,
    html,
    markdown,
  });

  await writeFile(path.join(publicDir, file), markdown, "utf8");
}

// `trip-content.ts` used to be written here: every guide's Markdown AND its
// rendered HTML, checked in as TypeScript. The guide pages read Convex now and
// render the Markdown themselves (`lib/markdown.ts`), so that file was a third
// copy of the trip that could silently disagree with the other two. This script
// keeps writing `public/markdown/*.md` (the download links) and `ai-context.ts`
// (the chat system prompt), both of which are genuinely derived artefacts.

// ---------------------------------------------------------------------------
// AI context: every guide's raw Markdown, for the /api/chat system prompt.
// Uses the same file set as the guides (ARCHIVE files are already excluded).
// ---------------------------------------------------------------------------

const aiContext = guides.map(({ file, title, markdown }) => ({ file, title, markdown }));

const aiContextText = aiContext
  .map((entry) => `## FILE: ${entry.file}\n\n${entry.markdown}`)
  .join("\n\n---\n\n");

const aiOutput = `// Generated from ../JAPAN2026/*.md — do not edit by hand.
export type AiContextFile = {
  file: string;
  title: string;
  markdown: string;
};

export const aiContext: AiContextFile[] = ${JSON.stringify(aiContext, null, 2)};

export const aiContextText: string = ${JSON.stringify(aiContextText)};
`;

await writeFile(path.join(generatedDir, "ai-context.ts"), aiOutput, "utf8");

console.log(
  `Synced ${guides.length} Markdown guides (public/markdown + ai-context.ts, ${aiContextText.length} context chars).`,
);
