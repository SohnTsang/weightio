// web/src/pages/Planner.tsx - Enhanced with JP/EN Localization & User-Friendly Design
import { useEffect, useRef, useState } from "react";
import { API } from "../api/client";
import type { GenerateReq, GenerateRes, RecalcReq, Sex, AgeRange } from "../types";
import "./Planner.css";

type Props = { onPlan: (p: GenerateRes) => void };

// TESTING VERSION - With prefilled values
const DEFAULT_FORM: GenerateReq = {
  sex: "male",
  goal: "hypertrophy", 
  schedule_days: 4,
  equipment: "full_gym",
  experience: "intermediate",
  age_range: "25–34",
  height_cm: 175,
  weight_kg: 75,
  bodyfat_pct: 15,
  budget_tier: "medium",
  meals_per_day: 4,
};

// PRODUCTION VERSION - Without prefilled values (commented out for testing)
// const DEFAULT_FORM: GenerateReq = {
//   sex: "male" as any, // Will be cleared on render
//   goal: "hypertrophy" as any, // Will be cleared on render  
//   schedule_days: 3,
//   equipment: "bodyweight_only" as any, // Will be cleared on render
//   experience: "novice" as any, // Will be cleared on render
//   age_range: undefined,
//   height_cm: undefined,
//   weight_kg: undefined,
//   bodyfat_pct: undefined,
//   budget_tier: "low" as any, // Will be cleared on render
//   meals_per_day: 3,
// };

// Goal-based meal recommendations (matching iOS implementation)
const DEFAULT_MEALS_BY_GOAL: Record<string, number> = {
  "fat_loss": 3,
  "lean_mass": 4,
  "strength": 4,
  "recomp": 3,
  "hypertrophy": 4,
};

