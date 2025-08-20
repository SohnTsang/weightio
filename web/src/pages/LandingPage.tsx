import { useEffect, useRef, useState } from "react";
import "../App.css"; // ensure global styles are bundled in production (relative to src/pages/)

// Minimal, professional landing page for Weightio
// – Intentional whitespace, strong type, gentle reveal-on-scroll only
// – Japanese / English toggle
// – No external libraries, no emoji icons, no heavy effects

type Props = {
  onGetStarted: () => void;
};

export default function LandingPage({ onGetStarted }: Props) {
  const [lang, setLang] = useState<"ja" | "en">("ja");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return; // respect accessibility: no reveal animations

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("in");
        });
      },
      { rootMargin: "-10% 0px -10% 0px", threshold: 0.1 }
    );

    const els = root.querySelectorAll(".reveal");
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const copy = {
    ja: {
      nav: { product: "機能", how: "使い方", stories: "声", get: "無料で始める" },
      hero: {
        eyebrow: "WEIGHTIO",
        title: "本当に自分を変えたいなら　ここで始めよう",
        subhead: "生活にフィットするトレーニング",
        expl: "無駄のないデータ設計で、筋力・健康・習慣を最短化。数秒であなた用のプランを作成。",
        primary: "無料で始める",
        secondary: "使い方を見る",
      },
      trust: { caption: "シンプル、明快、続けられる。" },
      features: {
        title: "必要なものだけ、強く。",
        items: [
          { h: "無駄なし", p: "質問は最小限。日数と器具を選ぶだけ。記録に合わせて自動で更新。" },
          { h: "数字で明快", p: "カロリーとマクロを目標に合わせて算出。予算別の食材セットにも対応。" },
          { h: "かしこく継続", p: "進捗に合わせてボリュームや休養を自動調整。無理なく伸ばす設計。" },
        ],
      },
      pains: {
        title: "よくあるつまずき → Weightioの解決",
        issues: [
          { p: "時間がない・迷う", s: "1分でプラン。今日は何をやるかが即決。" },
          { p: "続かない", s: "週の予定に合わせた現実的なボリューム設計。" },
          { p: "器具が限られる", s: "自重〜ダンベルだけでも成立する選定。" },
          { p: "食事が難しい", s: "食材×グラムだけのシンプル配分。予算別で提案。" },
          { p: "ケガや不安", s: "痛みの部位を避けた代替案と自動セット調整。" },
        ],
      },
      nutrition: {
        title: "料理いらずの食材設計",
        points: [
          { h: "予算に合わせる", p: "Low/Medium/Highの3段階で無理なく。" },
          { h: "グラムで提案", p: "各食事でP・C・Fが±10%に収まるように。" },
          { h: "トレ日最適化", p: "必要ならトレ後に炭水化物を+10–15%。" },
        ],
      },
      adapt: {
        title: "記録するほど、賢くなる",
        items: [
          { k: "Day 1", h: "スタート", p: "分量は控えめ。フォーム重視。" },
          { k: "Week 2", h: "調整", p: "楽なら重量+2.5–5%。辛ければセットを−1。" },
          { k: "Week 4", h: "オートデロード", p: "疲労が溜まったら自動で負荷を下げる。" },
        ],
      },
      voice: {
        title: "続けやすいから、結果が出る",
        quote:
          "アプリの指示が明確で、悩む時間がなくなりました。忙しくても継続できています。",
        meta: "会社員・30代前半",
      },
      cta: { title: "今日から、迷いのないトレーニングへ。", action: "無料で始める" },
      footer: { small: "データに基づく一般的な提案です。医療的助言ではありません。" },
    },
    en: {
      nav: { product: "Product", how: "How it works", stories: "Stories", get: "Get started" },
      hero: {
        eyebrow: "WEIGHTIO",
        title: "If you truly want to change, start here",
        subhead: "Training that fits your life",
        expl: "Clean, data‑driven planning for strength, health, and habit. Your program in seconds.",
        primary: "Get your plan",
        secondary: "See how it works",
      },
      trust: { caption: "Clarity over clutter. Built for consistency." },
      features: {
        title: "Only what matters, beautifully",
        items: [
          { h: "Focused setup", p: "Just days per week and equipment. Adapts as you log." },
          { h: "Clear numbers", p: "Calories and macros matched to your goal and budget tier." },
          { h: "Smart progress", p: "Volume and deloads adjust to your readiness—no guesswork." },
        ],
      },
      pains: {
        title: "Frictions → What Weightio does",
        issues: [
          { p: "No time / decision fatigue", s: "Plan in a minute. Clear do‑this‑today." },
          { p: "Hard to stay consistent", s: "Realistic weekly volume for your schedule." },
          { p: "Limited equipment", s: "Bodyweight/dumbbell‑only tracks that still work." },
          { p: "Nutrition is confusing", s: "Ingredient + grams, budget‑aware choices." },
          { p: "Injury worries", s: "Swap moves and auto‑reduce sets for sore regions." },
        ],
      },
      nutrition: {
        title: "Ingredient‑only nutrition",
        points: [
          { h: "Budget aware", p: "Low/Medium/High tiers." },
          { h: "By the grams", p: "Per‑meal macros land within ±10%." },
          { h: "Train‑day bias", p: "Optionally shift carbs post‑workout." },
        ],
      },
      adapt: {
        title: "The more you log, the smarter it gets",
        items: [
          { k: "Day 1", h: "Start", p: "Technique first, modest dose." },
          { k: "Week 2", h: "Tune", p: "+2.5–5% if easy, −1 set if grindy." },
          { k: "Week 4", h: "Auto‑deload", p: "Back off when fatigue accumulates." },
        ],
      },
      voice: {
        title: "Easy to keep, easy to see results",
        quote:
          "No fluff, just what to do today. I finally stopped second‑guessing and started progressing.",
        meta: "Office worker, early 30s",
      },
      cta: { title: "Start training without the noise.", action: "Get started" },
      footer: { small: "General recommendations based on your inputs. Not medical advice." },
    },
  } as const;

  const t = copy[lang];

  return (
    <div ref={rootRef} className="lp">
      {/* Header */}
      <header className="lp-header">
        <div className="container row between center">
          <div className="brand">WEIGHTIO</div>
          <nav className="nav">
            <a href="#product">{t.nav.product}</a>
            <a href="#how">{t.nav.how}</a>
            <a href="#stories">{t.nav.stories}</a>
            <button className="btn btn--ghost" onClick={onGetStarted}>{t.nav.get}</button>
            <div className="lang">
              <button aria-label="Switch to Japanese" className={"lang-btn" + (lang === "ja" ? " is-active" : "")} onClick={() => setLang("ja")}>日</button>
              <button aria-label="Switch to English" className={"lang-btn" + (lang === "en" ? " is-active" : "")} onClick={() => setLang("en")}>EN</button>
            </div>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="hero">
        <div className="container grid hero-grid">
          <div className="hero-copy reveal">
            <div className="eyebrow">{t.hero.eyebrow}</div>
            <h1 className="h1">{t.hero.title}</h1>
            <p className="subhead">{t.hero.subhead}</p>
            <p className="lead">{t.hero.expl}</p>
            <div className="cta">
              <button className="btn" onClick={onGetStarted}>{t.hero.primary}</button>
              <a href="#how" className="link">{t.hero.secondary}</a>
            </div>
          </div>
          <div className="hero-card reveal" aria-hidden>
            <div className="panel">
              <div className="metric">
                <span className="label">Today</span>
                <strong className="value">Upper Body · 45 min</strong>
              </div>
              <div className="divider" />
              <div className="rows">
                <div className="row between">
                  <span>Bench Press</span>
                  <span className="muted">4×6 @ RPE 7</span>
                </div>
                <div className="row between">
                  <span>Row</span>
                  <span className="muted">4×8</span>
                </div>
                <div className="row between">
                  <span>Shoulder Press</span>
                  <span className="muted">3×10</span>
                </div>
              </div>
              <div className="fine muted">* Example preview. Adjusted after you log.</div>
            </div>
          </div>
        </div>
        <p className="trust muted reveal">{t.trust.caption}</p>
      </section>

      {/* Features */}
      <section id="product" className="section">
        <div className="container">
          <h2 className="h2 reveal">{t.features.title}</h2>
          <div className="grid features">
            {t.features.items.map((f, i) => (
              <article className="card reveal" key={i}>
                <h3 className="h3">{f.h}</h3>
                <p>{f.p}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pains → Solutions (split layout) */}
      <section className="section alt">
        <div className="container grid split">
          <div className="reveal">
            <h2 className="h2">{t.pains.title}</h2>
            <ul className="bullets">
              {t.pains.issues.map((it, i) => (
                <li key={i}><strong>{it.p}</strong></li>
              ))}
            </ul>
          </div>
          <div className="reveal solutions">
            {t.pains.issues.map((it, i) => (
              <div className="solution" key={i}>
                <div className="badge">{String(i + 1).padStart(2, "0")}</div>
                <div>
                  <div className="muted small">解決 / Solution</div>
                  <div>{it.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works (steps layout already distinct) */}
      <section id="how" className="section">
        <div className="container">
          <h2 className="h2 reveal">{t.adapt.title}</h2>
          <div className="grid steps">
            {t.adapt.items.map((s: {k: string, h: string, p: string}, i: number) => (
              <div className="step reveal" key={i}>
                <div className="num" aria-hidden>{s.k}</div>
                <h3 className="h4">{s.h}</h3>
                <p className="muted">{s.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Nutrition (cards row) */}
      <section id="nutrition" className="section alt">
        <div className="container">
          <h2 className="h2 reveal">{t.nutrition.title}</h2>
          <div className="grid features">
            {t.nutrition.points.map((n, i) => (
              <article className="card reveal" key={i}>
                <h3 className="h3">{n.h}</h3>
                <p>{n.p}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Adaptation timeline (distinct visual) */}
      <section id="adapt" className="section">
        <div className="container">
          <h2 className="h2 reveal">{t.adapt.title}</h2>
          <div className="timeline">
            {t.adapt.items.map((a, i) => (
              <div className="t-item reveal" key={i}>
                <div className="t-dot" />
                <div className="t-card">
                  <div className="small muted">{a.k}</div>
                  <div className="h4">{a.h}</div>
                  <p className="muted">{a.p}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Voice */}
      <section id="stories" className="section">
        <div className="container narrow">
          <h2 className="h2 reveal">{t.voice.title}</h2>
          <blockquote className="quote reveal">
            <p>“{t.voice.quote}”</p>
            <footer className="muted">{t.voice.meta}</footer>
          </blockquote>
        </div>
      </section>

      {/* CTA band */}
      <section className="band">
        <div className="container row between center">
          <h3 className="h3 mb0">{t.cta.title}</h3>
          <button className="btn" onClick={onGetStarted}>{t.cta.action}</button>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="container row between wrap gap">
          <div className="muted small">© {new Date().getFullYear()} Weightio</div>
          <div className="muted small">{t.footer.small}</div>
        </div>
      </footer>
    </div>
  );
}
