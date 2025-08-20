/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Weightio Cloud Functions (Express)
 * - /api/health (GET)
 * - /api/recalculateIndexes (POST)
 * - /api/generatePlan (POST)
 * - /api/adaptPlan (POST)
 *
 * Implements: Mifflin/Katch BMR, activity by schedule days, BMI/WHtR,
 * accuracy meter + next_best_input, plan split by days, sets by experience with goal modifiers,
 * equipment filtering (incl. bodyweight_only), injuries filtering, calories & macros per goal,
 * ingredient allocator (ingredient-only meals), and adaptation rules.
 *
 * Region: asia-northeast1 (Tokyo)
 */

import express from 'express';
import cors from 'cors';
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';

setGlobalOptions({ region: 'asia-northeast1' });

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

// -----------------------------
// Types
// -----------------------------
type Sex = 'male' | 'female';
type AgeRange = '<18' | '18–24' | '18-24' | '25–34' | '25-34' | '35–44' | '35-44' | '45–54' | '45-54' | '55–60' | '55-60' | '>60';
type Experience = 'novice' | 'intermediate' | 'advanced';
type Equipment = 'full_gym' | 'dumbbells_only' | 'bands_only' | 'bodyweight_only';
type Goal = 'fat_loss' | 'lean_mass' | 'strength' | 'recomp' | 'hypertrophy';
type BudgetTier = 'low' | 'medium' | 'high';
type Injury =
  | 'shoulder' | 'elbow' | 'wrist' | 'low_back' | 'hip' | 'knee' | 'ankle';

interface Overrides { BMR?: number | null; TDEE?: number | null; BMI?: number | null; }
interface IndexReqBase {
  sex: Sex;
  age_range: AgeRange;
  height_cm?: number;
  weight_kg?: number;
  bodyfat_pct?: number;
  waist_cm?: number;
  overrides?: Overrides;
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface RecalcReq extends IndexReqBase {}
interface GenerateReq extends IndexReqBase {
  goal: Goal;
  schedule_days: 1 | 2 | 3 | 4 | 5 | 6 | 7; // 7 → force 6 + 1 recovery
  equipment: Equipment;
  experience: Experience;
  injuries?: Injury[];
  budget_tier: BudgetTier;
  meals_per_day?: 3 | 4 | 5;
}
interface ReadinessPayload {
  sleep_h: number;
  soreness: Record<string, number>; // e.g., {chest:1..5,...}
  stress: number;
  motivation: number;
}
interface AdaptReq {
  current_plan: any;
  readiness: ReadinessPayload;
  last_week_adherence_pct?: number;
  weight_trend_2w?: 'below' | 'on_target' | 'above';
}

// -----------------------------
// Constants per plan
// -----------------------------
const ACTIVITY_BY_DAYS: Record<string, number> = {
  '1': 1.375, '2': 1.375, '3': 1.55, '4': 1.55, '5': 1.725, '6': 1.725
};

const REP_RANGES: Record<'hypertrophy' | 'strength', Record<Experience, [number, number]>> = {
  hypertrophy: {
    novice: [8, 12],
    intermediate: [6, 12], 
    advanced: [5, 10]
  },
  strength: {
    novice: [5, 6],
    intermediate: [3, 6],
    advanced: [2, 5]
  }
};

const SETS_BY_EXPERIENCE: Record<Experience, [number, number]> = {
  novice: [8, 12],
  intermediate: [12, 16],
  advanced: [14, 20]
};

const RIR_BY_EXPERIENCE: Record<'hypertrophy' | 'strength', Record<Experience, string>> = {
  hypertrophy: {
    novice: '2–3',
    intermediate: '1–2',
    advanced: '0–2'
  },
  strength: {
    novice: '2',
    intermediate: '1–2', 
    advanced: '0–1'
  }
};

const REST_TIMES: Record<Experience, string> = {
  novice: '90–120s',
  intermediate: '120–180s',
  advanced: '2–3+ min'
};

const PROGRESSION_HINTS: Record<Experience, string> = {
  novice: 'If reps hit top, +5% next time',
  intermediate: 'If reps hit top, +2–2.5% or +1 rep',
  advanced: 'Microload +1–2%; add back-off set if fresh'
};

// Default meals per day by goal (as per project requirements)
const DEFAULT_MEALS_BY_GOAL: Record<Goal, 2|3|4|5> = {
  fat_loss: 3,
  lean_mass: 4,
  strength: 3,
  recomp: 3,
  hypertrophy: 4  // muscle building gets 4 meals like lean_mass
};

// -----------------------------
// New meal planning types
// -----------------------------
type PortionMeta = {
  unit?: "g" | "piece";
  typical_g?: number;
  min_g?: number; max_g?: number; step_g?: number;
  grams_per_piece?: number;
  min_pieces?: number; max_pieces?: number; step_pieces?: number;
};

type IngredientDocV2 = {
  id?: string;                            // Firestore document ID
  name: string;
  category: "protein" | "carb" | "veg" | "fat";
  macro_per_100g: { kcal: number; p: number; c: number; f: number };
  typical_portion_g?: number;             // legacy
  budget_tier: BudgetTier;
  notes?: string;
  portion?: PortionMeta;                   // NEW
  availability_score?: number;             // optional
};

// Plan structure types - removed unused IngredientOption type

type MealOptions = {
  protein_opts: any[];
  carb_opts: any[];
  veg_opts: any[];
  fat_opts: any[];
};

type IngredientsPlan = {
  meals: MealOptions[];
};

type PortionCandidate = {
  grams: number;           // resolved grams (even for "piece" unit)
  p: number; c: number; f: number; kcal: number;
  label?: string;          // e.g., "2 pcs" for eggs
};

type MealCombo = {
  items: Array<{ ingredientId: string; name: string; grams: number; label?: string; p:number;c:number;f:number;kcal:number; category:string; }>;
  totP: number; totC: number; totF: number; totK: number;
  score: number;
};

// Valid muscle groups for exercise mapping
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MUSCLE_GROUPS = [
  'chest', 'back', 'quads', 'hams', 'glutes', 'shoulders', 
  'triceps', 'biceps', 'rear_delts', 'upper_chest', 'lats', 'calves', 'core'
] as const;
type Muscle = typeof MUSCLE_GROUPS[number];

// Exercise and ingredient data will be loaded from Firestore collections
// This matches the seed data structure from /seed-data/exercises.json and /ingredients.json

// Basic mapping of injuries → exercises to avoid (simple heuristic)
const INJURY_AVOID: Record<Injury, string[]> = {
  shoulder: ['ohp', 'pike_pushup', 'db_ohp', 'handstand', 'lateral_raise'],
  elbow: ['triceps', 'skullcrusher', 'dips'],
  wrist: ['pushup', 'bench_press', 'db_press'],
  low_back: ['deadlift', 'rdl', 'back_squat', 'hip_hinge'],
  hip: ['deep_squat', 'split_squat'],
  knee: ['squat', 'lunge', 'leg_press', 'step_up'],
  ankle: ['calf_raises', 'step_up', 'jump']
};

// Data structures matching seed data format
interface Exercise {
  id: string;
  name: string;
  muscles: string[];
  equipment: string[];
  movement: 'compound' | 'isolation';
  cues: string[];
  regressions: string[];
  progressions: string[];
}

// Legacy ingredient types removed - now using IngredientDocV2 directly

// -----------------------------
// Firestore Data Access
// -----------------------------
async function getExercises(): Promise<Exercise[]> {
  const snapshot = await db.collection('exercises').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exercise));
}