// Localized Content
const PLANNER_CONTENT = {
  ja: {
    hero: {
      eyebrow: "WEIGHTIO プランナー",
      title: "あなた専用プランを作成",
      subtitle: "AI が個別最適化したフィットネス & 栄養プラン",
      accuracy: {
        label: "プラン精度",
        hints: {
          high: "✨ 完璧！全ての重要データが入力済み",
          med: "📊 現在のデータで良好な精度",
          low: "📝 詳細を追加してより高い精度に",
          calculating: "🔄 精度を計算中..."
        }
      }
    },
    sections: {
      personal: {
        title: "基本情報",
        subtitle: "あなたの体の基本データを教えてください"
      },
      goals: {
        title: "目標 & トレーニング",
        subtitle: "何を目指し、どんな環境でトレーニングしますか？"
      },
      nutrition: {
        title: "栄養設定",
        subtitle: "食事の予算と回数をお選びください"
      },
      generate: {
        title: "準備完了！",
        subtitle: "あなた専用のプランをAIが3秒で生成します",
        button: "プランを生成",
        loading: "プラン生成中..."
      }
    },
    fields: {
      sex: {
        label: "性別",
        placeholder: "性別を選択",
        options: {
          male: "男性",
          female: "女性"
        }
      },
      age: {
        label: "年齢",
        placeholder: "年齢を選択",
        options: {
          "<18": "18歳未満",
          "18–24": "18-24歳",
          "25–34": "25-34歳", 
          "35–44": "35-44歳",
          "45–54": "45-54歳",
          "55–60": "55-60歳",
          ">60": "60歳以上"
        }
      },
      height: {
        label: "身長 (cm)",
        placeholder: "例: 170"
      },
      weight: {
        label: "体重 (kg)", 
        placeholder: "例: 65.5"
      },
      bodyfat: {
        label: "体脂肪率 (%)",
        placeholder: "例: 15.0 (オプション)"
      },
      goal: {
        label: "主な目標",
        placeholder: "目標を選択",
        options: {
          hypertrophy: "筋肉を増やす",
          strength: "筋力向上", 
          fat_loss: "脂肪燃焼",
          recomp: "体組成改善",
          lean_mass: "リーンマス増加"
        }
      },
      experience: {
        label: "トレーニング経験",
        placeholder: "経験レベルを選択",
        options: {
          novice: "初心者 (0-1年)",
          intermediate: "中級者 (1-3年)",
          advanced: "上級者 (3年以上)"
        }
      },
      days: {
        label: "週の トレーニング日数",
        options: {
          "1": "1日 (軽め)",
          "2": "2日 (最小限)",
          "3": "3日 (バランス)", 
          "4": "4日 (コミット)",
          "5": "5日 (本格的)",
          "6": "6日 (集中的)"
        }
      },
      equipment: {
        label: "利用可能な器具",
        placeholder: "器具を選択",
        options: {
          bodyweight_only: "自重のみ",
          dumbbells_only: "ダンベルのみ",
          bands_only: "バンドのみ",
          full_gym: "フルジム"
        }
      },
      budget: {
        label: "食費予算",
        placeholder: "予算レベルを選択",
        options: {
          low: "節約重視",
          medium: "バランス",
          high: "プレミアム"
        }
      },
      meals: {
        label: "1日の食事回数",
        options: {
          "2": "2回",
          "3": "3回",
          "4": "4回", 
          "5": "5回"
        }
      }
    },
    recommendation: "推奨: {meals}回の食事で{goal}",
    error: "エラーが発生しました。もう一度お試しください。"
  },
  en: {
    hero: {
      eyebrow: "WEIGHTIO PLANNER",
      title: "Create Your Perfect Plan",
      subtitle: "AI-powered fitness & nutrition tailored just for you",
      accuracy: {
        label: "Plan Accuracy",
        hints: {
          high: "✨ Excellent! All key metrics provided",
          med: "📊 Good accuracy with current data",
          low: "📝 Add more details for better accuracy",
          calculating: "🔄 Calculating accuracy..."
        }
      }
    },
    sections: {
      personal: {
        title: "Personal Information",
        subtitle: "Tell us about your body basics"
      },
      goals: {
        title: "Goals & Training",
        subtitle: "What do you want to achieve and where will you train?"
      },
      nutrition: {
        title: "Nutrition Preferences",
        subtitle: "Choose your food budget and meal frequency"
      },
      generate: {
        title: "Ready to Transform!",
        subtitle: "Your personalized plan will be generated in 3 seconds",
        button: "Generate My Plan",
        loading: "Generating Your Plan..."
      }
    },
    fields: {
      sex: {
        label: "Sex",
        placeholder: "Select your sex",
        options: {
          male: "Male",
          female: "Female"
        }
      },
      age: {
        label: "Age Range",
        placeholder: "Select age range",
        options: {
          "<18": "Under 18",
          "18–24": "18-24 years",
          "25–34": "25-34 years",
          "35–44": "35-44 years", 
          "45–54": "45-54 years",
          "55–60": "55-60 years",
          ">60": "Over 60"
        }
      },
      height: {
        label: "Height (cm)",
        placeholder: "e.g., 175"
      },
      weight: {
        label: "Weight (kg)",
        placeholder: "e.g., 70.5"
      },
      bodyfat: {
        label: "Body Fat (%)",
        placeholder: "e.g., 15.0 (optional)"
      },
      goal: {
        label: "Primary Goal", 
        placeholder: "Select your goal",
        options: {
          hypertrophy: "Build Muscle",
          strength: "Get Stronger",
          fat_loss: "Lose Fat",
          recomp: "Body Recomposition", 
          lean_mass: "Lean Mass Gain"
        }
      },
      experience: {
        label: "Experience Level",
        placeholder: "Select experience level",
        options: {
          novice: "Novice (0-1 years)",
          intermediate: "Intermediate (1-3 years)",
          advanced: "Advanced (3+ years)"
        }
      },
      days: {
        label: "Training Days per Week",
        options: {
          "1": "1 day (Light)",
          "2": "2 days (Minimal)",
          "3": "3 days (Balanced)",
          "4": "4 days (Committed)",
          "5": "5 days (Dedicated)",
          "6": "6 days (Intensive)"
        }
      },
      equipment: {
        label: "Available Equipment",
        placeholder: "Select your equipment", 
        options: {
          bodyweight_only: "Bodyweight Only",
          dumbbells_only: "Dumbbells Only",
          bands_only: "Resistance Bands",
          full_gym: "Full Gym Access"
        }
      },
      budget: {
        label: "Food Budget",
        placeholder: "Select budget level",
        options: {
          low: "Budget-Friendly",
          medium: "Balanced Options",
          high: "Premium Ingredients"
        }
      },
      meals: {
        label: "Meals per Day",
        options: {
          "2": "2 meals",
          "3": "3 meals",
          "4": "4 meals",
          "5": "5 meals"
        }
      }
    },
    recommendation: "Recommended: {meals} meals for {goal}",
    error: "An error occurred. Please try again."
  }
} as const;

