import { useLang } from "./LanguageContext";
import { t } from "./i18n";
import {
  type OptimizationResult, type GGModeId, type TargetStyle, type CombatRange, type AimPriority, type GyroMode,
  type ScopeSens, type ScopeId,
} from "./apex";

interface ApexPanelProps {
  active: boolean;
  onToggle: () => void;
  mode: GGModeId; setMode: (m: GGModeId) => void;
  targetStyle: TargetStyle; setTargetStyle: (v: TargetStyle) => void;
  range: CombatRange; setRange: (v: CombatRange) => void;
  aimPriority: AimPriority; setAimPriority: (v: AimPriority) => void;
  gyroMode: GyroMode; setGyroMode: (v: GyroMode) => void;
  result: OptimizationResult | null;
}

const MODES: GGModeId[] = ["aggressive", "balanced", "control", "precision", "competitive", "head", "spray"];
const STYLES: TargetStyle[] = ["static", "strafe", "fast", "mixed"];
const RANGES: CombatRange[] = ["close", "mid", "long", "mixed"];
const PRIOS: AimPriority[] = ["head", "balanced", "recoil", "precision"];
const GYROS: { id: GyroMode; icon: string }[] = [
  { id: "off", icon: "⭕" }, { id: "scope", icon: "🎯" }, { id: "always", icon: "🔄" },
];

const OBJECTIVES: { key: keyof OptimizationResult["scores"]; labelKey: string; color: string }[] = [
  { key: "head", labelKey: "gg_obj_head", color: "from-rose-500 to-red-500" },
  { key: "tracking", labelKey: "gg_obj_tracking", color: "from-orange-500 to-amber-500" },
  { key: "adhesion", labelKey: "gg_obj_adhesion", color: "from-amber-500 to-yellow-500" },
  { key: "recoil", labelKey: "gg_obj_recoil", color: "from-red-500 to-orange-500" },
  { key: "micro", labelKey: "gg_obj_micro", color: "from-sky-500 to-cyan-400" },
  { key: "stability", labelKey: "gg_obj_stability", color: "from-emerald-500 to-teal-500" },
  { key: "rotation", labelKey: "gg_obj_rotation", color: "from-indigo-500 to-purple-500" },
  { key: "targetSwitch", labelKey: "gg_obj_targetSwitch", color: "from-fuchsia-500 to-pink-500" },
  { key: "precision", labelKey: "gg_obj_precision", color: "from-violet-500 to-indigo-500" },
];

const SCOPE_ROWS: { key: keyof OptimizationResult["scopePerformance"]; labelKey: string }[] = [
  { key: "tpp", labelKey: "sens_scope_tpp" }, { key: "fpp", labelKey: "sens_scope_fpp" },
  { key: "red", labelKey: "sens_scope_red" }, { key: "scope2", labelKey: "sens_scope_2x" },
  { key: "scope3", labelKey: "sens_scope_3x" }, { key: "scope4", labelKey: "sens_scope_4x" },
  { key: "scope6", labelKey: "sens_scope_6x" }, { key: "scope8", labelKey: "sens_scope_8x" },
];

const IMPACT_ICON: Record<string, string> = { boost: "▲", reduce: "▼", stabilize: "■", tune: "◆" };
const IMPACT_COLOR: Record<string, string> = { boost: "text-emerald-300", reduce: "text-red-300", stabilize: "text-sky-300", tune: "text-amber-300" };

function Chip<T extends string>({ value, options, getKey, onChange }: { value: T; options: readonly T[]; getKey: (o: T) => string; onChange: (v: T) => void }) {
  const { lang } = useLang();
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} className={`chip rounded-lg px-3 py-1.5 text-[11px] font-semibold ${value === o ? "active" : ""}`}>{t(getKey(o) as never, lang)}</button>
      ))}
    </div>
  );
}