// getIngredients removed - now using fetchIngredientsByTierV2 directly

// Cache for performance - in production you might want Redis or memory cache
let exerciseCache: Exercise[] | null = null;
// ingredientCache removed - now using direct Firestore queries

async function getCachedExercises(): Promise<Exercise[]> {
  if (!exerciseCache) {
    exerciseCache = await getExercises();
  }
  return exerciseCache;
}

// getCachedIngredients removed - now using fetchIngredientsByTierV2 directly

// -----------------------------
// Helpers
// -----------------------------
function toNumberOrUndefined(n: any): number | undefined {
  const v = Number(n);
  return Number.isFinite(v) ? v : undefined;
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function mapAgeRangeToNumeric(age_range: AgeRange): number {
  const ar = (age_range as string).replace('-', '–');
  switch (ar) {
    case '<18': return 16;
    case '18–24': return 21;
    case '25–34': return 29;
    case '35–44': return 39;
    case '45–54': return 49;
    case '55–60': return 57;
    case '>60': return 65;
    default: return 29;
  }
}

function computeFFMI(kg?: number, cm?: number, bf?: number | null) {
    if (!kg || !cm || bf == null) return null;
    const height_m = cm / 100;
    const lbm = kg * (1 - bf / 100);           // Lean body mass (kg)
    return +(lbm / (height_m * height_m)).toFixed(1); // Raw FFMI
}

function mifflin(sex: Sex, kg?: number, cm?: number, age?: number): number | null {
  if (!kg || !cm || !age) return null;
  const base = 10 * kg + 6.25 * cm - 5 * age;
  return Math.round(sex === 'male' ? base + 5 : base - 161);
}
function katch(kg?: number, bodyfat_pct?: number): number | null {
  if (!kg || bodyfat_pct == null) return null;
  const LBM = kg * (1 - bodyfat_pct / 100);
  return Math.round(370 + 21.6 * LBM);
}

function activityMultiplier(days: number): number {
  const d = clamp(Math.floor(days), 1, 6);
  return ACTIVITY_BY_DAYS[String(d)] ?? 1.55;
}

function accuracyBand(req: IndexReqBase): { accuracy: 'low' | 'med' | 'high' | 'highest'; next_best_input: string | null } {
  const hasSex = !!req.sex;
  const hasWeight = req.weight_kg != null;
  const hasHeight = req.height_cm != null;
  const hasAgeRange = !!req.age_range;
  const hasBodyfat = req.bodyfat_pct != null;
  const hasWaist = req.waist_cm != null;

  if (hasBodyfat && hasWaist && hasHeight && hasWeight && hasAgeRange && hasSex) {
    return { accuracy: 'highest', next_best_input: null };
  }
  if (hasBodyfat && hasHeight && hasWeight && hasAgeRange && hasSex) {
    return { accuracy: 'high', next_best_input: hasWaist ? null : 'waist_cm' };
  }
  if (hasHeight && hasWeight && hasAgeRange && hasSex) {
    return { accuracy: 'med', next_best_input: 'bodyfat_pct' };
  }
  if (hasSex && (hasWeight || hasHeight)) {
    return { accuracy: 'low', next_best_input: hasHeight ? 'weight_kg' : 'height_cm' };
  }
  // minimal
  return { accuracy: 'low', next_best_input: 'height_cm' };
}

// Calories per goal (use midpoints of the recommended ranges)
export function setCalories(TDEE: number, goal: Goal): number {
  if (!TDEE || !Number.isFinite(TDEE)) return 0;
  switch (goal) {
    case 'fat_loss': return Math.round(TDEE * 0.85); // 0.80–0.90
    case 'lean_mass': return Math.round(TDEE * 1.08); // 1.05–1.10
    case 'hypertrophy': return Math.round(TDEE * 1.05); // slight surplus for muscle growth
    case 'recomp':
    case 'strength': default: return Math.round(TDEE * 1.00); // 0.95–1.05 → 1.00
  }
}

export function setMacros(sex: Sex, weight_kg: number | undefined, kcal: number, goal: Goal) {
  const w = weight_kg ?? 70;
  const protein_per_kg = goal === 'fat_loss' ? 2.0 : 1.8; // within 1.6–2.2
  const fat_per_kg = goal === 'fat_loss' ? 0.6 : 0.7;     // within 0.6–1.0

  const protein_g = Math.round(w * protein_per_kg);
  const fat_g = Math.round(w * fat_per_kg);
  const kcal_from_protein = protein_g * 4;
  const kcal_from_fat = fat_g * 9;
  const carb_kcal = Math.max(0, kcal - (kcal_from_protein + kcal_from_fat));
  const carb_g = Math.max(0, Math.round(carb_kcal / 4));

  return { protein_g, fat_g, carb_g };
}

function computeIndexes(req: IndexReqBase) {
  const age = mapAgeRangeToNumeric(req.age_range);
  const kg = toNumberOrUndefined(req.weight_kg);
  const cm = toNumberOrUndefined(req.height_cm);
  const bf = toNumberOrUndefined(req.bodyfat_pct);
  const waist = toNumberOrUndefined(req.waist_cm);

  // Preferred: Katch when bodyfat present; else Mifflin
  const bmr_katch = katch(kg, bf);
  const bmr_mifflin = mifflin(req.sex, kg, cm, age);
  const overrides = req.overrides ?? {};
  let method: 'katch' | 'mifflin' | 'override' = 'mifflin';

  let BMR: number | null = null;
  if (overrides.BMR != null) {
    BMR = clamp(overrides.BMR, 800, 3000);
    method = 'override';
  } else if (bmr_katch != null) {
    BMR = bmr_katch;
    method = 'katch';
  } else if (bmr_mifflin != null) {
    BMR = bmr_mifflin;
    method = 'mifflin';
  }

  // BMI
  let BMI: number | null = null;
  if (overrides.BMI != null) {
    BMI = clamp(overrides.BMI, 10, 60);
  } else if (kg && cm) {
    const m = cm / 100;
    BMI = +(kg / (m * m)).toFixed(1);
  }

  // WHtR (risk context only)
  let WHtR: number | null = null;
  if (waist && cm) {
    WHtR = +(waist / cm).toFixed(2);
  }
  const FFMI = computeFFMI(kg, cm, bf);

  // FFMI omitted (context only) — can be added later

  return { BMR, method, BMI, WHtR, FFMI, age, kg, cm, bf, overrides };
}

function computeTDEE(BMR: number | null, schedule_days?: number, TDEE_override?: number | null) {
  if (TDEE_override != null) return clamp(TDEE_override, 1200, 5000);
  if (!BMR) return null;
  const mult = activityMultiplier(schedule_days ?? 3);
  return Math.round(BMR * mult);
}

function detectOverrideWarnings(computed: number | null, override?: number | null, label?: string) {
  const warnings: string[] = [];
  if (computed != null && override != null) {
    const diff = Math.abs(override - computed) / computed;
    if (diff > 0.15) {
      warnings.push(`${label ?? 'value'} override differs >15% from computed (${computed} vs ${override}).`);
    }
  }
  return warnings;
}

// -----------------------------
// Workout generation
// -----------------------------
function setsTarget(experience: Experience, goal: Goal): number {
  const [lo, hi] = SETS_BY_EXPERIENCE[experience];
  let mid = Math.round((lo + hi) / 2);
  if (goal === 'strength') mid = Math.round(mid * 0.8);
  if (goal === 'fat_loss') mid = Math.round(mid * 0.85);
  return clamp(mid, 6, 22);
}

async function chooseExercise(equipment: Equipment, muscle: Muscle, injuries: Injury[] = []): Promise<string> {
  const exercises = await getCachedExercises();
  
  // Find exercises that target the muscle and are compatible with equipment
  const candidates = exercises.filter(exercise => {
    // Check if exercise targets the muscle
    if (!exercise.muscles.includes(muscle)) return false;
    
    // Check equipment compatibility based on equipment type
    const hasCompatibleEquipment = checkEquipmentCompatibility(exercise.equipment, equipment);
    if (!hasCompatibleEquipment) return false;
    
    // Filter out based on injuries
    const avoidTokens = new Set(injuries.flatMap((inj) => INJURY_AVOID[inj] || []));
    for (const token of avoidTokens) {
      if (exercise.id.includes(token) || exercise.name.toLowerCase().includes(token)) {
        return false;
    }
    }
    
    return true;
  });
  
  // Prioritize compound movements, then by alphabetical order for consistency
  candidates.sort((a, b) => {
    if (a.movement === 'compound' && b.movement === 'isolation') return -1;
    if (a.movement === 'isolation' && b.movement === 'compound') return 1;
    return a.name.localeCompare(b.name);
  });
  
  return candidates[0]?.id ?? `${muscle}_fallback_exercise`;
}

function checkEquipmentCompatibility(exerciseEquipment: string[], userEquipment: Equipment): boolean {
  switch (userEquipment) {
    case 'full_gym':
      return true; // Full gym has everything
    case 'dumbbells_only':
      return exerciseEquipment.includes('dumbbell') || exerciseEquipment.includes('bodyweight');
    case 'bands_only':
      return exerciseEquipment.includes('band') || exerciseEquipment.includes('bodyweight');
    case 'bodyweight_only':
      return exerciseEquipment.includes('bodyweight');
    default:
      return false;
  }
}

function splitByDays(days: number): Array<{ day: number; muscles: Muscle[] }> {
  const d = clamp(Math.floor(days), 1, 7);
  if (d <= 1) return [{ day: 1, muscles: ['chest', 'back', 'quads', 'hams', 'glutes', 'shoulders', 'triceps', 'biceps', 'core'] }];
  if (d === 2) return [
    { day: 1, muscles: ['chest', 'upper_chest', 'shoulders', 'triceps', 'core'] },
    { day: 2, muscles: ['back', 'lats', 'quads', 'hams', 'glutes', 'biceps', 'rear_delts'] }
  ];
  if (d === 3) return [
    { day: 1, muscles: ['chest', 'upper_chest', 'triceps'] },
    { day: 2, muscles: ['back', 'lats', 'biceps', 'rear_delts'] },
    { day: 3, muscles: ['quads', 'hams', 'glutes', 'calves'] }
  ];
  if (d === 4) return [
    { day: 1, muscles: ['chest', 'upper_chest', 'shoulders', 'triceps'] },
    { day: 2, muscles: ['back', 'lats', 'biceps', 'rear_delts'] },
    { day: 3, muscles: ['chest', 'upper_chest', 'shoulders', 'triceps'] },
    { day: 4, muscles: ['quads', 'hams', 'glutes', 'calves'] }
  ];
  if (d === 5) return [
    { day: 1, muscles: ['chest', 'upper_chest', 'triceps'] },
    { day: 2, muscles: ['back', 'lats', 'biceps', 'rear_delts'] },
    { day: 3, muscles: ['quads', 'hams', 'glutes', 'calves'] },
    { day: 4, muscles: ['chest', 'shoulders', 'triceps'] },
    { day: 5, muscles: ['back', 'lats', 'rear_delts'] }
  ];
  // 6 days or 7 (7 → use 6 + 1 active recovery comment)
  return [
    { day: 1, muscles: ['chest', 'upper_chest', 'triceps'] },
    { day: 2, muscles: ['back', 'lats', 'biceps', 'rear_delts'] },
    { day: 3, muscles: ['quads', 'hams', 'glutes', 'calves'] },
    { day: 4, muscles: ['chest', 'upper_chest', 'triceps'] },
    { day: 5, muscles: ['back', 'lats', 'biceps', 'rear_delts'] },
    { day: 6, muscles: ['quads', 'hams', 'glutes', 'calves'] }
  ];
}

async function buildWorkouts(days: number, experience: Experience, goal: Goal, equipment: Equipment, injuries: Injury[] = []) {
  const split = splitByDays(days);
  const targetSetsPerMuscle = setsTarget(experience, goal);

  // Experience-based training parameters
  const repRange = REP_RANGES[goal === 'strength' ? 'strength' : 'hypertrophy'][experience];
  const rir = RIR_BY_EXPERIENCE[goal === 'strength' ? 'strength' : 'hypertrophy'][experience];
  const restTime = REST_TIMES[experience];
  const progressionHint = PROGRESSION_HINTS[experience];

  // Distribution: assign sets per muscle based on weekly target
  const totalMusclesPerWeek = split.reduce((acc, s) => acc + s.muscles.length, 0);
  const setsPerMuscle = Math.max(3, Math.round(targetSetsPerMuscle / (totalMusclesPerWeek / split.length)));

  const workouts = await Promise.all(split.map(async ({ day, muscles }) => {
    const selectedExercises = new Map<string, string[]>(); // exerciseId -> muscles worked
    const blocks = [];

    for (const muscle of muscles) {
      // Find best exercise for this muscle
      const exerciseId = await chooseExercise(equipment, muscle, injuries);
      
      // If we've already selected this exercise, add this muscle to the list
      if (selectedExercises.has(exerciseId)) {
        selectedExercises.get(exerciseId)!.push(muscle);
      } else {
        // First time selecting this exercise
        selectedExercises.set(exerciseId, [muscle]);
      }
    }

    // Create blocks from unique exercises
    for (const [exerciseId, musclesWorked] of selectedExercises) {
      // Use the first muscle as the primary muscle (for display)
      const primaryMuscle = musclesWorked[0];
      
      blocks.push({
        muscle: primaryMuscle,
        exerciseId,
        musclesWorked, // Add this field to show all muscles worked
        sets: setsPerMuscle,
        reps: `${repRange[0]}–${repRange[1]}`,
        rir,
        rir_hint: `RIR ${rir}; rest ${restTime}`,
        rest_hint: restTime,
        progression_hint: progressionHint,
        alt_compact: true
    });
    }

    return { day, blocks };
  }));

  return workouts;
}

// -----------------------------
// Legacy ingredient allocator functions removed - replaced by sophisticated beam-search system
// -----------------------------

// -----------------------------
// New sophisticated meal planning system
// -----------------------------

function qRound(n: number, step: number) {
  return Math.round(n / step) * step;
}

function clampValue(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function portionCandidates(ing: IngredientDocV2): PortionCandidate[] {
  const m = ing.macro_per_100g;
  const pm = ing.portion ?? {};

  // Defaults from legacy fields
  const typical = pm.typical_g ?? ing.typical_portion_g ?? 100;
  const unit = pm.unit ?? "g";

  if (unit === "piece" && pm.grams_per_piece) {
    const gpp = pm.grams_per_piece;
    const minP = pm.min_pieces ?? 1;
    const maxP = pm.max_pieces ?? 3;
    const stepP = pm.step_pieces ?? 1;
    const out: PortionCandidate[] = [];
    for (let pcs = minP; pcs <= maxP; pcs += stepP) {
      const g = pcs * gpp;
      out.push({
        grams: g,
        p: (m.p * g) / 100,
        c: (m.c * g) / 100,
        f: (m.f * g) / 100,
        kcal: (m.kcal * g) / 100,
        label: `${pcs} pcs`,
      });
    }
    return out;
  }

  // Gram-based: generate a small, realistic set around typical
  const minG = pm.min_g ?? Math.max(50, Math.floor(typical * 0.5));
  const maxG = pm.max_g ?? Math.min(300, Math.ceil(typical * 2.0));
  const stepG = pm.step_g ?? 10;

  // candidates = [0.75x, 1.0x, 1.25x, 1.5x] of typical, within min/max, snapped
  const mults = [0.75, 1.0, 1.25, 1.5];
  const raw = Array.from(new Set(
    mults.map(x => clampValue(qRound(typical * x, stepG), minG, maxG))
  )).sort((a,b)=>a-b);

  return raw.map(g => ({
    grams: g,
    p: (m.p * g) / 100,
    c: (m.c * g) / 100,
    f: (m.f * g) / 100,
    kcal: (m.kcal * g) / 100,
  }));
}

async function fetchIngredientsByTierV2(tier: BudgetTier): Promise<IngredientDocV2[]> {
  const snap = await db.collection("ingredients").where("budget_tier", "==", tier).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as IngredientDocV2));
}

