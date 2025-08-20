import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* --- Utilities: read JSON with comments (JSONC) + trailing comma cleanup --- */
function readJSONC(absPath) {
  let text = fs.readFileSync(absPath, "utf8");

  // Remove /* block */ comments
  text = text.replace(/\/\*[\s\S]*?\*\//g, "");

  // Remove // line comments
  text = text.replace(/^\s*\/\/.*$/gm, "");

  // Remove trailing commas before } or ]
  text = text.replace(/,\s*([}\]])/g, "$1");

  // Trim BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  return JSON.parse(text);
}

/* --- Env & service account --- */
const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./service-account.json";
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;

if (!fs.existsSync(SA_PATH)) {
  console.error(
    "Missing service-account.json.\n" +
    "Place it at project root or set GOOGLE_APPLICATION_CREDENTIALS to its path."
  );
  process.exit(1);
}
if (!PROJECT_ID) {
  console.error("Missing FIREBASE_PROJECT_ID env var.");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SA_PATH, "utf8"));
initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
const db = getFirestore();

/* --- Batch upsert helper --- */
async function upsertCollection(colName, items) {
  console.log(`Seeding ${colName} (${items.length} docs) ...`);
  const batchSize = 400; // Firestore max 500 ops per batch (stay under)
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    const batch = db.batch();
    for (const item of slice) {
      const id = item.id || db.collection(colName).doc().id;
      const ref = db.collection(colName).doc(id);
      const { id: _omit, ...rest } = item;
      batch.set(ref, rest, { merge: true });
    }
    await batch.commit();
  }
  console.log(`✔ Done ${colName}`);
}

/* --- Main --- */
async function main() {
  const root = path.resolve(__dirname, "..");

  const exercises = readJSONC(path.join(root, "seed-data", "exercises.json"));
  const ingredients = readJSONC(path.join(root, "seed-data", "ingredients.json"));
  const supplements = readJSONC(path.join(root, "seed-data", "supplements.json"));

  await upsertCollection("exercises", exercises);
  await upsertCollection("ingredients", ingredients);
  await upsertCollection("supplements", supplements);

  // calculator constants
  const calc = {
    activity_by_days: { "1":1.375, "2":1.375, "3":1.55, "4":1.55, "5":1.725, "6":1.725 },
    rep_ranges: { hypertrophy: [6,15], strength: [3,6] },
    sets_by_experience: { novice:[8,12], intermediate:[12,16], advanced:[14,20] }
  };
  await db.collection("calculator_constants").doc("global").set(calc, { merge: true });
  console.log("✔ Done calculator_constants/global");
}

main().then(()=>process.exit(0)).catch((e)=>{
  console.error(e);
  process.exit(1);
});