export function ApexPanel(props: ApexPanelProps) {
  const { lang } = useLang();
  const isAr = lang === "ar";
  const { active, onToggle, mode, setMode, targetStyle, setTargetStyle, range, setRange, aimPriority, setAimPriority, gyroMode, setGyroMode, result } = props;
  const r = result;
  const supreme = r?.scores.supreme ?? 0;
  const supremeColor = supreme >= 85 ? "text-emerald-300" : supreme >= 70 ? "text-amber-300" : "text-orange-300";

  return (
    <div className="card relative overflow-hidden rounded-2xl p-5">
      <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-fuchsia-500/10 blur-3xl" />
      <div className="absolute inset-0 bg-grid opacity-10" />
      <div className="relative">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${active ? "border-fuchsia-400/50 bg-fuchsia-500/20" : "border-white/10 bg-white/[0.03]"}`}>
              <span className="text-xl">⚡</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base font-black text-white">{t("gg_title", lang)}</h3>
                <span className="rounded bg-gradient-to-r from-fuchsia-500 to-purple-600 px-1.5 py-0.5 text-[8px] font-black tracking-widest text-white">{t("gg_supreme_pro", lang)}</span>
              </div>
              <p className="text-[10px] text-white/50">{t("gg_tagline", lang)}</p>
            </div>
          </div>
          <button onClick={onToggle} className={`rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${active ? "border border-fuchsia-400/50 bg-fuchsia-500/20 text-fuchsia-200" : "btn-primary"}`}>
            {active ? `✓ ${t("gg_active", lang)}` : `⚡ ${t("gg_activate", lang)}`}
          </button>
        </div>

        {/* Feature chips */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {[
            ["gg_feat_head", "🧠"], ["gg_feat_tracking", "🎯"], ["gg_feat_recoil", "🔥"],
            ["gg_feat_micro", "🔬"], ["gg_feat_stability", "📊"], ["gg_feat_rotation", "🔄"],
          ].map(([k, ic]) => (
            <span key={k} className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[9px] font-bold tracking-wide text-white/70">
              <span>{ic}</span>{t(k as never, lang)}
            </span>
          ))}
        </div>

        {active && (
          <>
            {/* Advanced calibration */}
            <div className="mt-5 space-y-3 rounded-xl border border-white/5 bg-black/30 p-4">
              <div className="font-display text-[10px] font-bold tracking-widest text-fuchsia-300">⚙ {t("gg_calibration", lang)}</div>
              <div>
                <div className="mb-1.5 text-[10px] text-white/50">{t("gg_profile_mode", lang)}</div>
                <Chip value={mode} options={MODES} getKey={(o) => ("gg_mode_" + o) as never} onChange={setMode} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1.5 text-[10px] text-white/50">{t("gg_target_style", lang)}</div>
                  <Chip value={targetStyle} options={STYLES} getKey={(o) => ("gg_ts_" + o) as never} onChange={setTargetStyle} />
                </div>
                <div>
                  <div className="mb-1.5 text-[10px] text-white/50">{t("gg_combat_range", lang)}</div>
                  <Chip value={range} options={RANGES} getKey={(o) => ("gg_range_" + o) as never} onChange={setRange} />
                </div>
                <div>
                  <div className="mb-1.5 text-[10px] text-white/50">{t("gg_aim_priority", lang)}</div>
                  <Chip value={aimPriority} options={PRIOS} getKey={(o) => ("gg_ap_" + o) as never} onChange={setAimPriority} />
                </div>
                <div>
                  <div className="mb-1.5 text-[10px] text-white/50">{t("gyro_title", lang)}</div>
                  <div className="flex flex-wrap gap-2">
                    {GYROS.map((g) => (
                      <button key={g.id} onClick={() => setGyroMode(g.id)} className={`chip flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold ${gyroMode === g.id ? "active" : ""}`}><span>{g.icon}</span>{t(("gyro_" + (g.id === "off" ? "off" : g.id === "scope" ? "scope" : "always")) as never, lang)}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Real recoil-driven output */}
            {r && (
              <div className="mt-5 rounded-xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-500/10 to-purple-500/5 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="font-display text-[10px] font-bold tracking-widest text-fuchsia-300">🎯 {t("gg_output", lang)}</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {r.headLevelOptimized && <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold text-emerald-300">🧠 {t("gg_head_lock", lang)}</span>}
                    <span className="rounded bg-orange-500/15 px-2 py-0.5 text-[9px] font-bold text-orange-300">🔥 {t("gg_recoil_comp", lang)} ×{r.recoilCompFactor}</span>
                    <span className={`rounded px-2 py-0.5 text-[9px] font-bold ${r.confidence.score >= 80 ? "bg-emerald-500/15 text-emerald-300" : r.confidence.score >= 65 ? "bg-amber-500/15 text-amber-300" : "bg-orange-500/15 text-orange-300"}`}>✓ {t("gg_confidence", lang)} {r.confidence.score} · {t(("gg_" + r.confidence.level) as never, lang)}</span>
                    {r.learned && <span className="rounded bg-fuchsia-500/15 px-2 py-0.5 text-[9px] font-bold text-fuchsia-300">🧠 {t("gg_learned", lang)}</span>}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <GGFullTable title={t("sens_camera", lang)} data={r.profile.cam} color="orange" max={300} />
                  <GGFullTable title={t("sens_ads", lang)} data={r.profile.ads} color="orange" max={300} />
                  <GGFullTable title={t("sens_gyro_cam", lang)} data={r.profile.gyroCam} color="sky" max={400} />
                  <GGFullTable title={t("sens_gyro_ads", lang)} data={r.profile.gyroAds} color="sky" max={400} />
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-white/50">{t("gg_output_note", lang)}</p>
              </div>
            )}

            {/* Supreme score */}
            {r && (
              <div className="mt-5 grid items-center gap-4 sm:grid-cols-[auto_1fr]">
                <div className="flex items-center gap-4 rounded-xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-500/10 to-purple-500/5 p-4">
                  <div className="relative h-20 w-20">
                    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                      <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.08)" strokeWidth="8" fill="none" />
                      <circle cx="50" cy="50" r="42" stroke="url(#gg)" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={`${(supreme / 100) * 264} 264`} />
                      <defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0%" stopColor="#d946ef" /><stop offset="100%" stopColor="#8b5cf6" /></linearGradient></defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center"><span className={`font-display text-2xl font-black ${supremeColor}`}>{supreme}</span><span className="text-[8px] text-white/40">{t("gg_supreme_score", lang)}</span></div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  <Stat label={t("gg_dimension", lang)} value="4×8" />
                  <Stat label={t("gg_total_error", lang)} value={r.totalAimError.toFixed(3)} />
                  <Stat label={t("gg_candidates", lang)} value={r.candidatesEvaluated.toString()} />
                  <Stat label={t("gg_validated", lang)} value={r.valid ? "✓" : "✗"} ok={r.valid} />
                </div>
              </div>
            )}

            {r && !r.valid && (
              <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-[11px] text-red-200">
                <div className="font-bold">{isAr ? "تعذّر تطبيق نتيجة GG" : "GG result was not applied"}</div>
                <div className="mt-1 text-red-200/70">{r.validationIssues.join(" · ")}</div>
              </div>
            )}

            {/* Dynamic adaptation diagnostics */}
            {r && (
              <div className="mt-5">
                <div className="mb-3 font-display text-[10px] font-bold tracking-widest text-white/70">📡 {t("gg_dynamic", lang)}</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <DiagStat label={t("gg_input_lag", lang)} value={`${r.inputLagMs} ms`} good={r.inputLagMs <= 16} />
                  <DiagBar label={t("gg_micro_shake", lang)} value={r.microShakeIndex} />
                  <DiagBar label={t("gg_head_level", lang)} value={r.headLevelStability} />
                  <DiagBar label={t("gg_tracking_stab", lang)} value={r.trackingStability} />
                  <DiagBar label={t("gg_scope_stab", lang)} value={r.scopeStability} />
                </div>
              </div>
            )}

            {/* Measured errors (forward-model) */}
            {r && (
              <div className="mt-5">
                <div className="mb-3 font-display text-[10px] font-bold tracking-widest text-white/70">📉 {t("gg_measured_errors", lang)}</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <ErrChip k="gg_err_tracking" v={r.errors.tracking} />
                  <ErrChip k="gg_err_overshoot" v={r.errors.overshoot} />
                  <ErrChip k="gg_err_undershoot" v={r.errors.undershoot} />
                  <ErrChip k="gg_err_microshake" v={r.errors.microShake} />
                  <ErrChip k="gg_err_drift" v={r.errors.aimDrift} />
                  <ErrChip k="gg_err_recoil" v={r.errors.recoil} />
                  <ErrChip k="gg_err_response" v={r.errors.response} />
                  <ErrChip k="gg_err_total" v={r.errors.total} bold />
                </div>
              </div>
            )}

            {/* Quality scores */}
            {r && (
              <div className="mt-5">
                <div className="mb-3 font-display text-[10px] font-bold tracking-widest text-white/70">{t("gg_quality_scores", lang)}</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {OBJECTIVES.map((o) => {
                    const v = r.scores[o.key];
                    return (
                      <div key={o.key} className="flex items-center gap-2">
                        <span className="w-24 shrink-0 text-[10px] text-white/60">{t(o.labelKey as never, lang)}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5"><span className={`block h-full rounded-full bg-gradient-to-r ${o.color}`} style={{ width: `${v}%` }} /></div>
                        <span className="w-7 text-right font-display text-[10px] font-bold text-white tabular-nums">{v}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Scope performance */}
            {r && (
              <div className="mt-5">
                <div className="mb-3 font-display text-[10px] font-bold tracking-widest text-white/70">{t("gg_scope_perf", lang)}</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {SCOPE_ROWS.map((s) => {
                    const v = r.scopePerformance[s.key];
                    return (
                      <div key={s.key} className="rounded-lg border border-white/5 bg-black/30 p-2.5 text-center">
                        <div className="text-[10px] text-white/40">{t(s.labelKey as never, lang)}</div>
                        <div className={`font-display text-lg font-black tabular-nums ${v >= 80 ? "text-emerald-300" : v >= 65 ? "text-amber-300" : "text-orange-300"}`}>{v}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Explanation */}
            {r && (
              <div className="mt-5">
                <div className="mb-3 font-display text-[10px] font-bold tracking-widest text-white/70">{t("gg_explanation", lang)}</div>
                <div className="space-y-1.5">
                  {r.explanations.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-[11px]">
                      <span className={`shrink-0 font-bold ${IMPACT_COLOR[e.impact]}`}>{IMPACT_ICON[e.impact]}</span>
                      <span className="text-white/80"><b className="text-white">{e.label}:</b> {e.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Factor attribution — why these numbers */}
            {r && (
              <div className="mt-5">
                <div className="mb-3 font-display text-[10px] font-bold tracking-widest text-white/70">🧩 {t("gg_attribution", lang)}</div>
                <div className="space-y-1.5">
                  {r.attribution.map((a) => (
                    <div key={a.factor} className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-1.5 text-[11px]">
                      <span className={`font-bold ${a.direction === "up" ? "text-emerald-300" : a.direction === "down" ? "text-red-300" : "text-white/40"}`}>{a.direction === "up" ? "▲" : a.direction === "down" ? "▼" : "■"}</span>
                      <span className="flex-1 text-white/75">{a.label}</span>
                      <span className="font-display font-bold tabular-nums text-white/80">~{a.deltaPct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        {!active && <p className="mt-4 text-xs text-white/50">{isAr ? "فعّل النظام لتشغيل محرك APEX وتحسين 32 بُعداً من الحساسية بناءً على جهازك وسلاحك وأسلوبك." : "Activate to run the APEX engine — optimizing 32 sensitivity dimensions from your device, weapon, and style."}</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-widest text-white/40">{label}</div>
      <div className={`font-display text-sm font-bold tabular-nums ${ok === false ? "text-red-300" : ok === true ? "text-emerald-300" : "text-white"}`}>{value}</div>
    </div>
  );
}

function DiagStat({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 p-2.5">
      <div className="text-[9px] uppercase tracking-widest text-white/40">{label}</div>
      <div className={`font-display text-sm font-bold tabular-nums ${good ? "text-emerald-300" : "text-amber-300"}`}>{value}</div>
    </div>
  );
}

function DiagBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? "from-emerald-500 to-teal-400" : value >= 65 ? "from-amber-500 to-orange-400" : "from-orange-500 to-red-500";
  const tc = value >= 80 ? "text-emerald-300" : value >= 65 ? "text-amber-300" : "text-orange-300";
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 p-2.5">
      <div className="flex items-center justify-between"><span className="text-[9px] uppercase tracking-widest text-white/40">{label}</span><span className={`font-display text-xs font-bold tabular-nums ${tc}`}>{value}</span></div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5"><span className={`block h-full rounded-full bg-gradient-to-r ${color}`} style={{ width: `${value}%` }} /></div>
    </div>
  );
}

const GG_SCOPES: { key: ScopeId; lk: string }[] = [
  { key: "tpp", lk: "sens_scope_tpp" }, { key: "fpp", lk: "sens_scope_fpp" },
  { key: "red", lk: "sens_scope_red" }, { key: "scope2", lk: "sens_scope_2x" },
  { key: "scope3", lk: "sens_scope_3x" }, { key: "scope4", lk: "sens_scope_4x" },
  { key: "scope6", lk: "sens_scope_6x" }, { key: "scope8", lk: "sens_scope_8x" },
];

function ErrChip({ k, v, bold }: { k: string; v: number; bold?: boolean }) {
  const { lang } = useLang();
  return (
    <div className={`rounded-lg border p-2 text-center ${bold ? "border-orange-400/30 bg-orange-500/10" : "border-white/5 bg-black/30"}`}>
      <div className="text-[9px] uppercase tracking-widest text-white/40">{t(k as never, lang)}</div>
      <div className={`font-display text-sm font-bold tabular-nums ${bold ? "text-orange-300" : "text-white/80"}`}>{v.toFixed(3)}</div>
    </div>
  );
}

/** Complete per-engine sensitivity table — all 8 scopes. */
function GGFullTable({ title, data, color, max }: { title: string; data: ScopeSens; color: "orange" | "sky"; max: number }) {
  const { lang } = useLang();
  const accent = color === "sky" ? "text-sky-300" : "text-orange-300";
  const bar = color === "sky" ? "from-sky-500 to-cyan-400" : "from-orange-500 to-red-500";
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <div className={`mb-2 font-display text-[11px] font-bold tracking-widest ${accent}`}>{title}</div>
      <div className="space-y-1">
        {GG_SCOPES.map((s) => {
          const v = data[s.key];
          return (
            <div key={s.key} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[10px] text-white/50">{t(s.lk as never, lang)}</span>
              <div className="stat-bar h-1.5 flex-1"><span style={{ width: `${Math.min(100, (v / max) * 100)}%` }} className={`!bg-gradient-to-r ${bar}`} /></div>
              <span className="w-9 shrink-0 text-right font-display text-xs font-bold text-white tabular-nums">{v}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