function scoreCombo(totP:number, totC:number, totF:number, targetP:number, targetC:number, targetF:number, targetK:number, kPenalty=0.05) {
  // Weighted L1 error (protein matters slightly more), plus mild kcal penalty
  const eP = Math.abs(totP - targetP);
  const eC = Math.abs(totC - targetC);
  const eF = Math.abs(totF - targetF);
  const kcal = totP*4 + totC*4 + totF*9;
  const eK = Math.abs(kcal - targetK);
  return 1.2*eP + 1.0*eC + 0.8*eF + kPenalty*eK;
}

function cartesian<T>(a: T[], b: T[]) {
  const out: Array<[T,T]> = [];
  for (const i of a) for (const j of b) out.push([i,j]);
  return out;
}

/**
 * Beam-search allocator:
 * - category order: protein -> carb -> veg -> fat
 * - category counts (min..max) depend on goal
 * - keeps top B partial combos by score, expands progressively
 */
async function buildIngredientPlan(
  budget_tier: BudgetTier,
  macros: { protein_g: number; fat_g: number; carb_g: number },
  meals_per_day = 3,
  strictness: "normal" | "tight" | "loose" = "normal",
  goalHint: Goal = "recomp"
): Promise<IngredientsPlan> {

  const all = await fetchIngredientsByTierV2(budget_tier);
  const pool = {
    protein: all.filter(i => i.category === "protein"),
    carb:    all.filter(i => i.category === "carb"),
    veg:     all.filter(i => i.category === "veg"),
    fat:     all.filter(i => i.category === "fat"),
  };

  const tol = strictness === "tight" ? 0.07 : strictness === "loose" ? 0.15 : 0.10;

  // Per-meal targets (even split v1)
  const Ppm = macros.protein_g / meals_per_day;
  const Cpm = macros.carb_g / meals_per_day;
  const Fpm = macros.fat_g / meals_per_day;
  const Kpm = Ppm*4 + Cpm*4 + Fpm*9;

  // Category count ranges by goal - ensure fat is always included
  const ranges = {
    protein: [1, 1] as [number, number],  // exactly 1 protein per meal
    veg:     [1, 1] as [number, number],  // exactly 1 vegetable per meal  
    carb:    goalHint === "fat_loss" ? [0, 1] : [1, 1],  // 1 carb unless fat loss
    fat:     [1, 1] as [number, number],  // exactly 1 fat source per meal
  };

  // Precompute portion candidates per ingredient
  const pcands: Record<string, Array<{ing: IngredientDocV2; cand: PortionCandidate}>> = {};
  for (const cat of ["protein","carb","veg","fat"] as const) {
    for (const ing of pool[cat]) {
      const cands = portionCandidates(ing);
      // keep up to 4 best candidates near per-meal targets for that category
      const targetPer100 = cat === "protein" ? Ppm : cat === "carb" ? Cpm : cat === "fat" ? Fpm : 0;
      const sortKey = (cand: PortionCandidate) => {
        const macro = cat === "protein" ? cand.p : cat === "carb" ? cand.c : cat === "fat" ? cand.f : 0;
        return Math.abs(macro - targetPer100);
      };
      const chosen = cands.sort((a,b)=>sortKey(a)-sortKey(b)).slice(0,4);
      pcands[ing.name] = chosen.map(c => ({ ing, cand: c }));
    }
  }

  // Helper to extend beams by adding k items from a category
  function extendBeams(
    beams: MealCombo[],
    cat: "protein"|"carb"|"veg"|"fat",
    kMin: number,
    kMax: number,
    beamSize = 40,
    mealTargets?: { Ppm: number; Cpm: number; Fpm: number; Kpm: number }
  ): MealCombo[] {
    const ingList = pool[cat];
    const out: MealCombo[] = [];

    // Fixed: Use correct macro targets for each category and add randomization
    const targets = mealTargets || { Ppm, Cpm, Fpm, Kpm };
    const targetMacro = cat === "protein" ? targets.Ppm : cat === "carb" ? targets.Cpm : cat === "fat" ? targets.Fpm : 0;
    const macroGetter = (ing: IngredientDocV2) => {
      const m = ing.macro_per_100g;
      const portion = ing.typical_portion_g || 100;
      return cat === "protein" ? (m.p * portion / 100) : 
             cat === "carb" ? (m.c * portion / 100) :
             cat === "fat" ? (m.f * portion / 100) : 0;
    };
    
    const ranked = [...ingList].sort((a,b)=>{
      const aScore = Math.abs(macroGetter(a) - targetMacro);
      const bScore = Math.abs(macroGetter(b) - targetMacro);
      return aScore - bScore;
    });

    // Shuffle for variety - take different ingredients for different beams
    const shuffled = [...ranked];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Helper to check if ingredient name already exists in beam
    const hasIngredient = (beam: MealCombo, ingredientName: string): boolean => {
      return beam.items.some(item => item.name === ingredientName);
    };

    for (const beam of beams) {
      // k = 0 allowed for carb/fat categories (if min==0)
      for (let k = kMin; k <= kMax; k++) {
        if (k === 0) { out.push(beam); continue; }

        // Use more ingredients for variety - alternate between shuffled and ranked
        const useShuffled = Math.random() < 0.6; // 60% chance to use variety
        const choices = (useShuffled ? shuffled : ranked).slice(0, Math.min(20, ingList.length));
        
        // single
        if (k >= 1) {
          for (const ing of choices) {
            // Skip if this ingredient is already in the beam (no duplicates in same meal)
            if (hasIngredient(beam, ing.name)) continue;
            
            for (const pc of pcands[ing.name] || []) {
              const item = {
                ingredientId: ing.id ?? ing.name,
                name: ing.name,
                grams: pc.cand.grams,
                label: pc.cand.label,
                p: pc.cand.p, c: pc.cand.c, f: pc.cand.f, kcal: pc.cand.kcal,
                category: ing.category,
              };
              const totP = beam.totP + item.p;
              const totC = beam.totC + item.c;
              const totF = beam.totF + item.f;
              const totK = beam.totK + item.kcal;
              const score = scoreCombo(totP, totC, totF, targets.Ppm, targets.Cpm, targets.Fpm, targets.Kpm);
              out.push({ items: [...beam.items, item], totP, totC, totF, totK, score });
            }
          }
        }
        // pair (k >= 2) - only if both ingredients are different and not in beam
        if (k >= 2) {
          for (let i = 0; i < choices.length; i++) {
            for (let j = i + 1; j < choices.length; j++) { // j = i + 1 to avoid same ingredient pairs
              const a = choices[i], b = choices[j];
              
              // Skip if either ingredient is already in the beam
              if (hasIngredient(beam, a.name) || hasIngredient(beam, b.name)) continue;
              
              const candPairs = cartesian(pcands[a.name] || [], pcands[b.name] || []);
              for (const [pca, pcb] of candPairs) {
                const itemA = {
                  ingredientId: a.id ?? a.name, name: a.name, grams: pca.cand.grams, label: pca.cand.label,
                  p: pca.cand.p, c: pca.cand.c, f: pca.cand.f, kcal: pca.cand.kcal, category: a.category
                };
                const itemB = {
                  ingredientId: b.id ?? b.name, name: b.name, grams: pcb.cand.grams, label: pcb.cand.label,
                  p: pcb.cand.p, c: pcb.cand.c, f: pcb.cand.f, kcal: pcb.cand.kcal, category: b.category
                };
                const totP = beam.totP + itemA.p + itemB.p;
                const totC = beam.totC + itemA.c + itemB.c;
                const totF = beam.totF + itemA.f + itemB.f;
                const totK = beam.totK + itemA.kcal + itemB.kcal;
                const score = scoreCombo(totP, totC, totF, targets.Ppm, targets.Cpm, targets.Fpm, targets.Kpm);
                out.push({ items: [...beam.items, itemA, itemB], totP, totC, totF, totK, score });
              }
            }
          }
        }
      }
    }

    // Keep best N beams; mild tie-breaks for fewer items & higher availability
    const rankedOut = out.sort((x,y) => {
      if (x.score !== y.score) return x.score - y.score;
      return x.items.length - y.items.length;
    }).slice(0, beamSize);

    return rankedOut;
  }

  const meals: IngredientsPlan["meals"] = [];

  for (let mealIdx = 0; mealIdx < meals_per_day; mealIdx++) {
    // Start with empty beam
    let beams: MealCombo[] = [{ items: [], totP:0, totC:0, totF:0, totK:0, score: scoreCombo(0,0,0,Ppm,Cpm,Fpm,Kpm) }];

    // Add meal-specific variety by adjusting targets slightly for each meal
    const varietyFactor = 0.15; // ±15% variation
    const mealPpm = Ppm * (1 + (Math.random() - 0.5) * varietyFactor);
    const mealCpm = Cpm * (1 + (Math.random() - 0.5) * varietyFactor); 
    const mealFpm = Fpm * (1 + (Math.random() - 0.5) * varietyFactor);

    const mealTargets = { Ppm: mealPpm, Cpm: mealCpm, Fpm: mealFpm, Kpm: mealPpm*4 + mealCpm*4 + mealFpm*9 };

    // Order: proteins → carbs → veg → fat
    beams = extendBeams(beams, "protein", ranges.protein[0], ranges.protein[1], 40, mealTargets);
    beams = extendBeams(beams, "carb",    ranges.carb[0],    ranges.carb[1],    60, mealTargets);
    beams = extendBeams(beams, "veg",     ranges.veg[0],     ranges.veg[1],     60, mealTargets);
    beams = extendBeams(beams, "fat",     ranges.fat[0],     ranges.fat[1],     60, mealTargets);

    // Final selection: keep combos within tolerance; otherwise keep top few anyway
    const withinTol = beams.filter(b => {
      const okP = Math.abs(b.totP - Ppm) <= Ppm * tol;
      const okC = Math.abs(b.totC - Cpm) <= Cpm * tol || Cpm < 15; // low-carb flexibility
      const okF = Math.abs(b.totF - Fpm) <= Fpm * tol || Fpm < 10;
      return okP && okC && okF;
    });

    const final = (withinTol.length > 0 ? withinTol : beams)
      .sort((a,b)=>a.score - b.score)
      .slice(0, 1); // Only take the best combo

    // Take only the best combo for this meal (single option)
    const bestCombo = final[0];
    if (!bestCombo) {
      // Fallback in case no combo was generated
      meals.push({
        protein_opts: [],
        carb_opts: [],
        veg_opts: [],
        fat_opts: []
      });
      continue;
    }

    console.log(`Meal ${mealIdx + 1} best combo:`, bestCombo);

    // Separate ingredients by category for replacement system
    const proteinItems = bestCombo.items.filter(it => it.category === 'protein');
    const carbItems = bestCombo.items.filter(it => it.category === 'carb');
    const vegItems = bestCombo.items.filter(it => it.category === 'veg');
    const fatItems = bestCombo.items.filter(it => it.category === 'fat');

    // Format as single options per category
    const formatItems = (items: typeof bestCombo.items) => items.map(it => ({
      ingredientId: it.ingredientId,
      name: it.name,
      grams: Math.round(it.grams),
      label: it.label,
      category: it.category,
      p: Math.round(it.p), 
      c: Math.round(it.c), 
      f: Math.round(it.f), 
      kcal: Math.round(it.kcal)
    }));

    meals.push({
      protein_opts: proteinItems.length > 0 ? [{
        combo_label: "Protein",
        items: formatItems(proteinItems),
        totals: { 
          p: Math.round(proteinItems.reduce((sum, it) => sum + it.p, 0)), 
          c: Math.round(proteinItems.reduce((sum, it) => sum + it.c, 0)), 
          f: Math.round(proteinItems.reduce((sum, it) => sum + it.f, 0)), 
          kcal: Math.round(proteinItems.reduce((sum, it) => sum + it.kcal, 0)) 
        }
      }] : [],
      carb_opts: carbItems.length > 0 ? [{
        combo_label: "Carbs",
        items: formatItems(carbItems),
        totals: { 
          p: Math.round(carbItems.reduce((sum, it) => sum + it.p, 0)), 
          c: Math.round(carbItems.reduce((sum, it) => sum + it.c, 0)), 
          f: Math.round(carbItems.reduce((sum, it) => sum + it.f, 0)), 
          kcal: Math.round(carbItems.reduce((sum, it) => sum + it.kcal, 0)) 
        }
      }] : [],
      veg_opts: vegItems.length > 0 ? [{
        combo_label: "Vegetables",
        items: formatItems(vegItems),
        totals: { 
          p: Math.round(vegItems.reduce((sum, it) => sum + it.p, 0)), 
          c: Math.round(vegItems.reduce((sum, it) => sum + it.c, 0)), 
          f: Math.round(vegItems.reduce((sum, it) => sum + it.f, 0)), 
          kcal: Math.round(vegItems.reduce((sum, it) => sum + it.kcal, 0)) 
        }
      }] : [],
      fat_opts: fatItems.length > 0 ? [{
        combo_label: "Fats",
        items: formatItems(fatItems),
        totals: { 
          p: Math.round(fatItems.reduce((sum, it) => sum + it.p, 0)), 
          c: Math.round(fatItems.reduce((sum, it) => sum + it.c, 0)), 
          f: Math.round(fatItems.reduce((sum, it) => sum + it.f, 0)), 
          kcal: Math.round(fatItems.reduce((sum, it) => sum + it.kcal, 0)) 
        }
      }] : []
    });
  }

  return { meals };
}