export default function Planner({ onPlan }: Props) {
  const [form, setForm] = useState<GenerateReq>(DEFAULT_FORM);
  const [accuracy, setAccuracy] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [focusedField, setFocusedField] = useState<string>("");
  const [lang, setLang] = useState<'ja' | 'en'>('ja');

  const debounceRef = useRef<number | undefined>(undefined);
  const t = PLANNER_CONTENT[lang];

  // TESTING VERSION - Keep prefilled values (commented out clearing)
  // useEffect(() => {
  //   setForm(prev => ({
  //     ...prev,
  //     sex: "" as any,
  //     goal: "" as any,
  //     equipment: "" as any,
  //     experience: "" as any,
  //     budget_tier: "" as any
  //   }));
  // }, []);
  
  // PRODUCTION VERSION - Clear default values to make form truly empty
  // useEffect(() => {
  //   setForm(prev => ({
  //     ...prev,
  //     sex: "" as any,
  //     goal: "" as any,
  //     equipment: "" as any,
  //     experience: "" as any,
  //     budget_tier: "" as any
  //   }));
  // }, []);

  // Get recommended meals for current goal
  const recommendedMeals = DEFAULT_MEALS_BY_GOAL[form.goal] || 3;

  // Get goal display name
  const getGoalDisplayName = (goal: string) => {
    return t.fields.goal.options[goal as keyof typeof t.fields.goal.options] || goal;
  };

  // Debounced recalc for the accuracy meter
  function scheduleRecalc(next: RecalcReq) {
    // Only make API call if we have valid required data
    const sex = next.sex as string;
    const age_range = next.age_range as string;
    
    if (!sex || sex === "" || (sex !== "male" && sex !== "female")) {
      setAccuracy("low");
      return;
    }
    
    if (!age_range || age_range === "") {
      setAccuracy("low");
      return;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const idx = await API.recalc(next);
        setAccuracy(idx.accuracy);
      } catch (e: any) {
        console.error("Recalc API error:", e);
        setAccuracy("low");
      }
    }, 350);
  }

  function update<K extends keyof GenerateReq>(key: K, value: GenerateReq[K]) {
    const next = { ...form, [key]: value };
    
    // Auto-set recommended meals when goal changes
    if (key === 'goal') {
      next.meals_per_day = (DEFAULT_MEALS_BY_GOAL[value as string] || 3) as 2 | 3 | 4 | 5;
    }
    
    setForm(next);
    
    // Recalc when inputs that affect accuracy change
    if (["sex","age_range","height_cm","weight_kg","bodyfat_pct","waist_cm"].includes(String(key))) {
      // Only call recalc if we have minimum valid data
      const sex = next.sex as string;
      const age_range = next.age_range as string;
      
      if (sex && (sex === "male" || sex === "female") && age_range && age_range !== "") {
      const recalcBody: RecalcReq = {
          sex: next.sex as Sex,
          age_range: next.age_range as AgeRange,
        height_cm: next.height_cm,
        weight_kg: next.weight_kg,
        bodyfat_pct: (next as any).bodyfat_pct,
        waist_cm: (next as any).waist_cm,
      };
      scheduleRecalc(recalcBody);
      } else {
        // Set accuracy to low if we don't have valid required data
        setAccuracy("low");
      }
    }
  }

  async function onGenerate() {
    setLoading(true);
    setError("");
    
    // Validate required fields
    const validationErrors: string[] = [];
    
    const sex = form.sex as string;
    const age_range = form.age_range as string;
    
    if (!sex || sex === "" || (sex !== "male" && sex !== "female")) {
      validationErrors.push(t.fields.sex.label);
    }
    if (!age_range || age_range === "") {
      validationErrors.push(t.fields.age.label);
    }
    if (!form.goal) {
      validationErrors.push(t.fields.goal.label);
    }
    if (!form.equipment) {
      validationErrors.push(t.fields.equipment.label);
    }
    if (!form.experience) {
      validationErrors.push(t.fields.experience.label);
    }
    if (!form.budget_tier) {
      validationErrors.push(t.fields.budget.label);
    }
    
    if (validationErrors.length > 0) {
      setError(`${lang === 'ja' ? '次の項目を入力してください: ' : 'Please fill in the following fields: '}${validationErrors.join(', ')}`);
      setLoading(false);
      return;
    }
    
    try {
      const plan = await API.generate(form);
      onPlan(plan);
    } catch (e: any) {
      console.error("Generate plan error:", e);
      setError(e.message ?? (lang === 'ja' ? 'プラン生成に失敗しました' : 'Failed to generate plan'));
    } finally {
      setLoading(false);
    }
  }

  // TESTING VERSION - Calculate accuracy for prefilled data
  useEffect(() => {
    // Calculate accuracy for prefilled form
    if (form.sex && form.age_range) {
      const recalcBody: RecalcReq = {
        sex: form.sex as Sex,
        age_range: form.age_range as AgeRange,
      height_cm: form.height_cm,
      weight_kg: form.weight_kg,
        bodyfat_pct: form.bodyfat_pct,
        waist_cm: (form as any).waist_cm,
      };
      scheduleRecalc(recalcBody);
    } else {
      setAccuracy("low");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PRODUCTION VERSION - Set initial accuracy to low (commented out for testing)
  // useEffect(() => {
  //   // Set initial accuracy to low until user provides valid data
  //   setAccuracy("low");
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []);

  return (
    <div className="planner-page">
      
      {/* Language Toggle */}
      <div className="planner-lang-toggle">
        <button 
          className={`planner-lang-btn ${lang === 'ja' ? 'active' : ''}`}
          onClick={() => setLang('ja')}
        >
          日
        </button>
        <button 
          className={`planner-lang-btn ${lang === 'en' ? 'active' : ''}`}
          onClick={() => setLang('en')}
        >
          EN
        </button>
      </div>

      {/* Hero Section */}
      <section className="planner-hero">
        <div className="planner-container">
          <div className="planner-hero-content">
            <div className="planner-eyebrow">{t.hero.eyebrow}</div>
            <h1 className="planner-title">{t.hero.title}</h1>
            <p className="planner-subtitle">{t.hero.subtitle}</p>
          </div>
        </div>
      </section>

      {/* Personal Info Section */}
      <section className="planner-section">
        <div className="planner-container">
          <div className="planner-section-header">
            <h2 className="planner-section-title">{t.sections.personal.title}</h2>
            <p className="planner-section-subtitle">{t.sections.personal.subtitle}</p>
          </div>
          
          <div className="planner-form-grid">
            <UserFriendlyField
              label={t.fields.sex.label}
              type="select"
              value={form.sex}
              onChange={(value) => update("sex", value as any)}
              options={[
                { value: "", label: t.fields.sex.placeholder },
                { value: "male", label: t.fields.sex.options.male },
                { value: "female", label: t.fields.sex.options.female }
              ]}
              focused={focusedField === "sex"}
              onFocus={() => setFocusedField("sex")}
              onBlur={() => setFocusedField("")}
              icon="👤"
            />
            <UserFriendlyField
              label={t.fields.age.label}
              type="select"
              value={form.age_range || ""}
              onChange={(value) => update("age_range", value as any)}
              options={[
                { value: "", label: t.fields.age.placeholder },
                ...Object.entries(t.fields.age.options).map(([value, label]) => ({ value, label }))
              ]}
              focused={focusedField === "age_range"}
              onFocus={() => setFocusedField("age_range")}
              onBlur={() => setFocusedField("")}
              icon="🎂"
            />
            <UserFriendlyField
              label={t.fields.height.label}
              type="number"
              value={String(form.height_cm || "")}
              onChange={(value) => update("height_cm", Number(value))}
              placeholder={t.fields.height.placeholder}
              focused={focusedField === "height_cm"}
              onFocus={() => setFocusedField("height_cm")}
              onBlur={() => setFocusedField("")}
              icon="📏"
            />
            <UserFriendlyField
              label={t.fields.weight.label}
              type="number"
              value={String(form.weight_kg || "")}
              onChange={(value) => update("weight_kg", Number(value))}
              placeholder={t.fields.weight.placeholder}
              step="0.1"
              focused={focusedField === "weight_kg"}
              onFocus={() => setFocusedField("weight_kg")}
              onBlur={() => setFocusedField("")}
              icon="⚖️"
            />
            <UserFriendlyField
              label={t.fields.bodyfat.label}
              type="number"
              value={String((form as any).bodyfat_pct || "")}
              onChange={(value) => update("bodyfat_pct" as any, Number(value))}
              placeholder={t.fields.bodyfat.placeholder}
              step="0.1"
              focused={focusedField === "bodyfat_pct"}
              onFocus={() => setFocusedField("bodyfat_pct")}
              onBlur={() => setFocusedField("")}
              icon="🔋"
            />
          </div>
        </div>
      </section>

      {/* Goals & Training Section */}
      <section className="planner-section planner-section-alt">
        <div className="planner-container">
          <div className="planner-section-header">
            <h2 className="planner-section-title">{t.sections.goals.title}</h2>
            <p className="planner-section-subtitle">{t.sections.goals.subtitle}</p>
          </div>
          
          <div className="planner-form-grid">
            <UserFriendlyField
              label={t.fields.goal.label}
              type="select"
              value={form.goal}
              onChange={(value) => update("goal", value as any)}
              options={[
                { value: "", label: t.fields.goal.placeholder },
                ...Object.entries(t.fields.goal.options).map(([value, label]) => ({ value, label }))
              ]}
              focused={focusedField === "goal"}
              onFocus={() => setFocusedField("goal")}
              onBlur={() => setFocusedField("")}
              icon="🎯"
            />
            <UserFriendlyField
              label={t.fields.experience.label}
              type="select"
              value={form.experience}
              onChange={(value) => update("experience", value as any)}
              options={[
                { value: "", label: t.fields.experience.placeholder },
                ...Object.entries(t.fields.experience.options).map(([value, label]) => ({ value, label }))
              ]}
              focused={focusedField === "experience"}
              onFocus={() => setFocusedField("experience")}
              onBlur={() => setFocusedField("")}
              icon="💪"
            />
            <UserFriendlyField
              label={t.fields.days.label}
              type="select"
              value={String(form.schedule_days)}
              onChange={(value) => update("schedule_days", Number(value) as any)}
              options={Object.entries(t.fields.days.options).map(([value, label]) => ({ value, label }))}
              focused={focusedField === "schedule_days"}
              onFocus={() => setFocusedField("schedule_days")}
              onBlur={() => setFocusedField("")}
              icon="📅"
            />
            <UserFriendlyField
              label={t.fields.equipment.label}
              type="select"
              value={form.equipment}
              onChange={(value) => update("equipment", value as any)}
              options={[
                { value: "", label: t.fields.equipment.placeholder },
                ...Object.entries(t.fields.equipment.options).map(([value, label]) => ({ value, label }))
              ]}
              focused={focusedField === "equipment"}
              onFocus={() => setFocusedField("equipment")}
              onBlur={() => setFocusedField("")}
              icon="🏋️"
            />
          </div>
        </div>
      </section>

      {/* Nutrition Section */}
      <section className="planner-section">
        <div className="planner-container">
          <div className="planner-section-header">
            <h2 className="planner-section-title">{t.sections.nutrition.title}</h2>
            <p className="planner-section-subtitle">{t.sections.nutrition.subtitle}</p>
          </div>
          
          <div className="planner-form-grid">
            <UserFriendlyField
              label={t.fields.budget.label}
              type="select"
              value={form.budget_tier}
              onChange={(value) => update("budget_tier", value as any)}
              options={[
                { value: "", label: t.fields.budget.placeholder },
                ...Object.entries(t.fields.budget.options).map(([value, label]) => ({ value, label }))
              ]}
              focused={focusedField === "budget_tier"}
              onFocus={() => setFocusedField("budget_tier")}
              onBlur={() => setFocusedField("")}
              icon="💰"
            />
            <UserFriendlyField
              label={t.fields.meals.label}
              type="select"
              value={String(form.meals_per_day || 3)}
              onChange={(value) => update("meals_per_day", Number(value) as 2 | 3 | 4 | 5)}
              options={Object.entries(t.fields.meals.options).map(([value, label]) => ({ value, label }))}
              focused={focusedField === "meals_per_day"}
              onFocus={() => setFocusedField("meals_per_day")}
              onBlur={() => setFocusedField("")}
              icon="🍽️"
            />
          </div>
          
          {/* Goal-based meal recommendation */}
          {form.goal && recommendedMeals && (
            <div className="planner-recommendation">
              📊 {t.recommendation.replace('{meals}', String(recommendedMeals)).replace('{goal}', getGoalDisplayName(form.goal))}
            </div>
          )}
        </div>
      </section>

      {/* Generate Section */}
      <section className="planner-cta">
        <div className="planner-container">
          {/* Enhanced Accuracy Panel */}
          <div className="planner-accuracy">
            <div className="planner-accuracy-header">
              <span className="planner-accuracy-label">{t.hero.accuracy.label}</span>
              <span className={`planner-accuracy-badge planner-accuracy-${accuracy || 'calculating'}`}>
                {accuracy?.toUpperCase() || "CALCULATING..."}
              </span>
            </div>
            <div className="planner-accuracy-bar">
              <div className="planner-accuracy-fill" style={{width: getAccuracyWidth(accuracy)}} />
            </div>
            <div className="planner-accuracy-hint">
              {t.hero.accuracy.hints[accuracy as keyof typeof t.hero.accuracy.hints] || t.hero.accuracy.hints.calculating}
            </div>
          </div>

          {error && (
            <div className="planner-error">
              <span className="planner-error-icon">⚠️</span>
              <span>{t.error}</span>
            </div>
          )}
          
          <div className="planner-cta-content">
            <h3 className="planner-cta-title">{t.sections.generate.title}</h3>
            <p className="planner-cta-subtitle">{t.sections.generate.subtitle}</p>
            <button 
              onClick={onGenerate} 
              disabled={loading}
              className="planner-generate-btn"
            >
              {loading ? (
                <>
                  <div className="planner-spinner"></div>
                  <span>{t.sections.generate.loading}</span>
                </>
              ) : (
                <span>✨ {t.sections.generate.button}</span>
              )}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// User-Friendly Form Field Component with Icons and Enhanced Design
function UserFriendlyField({
  label,
  type,
  value,
  onChange,
  options,
  placeholder,
  step,
  focused,
  onFocus,
  onBlur,
  icon
}: {
  label: string;
  type: "select" | "number" | "text";
  value: string;
  onChange: (value: string) => void;
  options?: { value: string; label: string }[];
  placeholder?: string;
  step?: string;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  icon?: string;
}) {
  const hasValue = value && value.length > 0;

  return (
    <div className={`planner-field ${focused ? 'focused' : ''} ${hasValue ? 'has-value' : ''}`}>
      <div className="planner-field-header">
        {icon && <span className="planner-field-icon">{icon}</span>}
        <label className="planner-field-label">{label}</label>
        {hasValue && <span className="planner-field-checkmark">✓</span>}
      </div>
      
      <div>
        {type === "select" ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            className="planner-field-input"
          >
            {options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={placeholder}
            step={step}
            className="planner-field-input"
          />
        )}
      </div>
    </div>
  );
}

// Helper Functions
function getAccuracyWidth(accuracy: string): string {
  switch (accuracy) {
    case "high": return "100%";
    case "med": return "65%";
    case "low": return "30%";
    default: return "0%";
  }
}
