import { useMemo, useState } from "react";
import { useLang } from "./LanguageContext";
import type { Sens } from "./sensitivity";
import {
  SCOPES, ENGINES,
  type EngineId, type ScopeId, type SensitivityProfile,
} from "./apex";
import {
  deviceClassOf, analyzeCurrent, profileCoherence, confidenceOf,
  buildExpertResult, PROBLEM_CODES,
  type ExpertContext, type ProblemCode, type CurrentAnalysis,
} from "./apex/model";
import {
  startIteration, applyFeedback, applyProblems,
  FEEDBACK_CODES, FEEDBACK_LABELS,
  type IterationRun, type FeedbackCode,
} from "./apex/feedback";

/* ── Problem labels (ar/en) ──────────────────────────────────── */
const PROBLEM_LABELS: Record<ProblemCode, { ar: string; en: string }> = {
  overshoot:       { ar: "تجاوز الهدف", en: "Overshoot" },
  undershoot:      { ar: "لا أصل للهدف", en: "Undershoot" },
  shakyGyro:       { ar: "اهتزاز الجايرو", en: "Shaky gyro" },
  slowTurning:     { ar: "دوران بطيء", en: "Slow turning" },
  poorTracking:    { ar: "تتبع ضعيف", en: "Poor tracking" },
  poorMicro:       { ar: "مايكرو ضعيف", en: "Poor micro-adjustment" },
  unstableHiMag:   { ar: "سكوبات عالية غير مستقرة", en: "Unstable high magnification" },
  recoilUp:        { ar: "الارتداد يصعد", en: "Recoil goes up" },
  recoilLeft:      { ar: "الارتداد يسار", en: "Recoil left" },
  recoilRight:     { ar: "الارتداد يمين", en: "Recoil right" },
  horizontalDrift: { ar: "انجراف أفقي", en: "Horizontal drift" },
  verticalDrift:   { ar: "انجراف عمودي", en: "Vertical drift" },
};

const REASON_TEXT: Record<string, { ar: string; en: string }> = {
  tighten_stability: { ar: "تشديد السكوب للثبات", en: "scope tightened for stability" },
  pull_head:         { ar: "سحب الجايرو لمستوى الرأس", en: "gyro pull-down raised for head level" },
  boost_turn:        { ar: "رفع السرعة للقربان/الدوران", en: "close-range turn speed raised" },
  fix_overshoot:     { ar: "تقليل تجاوز الهدف", en: "overshoot reduced" },
  fix_shake:         { ar: "تقليل الاهتزاز", en: "shake reduced" },
  fix_transition:    { ar: "إصلاح انتقال السكوب", en: "scope-transition coherence repair" },
  hw_track:          { ar: "تعويض التتبع الأفقي", en: "horizontal tracking compensation" },
  micro_reduce:      { ar: "تقليل مايكرو السكوبات العالية", en: "high-mag micro reduced" },
  preserve_strength: { ar: "قيمة قوية محفوظة", en: "strength preserved" },
};

const SCOPE_LABEL: Record<ScopeId, string> = {
  tpp: "TPP", fpp: "FPP", red: "Red Dot", scope2: "2×", scope3: "3×", scope4: "4×", scope6: "6×", scope8: "8×",
};
const ENGINE_LABEL: Record<EngineId, string> = {
  cam: "Camera", ads: "ADS", gyroCam: "Gyro Cam", gyroAds: "Gyro ADS",
};

interface Props {
  sens: Sens;
  ctx: {
    deviceName: string; fps: number; touchRate: number; screenSize: number; ppi: number;
    fingers: number; gyroMode: "off" | "scope" | "always";
    weaponName: string; weaponType: string; styleId: string;
    mode: string; targetStyle: string; range: string; aimPriority: string;
  };
  onApply: (profile: SensitivityProfile, freeLook: { cam: number; parashoot: number; vehicle: number }) => void;
}

function toProfile(s: Sens): SensitivityProfile {
  return { cam: { ...s.cam }, ads: { ...s.ads }, gyroCam: { ...s.gyroCam }, gyroAds: { ...s.gyroAds } };
}