// -----------------------------
// Express app
// -----------------------------
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get('/health', (_req: express.Request, res: express.Response) => {
  res.status(200).json({ ok: true, region: 'asia-northeast1', version: '2025-08-16' });
});

// --- recalculateIndexes ---
app.post('/recalculateIndexes', (req: express.Request, res: express.Response) => {
  try {
    const body: RecalcReq = req.body || {};
    if (!body?.sex || !body?.age_range) {
      return res.status(400).json({ error: 'sex and age_range are required.' });
    }

    const { BMR, method, BMI, WHtR, FFMI, overrides } = computeIndexes(body);
    const TDEE = computeTDEE(BMR, 3, overrides?.TDEE ?? null);

    const { accuracy, next_best_input } = accuracyBand(body);

    const warnings = [
      ...detectOverrideWarnings(BMR, overrides?.BMR ?? null, 'BMR'),
      ...detectOverrideWarnings(TDEE ?? null, overrides?.TDEE ?? null, 'TDEE'),
      ...detectOverrideWarnings(BMI ?? null, overrides?.BMI ?? null, 'BMI')
    ];

    return res.json({
        BMR, method, TDEE, BMI, WHtR, FFMI,
      accuracy,
      next_best_input,
      warnings
    });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// --- generatePlan ---
app.post('/generatePlan', async (req: express.Request, res: express.Response) => {
  try {
    const body: GenerateReq = req.body || {};
    const missing = [];
    if (!body?.sex) missing.push('sex');
    if (!body?.age_range) missing.push('age_range');
    if (body?.schedule_days == null) missing.push('schedule_days');
    if (!body?.equipment) missing.push('equipment');
    if (!body?.experience) missing.push('experience');
    if (!body?.goal) missing.push('goal');
    if (!body?.budget_tier) missing.push('budget_tier');

    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    // 7 -> 6 + 1 recovery note
    const daysRaw = Number(body.schedule_days);
    const schedule_days = daysRaw === 7 ? 6 : clamp(daysRaw, 1, 6);

    const idx = computeIndexes(body);
    const TDEE = computeTDEE(idx.BMR, schedule_days, idx.overrides?.TDEE ?? null);

    // if TDEE still null, fall back to a light activity assumption with Mifflin default
    const fallbackBMR = idx.BMR ?? 1500;
    const safeTDEE = TDEE ?? Math.round(fallbackBMR * activityMultiplier(schedule_days));

    const kcal = setCalories(safeTDEE, body.goal);
    const macros = setMacros(body.sex, body.weight_kg, kcal || safeTDEE, body.goal);

    const workouts = await buildWorkouts(schedule_days, body.experience, body.goal, body.equipment, body.injuries ?? []);
    // Use goal-based default or user-specified meals per day
    const mealsPerDay = body.meals_per_day ?? DEFAULT_MEALS_BY_GOAL[body.goal];
    const ingredients = await buildIngredientPlan(
      body.budget_tier, macros, mealsPerDay, "normal", body.goal
    );

    const { accuracy, next_best_input } = accuracyBand(body);

    const response = {
      idx: {
        BMR: idx.BMR, method: idx.method, TDEE: safeTDEE,
        BMI: idx.BMI, WHtR: idx.WHtR, FFMI: idx.FFMI
      },
      kcal: kcal || safeTDEE,
      macros,
      workouts,
      ingredients,
      confidence: accuracy === 'highest' || accuracy === 'high' ? 'high' : accuracy === 'med' ? 'med' : 'low',
      tips: next_best_input ? [`Add ${next_best_input} to improve accuracy`] : [],
      notes: daysRaw === 7 ? ['Input 7 days → using 6 training days + 1 active recovery.'] : []
    };

    return res.json(response);
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// --- adaptPlan ---
app.post('/adaptPlan', (req: express.Request, res: express.Response) => {
  try {
    const body: AdaptReq = req.body || {};
    if (!body?.current_plan || !body?.readiness) {
      return res.status(400).json({ error: 'current_plan and readiness are required.' });
    }

    const change_log: string[] = [];
    const patched_plan = JSON.parse(JSON.stringify(body.current_plan));

    // 1) Region soreness ≥4 → −1–2 sets on next session for that region; suggest regression
    const soreness = body.readiness.soreness || {};
    Object.entries(soreness).forEach(([region, score]) => {
      if (Number(score) >= 4) {
        // reduce sets in workouts by 1 for that region
        (patched_plan.workouts ?? []).forEach((w: any) => {
          (w.blocks ?? []).forEach((b: any) => {
            if (String(b.muscle).includes(region) || String(region).includes(String(b.muscle))) {
              b.sets = Math.max(1, (Number(b.sets) || 3) - 1);
            }
          });
        });
        change_log.push(`${region} -1 set (soreness ${score}).`);
      }
    });

    // 2) Global readiness: stress/motivation
    if (body.readiness.stress >= 4 && body.readiness.motivation <= 2) {
      // cap RIR at 2 and reduce total sets by 10%
      (patched_plan.workouts ?? []).forEach((w: any) => {
        (w.blocks ?? []).forEach((b: any) => {
          b.rir = '2';
          b.sets = Math.max(1, Math.round((Number(b.sets) || 3) * 0.9));
        });
      });
      change_log.push('Global fatigue: sets -10%, cap RIR at 2.');
    }

    // 3) Weight trend (2w) → kcal ±5–10%
    if (patched_plan.kcal && typeof patched_plan.kcal === 'number') {
      if (body.weight_trend_2w === 'above') {
        const newKcal = Math.round(patched_plan.kcal * 0.95);
        if (newKcal !== patched_plan.kcal) {
          patched_plan.kcal = newKcal;
          change_log.push('Calories -5% (weight above target).');
        }
      } else if (body.weight_trend_2w === 'below') {
        const newKcal = Math.round(patched_plan.kcal * 1.05);
        if (newKcal !== patched_plan.kcal) {
          patched_plan.kcal = newKcal;
          change_log.push('Calories +5% (weight below target).');
        }
      }
    }

    // 4) Adherence very low → modest deload
    if ((body.last_week_adherence_pct ?? 100) < 60) {
      (patched_plan.workouts ?? []).forEach((w: any) => {
        (w.blocks ?? []).forEach((b: any) => {
          b.sets = Math.max(1, Math.round((Number(b.sets) || 3) * 0.85));
        });
      });
      change_log.push('Low adherence: temporary -15% sets.');
    }

    return res.json({ patched_plan, change_log });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// Root
app.get('/', (_req: express.Request, res: express.Response) => {
  res.status(200).json({ ok: true, routes: ['/api/health', '/api/recalculateIndexes', '/api/generatePlan', '/api/adaptPlan'] });
});

// Mount under /api
export const api = onRequest((req, res) => {
    // keep your /api/** rewrite behavior
  req.url = req.url.replace(/^\/?api\/?/, '/');
  return app(req, res);
});