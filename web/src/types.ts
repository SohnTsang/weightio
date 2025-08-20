// web/src/types.ts
export type Sex = "male" | "female";
export type Goal = "fat_loss" | "lean_mass" | "strength" | "recomp" | "hypertrophy";
export type AgeRange = "<18" | "18–24" | "25–34" | "35–44" | "45–54" | "55–60" | ">60";
export type Equipment = "full_gym" | "dumbbells_only" | "bands_only" | "bodyweight_only";
export type Experience = "novice" | "intermediate" | "advanced";
export type BudgetTier = "low" | "medium" | "high";

export interface Overrides { BMR?: number; TDEE?: number; BMI?: number; }

export interface RecalcReq {
  sex: Sex;
  age_range?: AgeRange;
  height_cm?: number;
  weight_kg?: number;
  bodyfat_pct?: number;
  waist_cm?: number;
  overrides?: Overrides;
}

export interface RecalcRes {
  BMR: number;
  method: "mifflin" | "katch" | "override";
  TDEE: number;
  BMI?: number | null;
  WHtR?: number | null;
  FFMI?: number | null;
  accuracy: "low" | "med" | "high";
  next_best_input?: "height_cm" | "weight_kg" | "age_range" | "bodyfat_pct" | "waist_cm";
}

export interface GenerateReq extends RecalcReq {
  goal: Goal;
  schedule_days: 1 | 2 | 3 | 4 | 5 | 6;
  equipment: Equipment;
  experience: Experience;
  injuries?: string[];
  budget_tier: BudgetTier;
  meals_per_day?: 2 | 3 | 4 | 5;
}

export interface WorkoutBlock {
  muscle: string;
  exerciseId: string;
  sets: number;
  reps: string;
  rir: string;
  musclesWorked?: string[];
  rir_hint: string;
  rest_hint: string;
  progression_hint: string;
  alt_compact?: boolean;
}

export interface DayPlan {
  day: number;
  blocks: WorkoutBlock[];
}

// NEW: Multi-ingredient item within a meal combo
export interface IngredientItem {
  ingredientId: string;
  name: string;
  grams: number;
  category: string; // "protein", "carb", "veg", "fat"
  p: number; // protein (grams)
  c: number; // carbs (grams)
  f: number; // fat (grams)
  kcal: number; // calories
  label?: string; // Optional label like "2 pcs"
}

// NEW: Macro totals for a meal combo
export interface MacroTotals {
  p: number; // total protein
  c: number; // total carbs
  f: number; // total fat
  kcal: number; // total calories
}

// NEW: Multi-item meal combo structure
export interface MealCombo {
  combo_label: string; // e.g., "Option 1"
  items: IngredientItem[]; // Multiple ingredients per combo
  totals: MacroTotals; // Total macros for the combo
}

// NEW: Updated meal options structure
export interface MealOptions {
  protein_opts: MealCombo[]; // Contains multi-item combos
  carb_opts: MealCombo[]; // Usually empty in new format
  veg_opts: MealCombo[]; // Usually empty in new format  
  fat_opts: MealCombo[]; // Usually empty in new format
}

export interface IngredientsPlan {
  meals: MealOptions[];
}

// LEGACY: Keep for backward compatibility (if needed elsewhere)
export interface IngredientOption {
  ingredientId: string; 
  name: string; 
  grams?: number | null; 
  p?: number | null; 
  c?: number | null; 
  f?: number | null; 
  kcal?: number | null; 
  budget_tier?: BudgetTier;
}

export interface GenerateRes {
  idx: Pick<RecalcRes, "BMR"|"method"|"TDEE"|"BMI"|"WHtR"|"FFMI">;
  kcal: number;
  macros: { protein_g: number; fat_g: number; carb_g: number };
  workouts: DayPlan[];
  ingredients: IngredientsPlan;
  confidence: "low" | "med" | "high";
  tips: string[];
}

export interface AdaptReq {
  current_plan: any;
  readiness: {
    sleep_h: number;
    soreness: Record<string, number>;
    stress: number;
    motivation: number;
  };
  last_week_adherence_pct?: number;
  weight_trend_2w?: "below" | "on_target" | "above";
}

export interface AdaptRes {
  patched_plan: any;
  change_log: string[];
}