export function ExpertSection({ sens, ctx, onApply }: Props) {
  const { lang } = useLang();
  const isAr = lang === "ar";

  const expertCtx: ExpertContext = useMemo(() => ({
    deviceClass: deviceClassOf(ctx.screenSize),
    deviceName: ctx.deviceName, fps: ctx.fps, touchRate: ctx.touchRate,
    screenSize: ctx.screenSize, ppi: ctx.ppi,
    fingers: ctx.fingers, gyroMode: ctx.gyroMode,
    weaponName: ctx.weaponName, weaponType: ctx.weaponType,
    playStyle: ctx.styleId, mode: ctx.mode, targetStyle: ctx.targetStyle,
    range: ctx.range, aimPriority: ctx.aimPriority,
  }), [ctx]);

  const modelOptimum = useMemo(() => toProfile(sens), [sens]);

  const [showInputs, setShowInputs] = useState(false);
  const [current, setCurrent] = useState<SensitivityProfile>(() => toProfile(sens));
  const [freeLook, setFreeLook] = useState({ cam: sens.freeLook.cam, parashoot: sens.freeLook.parashoot, vehicle: sens.freeLook.vehicle });
  const [analysis, setAnalysis] = useState<CurrentAnalysis | null>(null);
  const [run, setRun] = useState<IterationRun | null>(null);
  const [baselineV1, setBaselineV1] = useState<SensitivityProfile | null>(null);
  const [problems, setProblems] = useState<ProblemCode[]>([]);
  const [feedback, setFeedback] = useState<FeedbackCode | null>(null);
  const [applied, setApplied] = useState(false);

  const confidence = useMemo(() => confidenceOf(expertCtx, analysis !== null || run !== null, run ? run.version - 1 : 0), [expertCtx, analysis, run]);

  const inputValue = (engine: EngineId, scope: ScopeId): number => current[engine][scope];
  const setInputValue = (engine: EngineId, scope: ScopeId, v: number) => {
    setAnalysis(null); setApplied(false);
    setCurrent((prev) => ({ ...prev, [engine]: { ...prev[engine], [scope]: Math.max(1, Math.min(engine === "gyroCam" || engine === "gyroAds" ? 400 : 300, Math.round(v || 0))) } }));
  };

  const runV1 = () => {
    const a = analyzeCurrent(current, modelOptimum);
    setAnalysis(a);
    const next = startIteration(current);
    setRun(next);
    setBaselineV1({ cam: { ...current.cam }, ads: { ...current.ads }, gyroCam: { ...current.gyroCam }, gyroAds: { ...current.gyroAds } });
    setApplied(false);
  };

  const applyProblemsClick = () => {
    if (!run) return;
    const base = baselineV1 ?? modelOptimum;
    const meta = Object.fromEntries(PROBLEM_CODES.map((p) => [p, {
      reasonKey: p === "recoilUp" ? "pull_head" as const
        : p === "overshoot" ? "fix_overshoot" as const
        : p === "shakyGyro" ? "fix_shake" as const
        : p === "recoilLeft" || p === "recoilRight" || p === "horizontalDrift" ? "hw_track" as const
        : p === "unstableHiMag" || p === "poorMicro" || p === "verticalDrift" ? "micro_reduce" as const
        : "boost_turn" as const,
      label: isAr ? PROBLEM_LABELS[p].en : PROBLEM_LABELS[p].en,
    }]));
    const stepped = applyProblems(run, base, problems, meta);
    setRun(stepped);
  };

  const applyFeedbackClick = () => {
    if (!run || !feedback) return;
    const stepped = applyFeedback(run, baselineV1 ?? modelOptimum, feedback);
    setRun(stepped);
  };

  const applyToApp = () => {
    if (!run) return;
    onApply(run.profile, freeLook);
    setApplied(true);
  };

  const coherence = run ? Math.round((run.transitionScores.cam + run.transitionScores.ads + run.transitionScores.gyroCam + run.transitionScores.gyroAds) / 4) : profileCoherence(current);

  const versions = [1, 2, 3, 4, 5];
  const versionLabel = (v: number) => v === 5 ? "FINAL" : `V${v}`;

  return (
    <div className="card relative overflow-hidden rounded-2xl p-5">
      <div className="absolute -top-16 -left-16 h-48 w-48 rounded-full bg-orange-500/10 blur-3xl" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-black text-white">{isAr ? "هندسة التصويب التكيفية — الخبير" : "Adaptive Aim Engineering — Expert"}</h3>
              <span className="rounded bg-gradient-to-r from-orange-500 to-red-500 px-1.5 py-0.5 text-[8px] font-black tracking-widest text-white">PRO</span>
            </div>
            <p className="text-[10px] text-white/50">
              {isAr
                ? `${expertCtx.deviceName} · ${expertCtx.deviceClass} · ${ctx.fps} FPS · ${ctx.fingers} أصابع · ${ctx.gyroMode} · ${ctx.weaponName} · ${ctx.styleId}`
                : `${expertCtx.deviceName} · ${expertCtx.deviceClass} · ${ctx.fps} FPS · ${ctx.fingers} fingers · ${ctx.gyroMode} · ${ctx.weaponName} · ${ctx.styleId}`}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${confidence.level === "HIGH" ? "bg-emerald-500/15 text-emerald-300" : confidence.level === "MEDIUM" ? "bg-amber-500/15 text-amber-300" : "bg-red-500/15 text-red-300"}`}>
            {confidence.level} · {confidence.score}/100
          </span>
        </div>

        {/* Version pills */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {versions.map((v) => (
            <span key={v} className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${run && run.version === v ? "bg-orange-500/20 text-orange-300" : run && run.version > v ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-white/35"}`}>
              {versionLabel(v)}
            </span>
          ))}
          <span className="ms-auto text-[9px] text-white/40">{isAr ? "تماسك السكوبات" : "scope coherence"}: <b className={coherence >= 80 ? "text-emerald-300" : coherence >= 60 ? "text-amber-300" : "text-red-300"}>{coherence}%</b></span>
        </div>

        {/* Current sensitivity inputs (collapsible) */}
        <div className="mt-3 rounded-xl border border-white/5 bg-black/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-display text-[10px] font-bold tracking-widest text-white/70">{isAr ? "حساسيتك الحالية" : "YOUR CURRENT SENSITIVITY"}</div>
            <button onClick={() => setShowInputs((v) => !v)} className="btn-ghost rounded-lg px-2.5 py-1 text-[10px]">
              {showInputs ? (isAr ? "إخفاء" : "Hide") : (isAr ? "تعديل" : "Edit")}
            </button>
          </div>
          {showInputs && (
            <div className="mt-3 space-y-3">
              {ENGINES.map((engine) => (
                <div key={engine}>
                  <div className="mb-1 text-[9px] font-bold tracking-widest text-orange-300/80">{ENGINE_LABEL[engine]}</div>
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                    {SCOPES.map((scope) => (
                      <label key={scope} className="block rounded-lg border border-white/5 bg-black/40 p-1 text-center">
                        <span className="block text-[8px] text-white/40">{SCOPE_LABEL[scope]}</span>
                        <input
                          type="number"
                          min={1}
                          max={engine === "gyroCam" || engine === "gyroAds" ? 400 : 300}
                          value={inputValue(engine, scope)}
                          onChange={(e) => setInputValue(engine, scope, Number(e.target.value))}
                          className="mt-0.5 w-full bg-transparent text-center font-display text-xs font-bold text-white outline-none"
                          dir="ltr"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-1.5">
                {(["cam", "parashoot", "vehicle"] as const).map((k) => (
                  <label key={k} className="block rounded-lg border border-white/5 bg-black/40 p-1 text-center">
                    <span className="block text-[8px] text-white/40">{k === "cam" ? (isAr ? "نظرة حرة" : "Free Cam") : k === "parashoot" ? (isAr ? "مظلة" : "Parachute") : (isAr ? "مركبة" : "Vehicle")}</span>
                    <input
                      type="number" min={1} max={300} value={freeLook[k]}
                      onChange={(e) => setFreeLook((p) => ({ ...p, [k]: Math.max(1, Math.min(300, Math.round(Number(e.target.value) || 0))) }))}
                      className="mt-0.5 w-full bg-transparent text-center font-display text-xs font-bold text-orange-300 outline-none" dir="ltr"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={runV1} className="btn-primary rounded-xl px-4 py-2 text-xs">{isAr ? "تحليل الحساسية → V1" : "ANALYZE CURRENT → V1"}</button>
            <button
              onClick={() => { setCurrent(toProfile(sens)); setFreeLook({ cam: sens.freeLook.cam, parashoot: sens.freeLook.parashoot, vehicle: sens.freeLook.vehicle }); setRun(null); setAnalysis(null); setApplied(false); setBaselineV1(null); }}
              className="btn-ghost rounded-xl px-4 py-2 text-xs"
            >
              {isAr ? "إعادة" : "Reset"}
            </button>
          </div>
        </div>

        {/* Analysis output (V1) */}
        {analysis && (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-emerald-400/15 bg-emerald-500/5 p-2.5 text-center">
                <div className="font-display text-2xl font-black text-emerald-300">{analysis.strengths.length}</div>
                <div className="text-[9px] text-white/50">{isAr ? "قيم قوية محفوظة" : "strengths preserved"}</div>
              </div>
              <div className="rounded-lg border border-amber-400/15 bg-amber-500/5 p-2.5 text-center">
                <div className="font-display text-2xl font-black text-amber-300">{analysis.outliers.length}</div>
                <div className="text-[9px] text-white/50">{isAr ? "قيم شاذة" : "outliers detected"}</div>
              </div>
              <div className="rounded-lg border border-sky-400/15 bg-sky-500/5 p-2.5 text-center">
                <div className="font-display text-2xl font-black text-sky-300">{analysis.transitionIssues.length}</div>
                <div className="text-[9px] text-white/50">{isAr ? "مشاكل انتقال" : "transition issues"}</div>
              </div>
            </div>
            {analysis.outliers.length > 0 && (
              <div className="rounded-lg border border-white/5 bg-black/30 p-2.5">
                <div className="mb-1.5 text-[9px] font-bold tracking-widest text-amber-300/80">{isAr ? "القيم الشاذة (انحراف فوق ±15% عن النموذج)" : "Outliers (deviate >±15% from model)"}</div>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.outliers.map((o) => (
                    <span key={`${o.engine}.${o.scope}`} className="rounded bg-amber-500/10 px-2 py-0.5 text-[9px] text-amber-200" dir="ltr">
                      {ENGINE_LABEL[o.engine]} {SCOPE_LABEL[o.scope]}: {o.value} ({o.deltaPct > 0 ? "+" : ""}{o.deltaPct}%)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Problems (diagnostic strategy) */}
        {run && (
          <div className="mt-4 rounded-xl border border-white/5 bg-black/30 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="font-display text-[10px] font-bold tracking-widest text-white/70">{isAr ? "مشاكل اللعب الحالية" : "CURRENT PLAY PROBLEMS — diagnostic strategy"}</div>
              <button onClick={applyProblemsClick} disabled={problems.length === 0} className="btn-ghost rounded-lg px-3 py-1.5 text-[10px] disabled:opacity-40">
                {isAr ? "تطبيق استراتيجية المشاكل" : "Apply problems strategy"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PROBLEM_CODES.map((p) => (
                <button
                  key={p}
                  onClick={() => setProblems((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])}
                  className={`chip rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${problems.includes(p) ? "active" : ""}`}
                >
                  {isAr ? PROBLEM_LABELS[p].ar : PROBLEM_LABELS[p].en}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Feedback feedback → iterate */}
        {run && (
          <div className="mt-3 rounded-xl border border-white/5 bg-black/30 p-4">
            <div className="mb-2 font-display text-[10px] font-bold tracking-widest text-white/70">{isAr ? "التغذية الراجعة بعد الاختبار" : "POST-TEST FEEDBACK — one problem / one adjustment"}</div>
            <div className="flex flex-wrap gap-1.5">
              {FEEDBACK_CODES.map((code) => (
                <button
                  key={code}
                  onClick={() => setFeedback((prev) => prev === code ? null : code)}
                  className={`chip rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${feedback === code ? "active" : ""}`}
                >
                  {isAr ? FEEDBACK_LABELS[code].ar : FEEDBACK_LABELS[code].en}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={applyFeedbackClick} disabled={!feedback || run.locked} className="btn-primary rounded-xl px-4 py-2 text-xs disabled:opacity-40">
                {isAr ? `تطبيق التغذية → ${versionLabel(Math.min(run.version + 1, 5))}` : `APPLY FEEDBACK → ${versionLabel(Math.min(run.version + 1, 5))}`}
              </button>
              {run.locked && <span className="rounded-full bg-emerald-500/15 px-3 py-2 text-[10px] font-bold text-emerald-300">🔒 FINAL</span>}
            </div>
          </div>
        )}

        {/* Iteration changes — Before/After */}
        {run && run.changes.length > 0 && (
          <div className="mt-3 rounded-xl border border-white/5 bg-black/30 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="font-display text-[10px] font-bold tracking-widest text-white/70">
                {isAr ? `التغيّرات — ${versionLabel(run.version)}` : `CHANGES — ${versionLabel(run.version)}`}
              </div>
              <span className="text-[9px] text-white/40">{isAr ? "القيم القوية محفوظة بدون لمس" : "strong values are preserved untouched"}</span>
            </div>
            <div className="dns-scroll max-h-[260px] overflow-auto rounded-xl border border-white/5">
              <table className="w-full min-w-[520px] border-separate border-spacing-0 text-left text-[11px]">
                <thead className="sticky top-0 z-10 bg-[#0c0700]/95 text-white/50 backdrop-blur">
                  <tr>
                    <th className="px-2 py-1.5">{isAr ? "القناة" : "Channel"}</th>
                    <th className="px-2 py-1.5">{isAr ? "السكوب" : "Scope"}</th>
                    <th className="px-2 py-1.5">{isAr ? "الحالي" : "Before"}</th>
                    <th className="px-2 py-1.5">{isAr ? "الأمثل" : "After"}</th>
                    <th className="px-2 py-1.5">{isAr ? "التغيّر" : "Change"}</th>
                    <th className="px-2 py-1.5">{isAr ? "السبب" : "Reason"}</th>
                  </tr>
                </thead>
                <tbody>
                  {run.changes.map((c, i) => (
                    <tr key={`${c.engine}.${c.scope}.${i}`} className="border-t border-white/5">
                      <td className="px-2 py-1.5 text-white/70">{ENGINE_LABEL[c.engine]}</td>
                      <td className="px-2 py-1.5 font-bold text-orange-300">{SCOPE_LABEL[c.scope]}</td>
                      <td className="px-2 py-1.5 font-display tabular-nums text-white/80" dir="ltr">{c.from}</td>
                      <td className="px-2 py-1.5 font-display font-bold tabular-nums text-cyan-300" dir="ltr">{c.to}</td>
                      <td className={`px-2 py-1.5 font-display font-bold tabular-nums ${c.pct > 0 ? "text-emerald-300" : c.pct < 0 ? "text-red-300" : "text-white/40"}`} dir="ltr">
                        {c.pct > 0 ? "+" : ""}{c.pct}%
                      </td>
                      <td className="px-2 py-1.5 text-[10px] text-white/50">{isAr ? REASON_TEXT[c.reasonKey].ar : REASON_TEXT[c.reasonKey].en}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Apply to app + structured output */}
        {run && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={applyToApp} className={`rounded-xl px-4 py-2 text-xs ${applied ? "bg-emerald-600 text-white" : "btn-primary"}`}>
              {applied ? `✓ ${isAr ? "مُطبق" : "Applied"}` : isAr ? "تطبيق على المولّد" : "Apply to generator"}
            </button>
            <details className="group">
              <summary className="btn-ghost cursor-pointer rounded-xl px-4 py-2 text-xs list-none">{isAr ? "نتيجة منظمة (JSON)" : "Structured result (JSON)"}</summary>
              <pre className="dns-scroll mt-2 max-h-[260px] overflow-auto rounded-xl border border-white/5 bg-black/40 p-3 text-[9px] leading-relaxed text-sky-200/80" dir="ltr">
                {JSON.stringify(buildExpertResult(expertCtx, run.profile, freeLook, run.history, analysis ? analysis.outliers.map((o) => `${ENGINE_LABEL[o.engine]}.${SCOPE_LABEL[o.scope]} ${o.deltaPct}% outlier`) : [], run.version), null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
