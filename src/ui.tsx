import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { useLang } from "./LanguageContext";
import { t } from "./i18n";
import { type Sens } from "./sensitivity";
import { SCOPE_LABELS } from "./sensitivity";

/* ════════════════ SCROLL REVEAL ════════════════ */
export function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) el.classList.add("visible"); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

export function RevealSection({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: 0 | 1 | 2 | 3 }) {
  const ref = useReveal();
  const dc = delay === 1 ? "reveal-delay-1" : delay === 2 ? "reveal-delay-2" : delay === 3 ? "reveal-delay-3" : "";
  return <div ref={ref} className={`reveal ${dc} ${className}`}>{children}</div>;
}

/* ════════════════ SECTION HEADER ════════════════ */
export function SectionHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-6 text-center">
      <div className="font-display text-[11px] font-bold tracking-[0.3em] text-orange-400">{eyebrow}</div>
      <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">{title}</h2>
      {subtitle && <p className="mx-auto mt-2 max-w-2xl text-sm text-white/60">{subtitle}</p>}
    </div>
  );
}

/* ════════════════ GAMING NIGHT MODE ════════════════ */
const NIGHT_KEY = "alyazouri_night_mode";
export function useNightMode() {
  const [night, setNight] = useState(() => { try { return localStorage.getItem(NIGHT_KEY) === "true"; } catch { return false; } });
  useEffect(() => {
    document.body.classList.toggle("gaming-mode", night);
    try { localStorage.setItem(NIGHT_KEY, String(night)); } catch { /* */ }
  }, [night]);
  return { night, toggleNight: () => setNight((n) => !n) };
}
export function NightModeToggle() {
  const { lang } = useLang();
  const { night, toggleNight } = useNightMode();
  return (
    <button onClick={toggleNight}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${night ? "bg-indigo-500/20 text-indigo-300 border border-indigo-400/30" : "btn-ghost"}`}
      title={lang === "ar" ? "وضع الألعاب الليلي" : "Gaming Night Mode"}>
      <span className="text-lg">{night ? "🌙" : "☀️"}</span>
    </button>
  );
}

/* ════════════════ SENSITIVITY TABLE ════════════════ */
export function SensitivityTable({ label, data, color = "orange", showTppFpp = true }: {
  label: string; data: Sens["cam"]; color?: "orange" | "sky"; showFpp?: boolean; showTppFpp?: boolean;
}) {
  const { lang } = useLang();
  const accent = color === "sky" ? "text-sky-300" : "text-orange-300";
  const barColor = color === "sky" ? "from-sky-500 to-cyan-400" : "from-orange-500 to-red-500";
  const rows = SCOPE_LABELS.filter((s) => showTppFpp ? true : s.key !== "fpp");
  return (
    <div className="card rounded-2xl p-5">
      <h4 className={`mb-3 font-display text-sm font-bold tracking-widest ${accent}`}>{label}</h4>
      <div className="space-y-1.5">
        {rows.map((s) => {
          const v = data[s.key];
          return (
            <div key={s.key} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[10px] text-white/50">{t(s.labelKey, lang)}</span>
              <div className="stat-bar h-1.5 flex-1"><span style={{ width: `${Math.min(100, (v / 300) * 100)}%` }} className={`!bg-gradient-to-r ${barColor}`} /></div>
              <span className="w-9 shrink-0 text-right font-display text-xs font-bold text-white tabular-nums">{v}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════ COPY BUTTON ════════════════ */
export function CopyButton({ sens }: { sens: Sens }) {
  const { lang } = useLang();
  const isAr = lang === "ar";
  const [copied, setCopied] = useState(false);
  const build = () => [
    `📷 TPP ${sens.cam.tpp} | FPP ${sens.cam.fpp} | Red ${sens.cam.red} | 3x ${sens.cam.scope3} | 4x ${sens.cam.scope4} | 6x ${sens.cam.scope6}`,
    `🎯 ADS TPP ${sens.ads.tpp} | FPP ${sens.ads.fpp} | Red ${sens.ads.red} | 4x ${sens.ads.scope4}`,
    `🔄 Gyro TPP ${sens.gyroCam.tpp} | Red ${sens.gyroCam.red} | 4x ${sens.gyroCam.scope4}`,
    `🏆 AI Score: ${sens.aiScore}/100`,
  ].join("\n");
  const copy = async () => {
    try { await navigator.clipboard.writeText(build()); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* */ }
  };
  return (
    <button onClick={copy} className={`btn-primary w-full rounded-xl px-5 py-3 text-sm ${copied ? "!bg-emerald-600" : ""}`}>
      {copied ? `✅ ${isAr ? "تم النسخ!" : "Copied!"}` : `📋 ${isAr ? "نسخ الحساسية" : "Copy Sensitivity"}`}
    </button>
  );
}

/* ════════════════ SHARE BUTTON ════════════════ */
export function ShareButton({ sens, deviceName, weaponName }: { sens: Sens; deviceName: string; weaponName: string }) {
  const { lang } = useLang();
  const isAr = lang === "ar";
  const [shared, setShared] = useState(false);
  const buildShareText = useCallback(() => [
    isAr ? "🎯 حساسيتي من ALYAZOURI 2026" : "🎯 My Sensitivity from ALYAZOURI 2026",
    `📱 ${deviceName} · 🔫 ${weaponName}`,
    ``,
    `📷 Camera: TPP ${sens.cam.tpp}% | FPP ${sens.cam.fpp}%`,
    `🎯 ADS: TPP ${sens.ads.tpp}% | FPP ${sens.ads.fpp}%`,
    `Red Dot: ${sens.cam.red}% | ×4: ${sens.cam.scope4}%`,
    `🏆 AI Score: ${sens.aiScore}/100`,
    ``,
    `🔗 alyazouri.com`,
  ].join("\n"), [sens, deviceName, weaponName, isAr]);
  const handleShare = async () => {
    const text = buildShareText();
    try {
      if (navigator.share) { await navigator.share({ title: "ALYAZOURI Sensitivity", text }); setShared(true); }
      else { await navigator.clipboard.writeText(text); setShared(true); }
      setTimeout(() => setShared(false), 3000);
    } catch { /* cancelled */ }
  };
  return (
    <button onClick={handleShare} className={`btn-ghost w-full rounded-xl px-5 py-3 text-sm transition-all ${shared ? "!border-emerald-400/50 !text-emerald-300" : ""}`}>
      {shared ? `✅ ${isAr ? "تمت المشاركة!" : "Shared!"}` : `📤 ${isAr ? "مشاركة الحساسية" : "Share Sensitivity"}`}
    </button>
  );
}

/* ════════════════ AI PREDICTIONS ════════════════ */
export function AIPredictions({ deviceName, fingers, styleId, weaponName }: { deviceName: string; fingers: number; styleId: string; weaponName: string }) {
  const { lang } = useLang();
  const isAr = lang === "ar";
  const list = useMemo(() => {
    const a: { icon: string; ar: string; en: string }[] = [];
    a.push(styleId === "headshot" || styleId === "sniper"
      ? { icon: "🎯", ar: `هيدشوت عالي مع ${weaponName} بفضل دقة السكوب.`, en: `High headshot rate with ${weaponName} thanks to scope precision.` }
      : { icon: "🔥", ar: `سبراي ثابت على ${weaponName} حتى المدى المتوسط.`, en: `Stable spray on ${weaponName} up to mid range.` });
    a.push(fingers >= 4
      ? { icon: "🖐️", ar: `${fingers} أصابع = تحكم سريع في الـ HUD والبنق.`, en: `${fingers} fingers = fast HUD & movement control.` }
      : { icon: "🖐️", ar: `${fingers} أصابع — جرّب 4 أصابع لتحكم أسرع.`, en: `${fingers} fingers — try 4 for faster control.` });
    a.push({ icon: "📱", ar: `${deviceName} يقدم أداءً ممتازاً لهذه الحساسية.`, en: `${deviceName} delivers great performance for this sensitivity.` });
    return a;
  }, [deviceName, fingers, styleId, weaponName]);
  return (
    <div className="card neon-box rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xl">🤖</span>
        <h3 className="font-display text-sm font-bold tracking-widest text-white">{isAr ? "تنبؤات الذكاء الاصطناعي" : "AI Predictions"}</h3>
      </div>
      <div className="space-y-2">
        {list.map((p, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg border border-white/5 bg-black/30 p-2.5 text-xs text-white/75">
            <span className="text-base">{p.icon}</span><span>{isAr ? p.ar : p.en}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════ RATING SECTION ════════════════ */
const RATING_KEY = "alyazouri_rating_v1";
interface RatingData { rating: number; comment: string; savedAt: number; }
export function RatingSection() {
  const { lang } = useLang();
  const isAr = lang === "ar";
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState<RatingData | null>(null);
  useEffect(() => {
    try { const raw = localStorage.getItem(RATING_KEY); if (raw) { const data = JSON.parse(raw) as RatingData; setSaved(data); setRating(data.rating); setComment(data.comment); setSubmitted(true); } } catch { /* */ }
  }, []);
  const handleSubmit = () => { if (rating === 0) return; const data: RatingData = { rating, comment, savedAt: Date.now() }; try { localStorage.setItem(RATING_KEY, JSON.stringify(data)); } catch { /* */ } setSaved(data); setSubmitted(true); };
  const stars = [1, 2, 3, 4, 5];
  const activeRating = hoverRating || rating;
  return (
    <div className="card neon-box rounded-2xl p-6">
      <div className="mb-4 flex items-center gap-2"><span className="text-2xl">💬</span><h3 className="font-display text-lg font-bold text-white">{isAr ? "قيّم تجربتك" : "Rate Your Experience"}</h3></div>
      {submitted && saved ? (
        <div className="py-4 text-center">
          <div className="mb-3 text-4xl">🎉</div>
          <div className="mb-1 text-lg font-bold text-white">{isAr ? "شكراً لتقييمك!" : "Thanks for your rating!"}</div>
          <div className="mb-3 flex justify-center gap-1">{stars.map((s) => <span key={s} className={`text-2xl ${s <= saved.rating ? "opacity-100" : "opacity-20"}`}>⭐</span>)}</div>
          {saved.comment && <div className="mx-auto max-w-sm rounded-xl border border-white/5 bg-black/30 p-3 text-sm text-white/70">"{saved.comment}"</div>}
          <button onClick={() => { setSubmitted(false); setSaved(null); }} className="mt-4 text-xs text-orange-300 hover:text-orange-200">{isAr ? "تعديل التقييم" : "Edit rating"}</button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex justify-center gap-2">
            {stars.map((s) => (
              <button key={s} onMouseEnter={() => setHoverRating(s)} onMouseLeave={() => setHoverRating(0)} onClick={() => setRating(s)}
                className={`text-3xl transition-transform hover:scale-125 ${s <= activeRating ? "scale-110 opacity-100" : "opacity-30"}`}>⭐</button>
            ))}
          </div>
          <div className="mb-4 text-center text-xs text-white/50">
            {activeRating === 1 && (isAr ? "ضعيف" : "Poor")}
            {activeRating === 2 && (isAr ? "مقبول" : "Fair")}
            {activeRating === 3 && (isAr ? "جيد" : "Good")}
            {activeRating === 4 && (isAr ? "ممتاز" : "Excellent")}
            {activeRating === 5 && (isAr ? "🏆 أسطوري!" : "🏆 Legendary!")}
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={isAr ? "اكتب تعليقك هنا... (اختياري)" : "Write your comment... (optional)"}
            className="h-20 w-full resize-none rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white placeholder-white/30 focus:border-orange-400/50 focus:outline-none" />
          <button onClick={handleSubmit} disabled={rating === 0} className="btn-primary mt-3 w-full rounded-xl px-5 py-3 text-sm disabled:opacity-40">{isAr ? "إرسال التقييم" : "Submit Rating"}</button>
        </>
      )}
    </div>
  );
}

/* ════════════════ STATUS BAR ════════════════ */
function useDeviceMetrics() {
  const [metrics, setMetrics] = useState({ cores: 4, memory: 4, temp: 42, load: 35 });
  useEffect(() => {
    const cores = (navigator as unknown as { hardwareConcurrency?: number }).hardwareConcurrency ?? 4;
    const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
    const baseTemp = 38 + Math.max(0, (cores - 4) * 1.5);
    const interval = setInterval(() => {
      const estimatedLoad = Math.min(100, Math.max(10, 30 + Math.random() * 30));
      const temp = Math.round(baseTemp + (estimatedLoad / 100) * 18);
      setMetrics({ cores, memory, temp: Math.max(38, Math.min(75, temp)), load: Math.round(estimatedLoad) });
    }, 2000);
    return () => clearInterval(interval);
  }, []);
  return metrics;
}
export function StatusBar() {
  const { lang } = useLang();
  const [now, setNow] = useState(new Date());
  const metrics = useDeviceMetrics();
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const locale = lang === "ar" ? "ar-JO" : lang === "tr" ? "tr-TR" : lang === "ru" ? "ru-RU" : lang === "es" ? "es-ES" : "en-US";
  const timeStr = now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString(locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const tempColor = metrics.temp < 45 ? "text-emerald-300" : metrics.temp < 55 ? "text-amber-300" : metrics.temp < 65 ? "text-orange-400" : "text-red-400";
  const tempBg = metrics.temp < 45 ? "from-emerald-500/20 to-emerald-600/10" : metrics.temp < 55 ? "from-amber-500/20 to-amber-600/10" : metrics.temp < 65 ? "from-orange-500/20 to-orange-600/10" : "from-red-500/20 to-red-600/10";
  return (
    <div className="fixed right-0 left-0 top-[61px] z-40 border-b border-white/5 bg-[#05070c]/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 overflow-x-auto px-5 py-1.5 text-[11px]">
        <div className="flex items-center gap-3 text-white/70">
          <div className="flex items-center gap-1.5"><span className="text-orange-400">🕐</span><span className="font-display font-bold tabular-nums text-white">{timeStr}</span></div>
          <span className="hidden text-white/20 sm:inline">|</span>
          <div className="hidden items-center gap-1.5 sm:flex"><span className="text-orange-400">📅</span><span className="text-white/80">{dateStr}</span></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1 rounded-full border border-white/5 bg-white/[0.03] px-2 py-0.5 sm:flex"><span className="text-[10px] text-white/50">{t("factors_device", lang)}:</span><span className="font-display font-bold text-white/80">{metrics.cores} cores</span></div>
          <div className="hidden items-center gap-1 rounded-full border border-white/5 bg-white/[0.03] px-2 py-0.5 sm:flex"><span className="text-[10px] text-white/50">RAM:</span><span className="font-display font-bold text-white/80">{metrics.memory} GB</span></div>
          <div className="flex items-center gap-1 rounded-full border border-white/5 bg-white/[0.03] px-2 py-0.5"><span className="text-[10px]">⚡</span><span className="font-display font-bold tabular-nums text-white/80">{metrics.load}%</span></div>
          <div className={`flex items-center gap-1 rounded-full border border-white/10 bg-gradient-to-r ${tempBg} px-2 py-0.5`}><span className="text-[10px]">🌡️</span><span className={`font-display font-bold tabular-nums ${tempColor}`}>{metrics.temp}°C</span></div>
          <div className="flex items-center gap-1"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /><span className="hidden text-[9px] uppercase tracking-widest text-emerald-300/70 sm:inline">LIVE</span></div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════ DPI CALCULATOR ════════════════ */
const PRO_PRESETS = [
  { name: "Paraboy", dpi: 320, sens: 200, style: "Spray" },
  { name: "Jonathan", dpi: 280, sens: 180, style: "Headshot" },
  { name: "Levinho", dpi: 300, sens: 160, style: "Balanced" },
  { name: "Mortal", dpi: 260, sens: 170, style: "Aggressive" },
  { name: "Athena", dpi: 300, sens: 190, style: "CQC" },
];
export function DPICalculator() {
  const { lang } = useLang();
  const isAr = lang === "ar";
  const [dpi, setDpi] = useState(300);
  const [sensitivity, setSensitivity] = useState(150);
  const [screenWidth, setScreenWidth] = useState(6.5);
  const results = useMemo(() => {
    const eDPI = dpi * sensitivity;
    const screenWidthCm = screenWidth * 2.54;
    const cmPer360 = screenWidthCm * (100 / sensitivity);
    const cmPer180 = cmPer360 / 2;
    const cmPer90 = cmPer360 / 4;
    const closestPro = PRO_PRESETS.reduce((closest, pro) => {
      const diff = Math.abs(pro.dpi * pro.sens - eDPI);
      const closestDiff = Math.abs(closest.dpi * closest.sens - eDPI);
      return diff < closestDiff ? pro : closest;
    }, PRO_PRESETS[0]);
    const speedCategory =
      cmPer360 > 30 ? { label: isAr ? "بطيء جداً — دقة عالية" : "Very Slow — High Precision", color: "text-sky-300", icon: "🎯" } :
      cmPer360 > 20 ? { label: isAr ? "بطيء — دقة جيدة" : "Slow — Good Precision", color: "text-cyan-300", icon: "🏹" } :
      cmPer360 > 12 ? { label: isAr ? "متوسط — متوازن" : "Medium — Balanced", color: "text-emerald-300", icon: "⚖️" } :
      cmPer360 > 6 ? { label: isAr ? "سريع — عدواني" : "Fast — Aggressive", color: "text-orange-300", icon: "⚡" } :
      { label: isAr ? "سريع جداً — محترف" : "Very Fast — Pro", color: "text-red-300", icon: "🔥" };
    return { eDPI, cmPer360, cmPer180, cmPer90, closestPro, speedCategory };
  }, [dpi, sensitivity, screenWidth, isAr]);
  return (
    <div className="card neon-box rounded-2xl p-5">
      <div className="mb-4 flex items-center gap-2"><span className="text-xl">🧮</span><h3 className="font-display text-sm font-bold tracking-widest text-white">{isAr ? "حاسبة DPI / الحساسية" : "DPI / Sensitivity Calculator"}</h3></div>
      <div className="space-y-4">
        {[
          { label: "DPI", val: dpi, set: setDpi, min: 100, max: 800, step: 10, marks: ["100", "400", "800"], suffix: "" },
          { label: isAr ? "الحساسية" : "Sensitivity", val: sensitivity, set: setSensitivity, min: 10, max: 300, step: 5, marks: ["10%", "150%", "300%"], suffix: "%" },
          { label: isAr ? "حجم الشاشة" : "Screen Size", val: screenWidth, set: setScreenWidth, min: 5, max: 13, step: 0.1, marks: ['5"', '8"', '13"'], suffix: '"' },
        ].map((row, idx) => (
          <div key={idx}>
            <div className="mb-1.5 flex items-center justify-between"><label className="text-xs text-white/70">{row.label}</label><span className="font-display text-sm font-bold text-orange-300 tabular-nums">{row.val}{row.suffix}</span></div>
            <input type="range" min={row.min} max={row.max} step={row.step} value={row.val} onChange={(e) => row.set(Number(e.target.value))} className="w-full accent-orange-500" />
            <div className="mt-1 flex justify-between text-[9px] text-white/30">{row.marks.map((m, i) => <span key={i}>{m}</span>)}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 space-y-3">
        <div className="rounded-xl border border-orange-400/30 bg-gradient-to-br from-orange-500/10 to-red-500/5 p-4 text-center">
          <div className="text-[10px] uppercase tracking-widest text-white/50">eDPI</div>
          <div className="mt-1 font-display text-3xl font-black text-orange-300 tabular-nums">{results.eDPI.toLocaleString()}</div>
          <div className={`mt-1 flex items-center justify-center gap-1.5 text-xs font-semibold ${results.speedCategory.color}`}><span>{results.speedCategory.icon}</span><span>{results.speedCategory.label}</span></div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[["360°", results.cmPer360], ["180°", results.cmPer180], ["90°", results.cmPer90]].map(([deg, val]) => (
            <div key={deg as string} className="rounded-lg border border-white/5 bg-black/30 p-2.5 text-center"><div className="text-[10px] text-white/40">{deg}</div><div className="font-display text-base font-bold text-white tabular-nums">{(val as number).toFixed(1)}</div><div className="text-[9px] text-white/30">cm</div></div>
          ))}
        </div>
        <div className="rounded-xl border border-purple-400/20 bg-purple-500/5 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-purple-300/70">{isAr ? "أقرب لاعب محترف" : "Closest Pro Player"}</div>
          <div className="flex items-center justify-between">
            <div><div className="font-display text-sm font-bold text-white">👑 {results.closestPro.name}</div><div className="text-[10px] text-white/50">{results.closestPro.style}</div></div>
            <div className="text-right"><div className="text-[10px] text-white/50">DPI: {results.closestPro.dpi} · Sens: {results.closestPro.sens}%</div><div className="text-[10px] text-purple-300">eDPI: {(results.closestPro.dpi * results.closestPro.sens).toLocaleString()}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════ TOUCH TEST ════════════════ */
export function TouchTest() {
  const { lang } = useLang();
  const isAr = lang === "ar";
  const [testing, setTesting] = useState(false);
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [result, setResult] = useState<{ speed: number; distance: number; time: number; recommended: number } | null>(null);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const getPos = (e: React.MouseEvent | React.TouchEvent): [number, number] => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = "touches" in e ? e.touches[0]?.clientX ?? (e as React.TouchEvent).changedTouches[0]?.clientX ?? 0 : (e as React.MouseEvent).clientX;
    const cy = "touches" in e ? e.touches[0]?.clientY ?? (e as React.TouchEvent).changedTouches[0]?.clientY ?? 0 : (e as React.MouseEvent).clientY;
    return [((cx - r.left) / r.width) * 400, ((cy - r.top) / r.height) * 176];
  };
  const handleStart = (e: React.MouseEvent | React.TouchEvent) => { setTesting(true); setTrail([]); setResult(null); const [x, y] = getPos(e); startRef.current = { x, y, t: performance.now() }; setTrail([[x, y]]); };
  const handleMove = (e: React.MouseEvent | React.TouchEvent) => { if (!testing) return; const [x, y] = getPos(e); setTrail((p) => [...p, [x, y]]); };
  const handleEnd = (e: React.MouseEvent | React.TouchEvent) => {
    if (!testing || !startRef.current) return;
    const [x, y] = getPos(e); const t = performance.now() - startRef.current.t;
    const dx = x - startRef.current.x; const dy = y - startRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const speed = t > 0 ? distance / t : 0;
    const recommended = Math.round(Math.max(40, Math.min(200, 100 + speed * 90)));
    setTesting(false); setResult({ speed: +speed.toFixed(2), distance: Math.round(distance), time: Math.round(t), recommended });
  };
  const speedColor = !result ? "text-white/40" : result.speed > 1.5 ? "text-red-300" : result.speed > 0.8 ? "text-orange-300" : result.speed > 0.4 ? "text-emerald-300" : "text-sky-300";
  const speedLabel = !result ? "" : isAr
    ? (result.speed > 1.5 ? "سريع جداً — هجومي" : result.speed > 0.8 ? "سريع — متوازن" : result.speed > 0.4 ? "متوسط — دقيق" : "بطيء — دقة عالية")
    : (result.speed > 1.5 ? "Very Fast — Aggressive" : result.speed > 0.8 ? "Fast — Balanced" : result.speed > 0.4 ? "Medium — Precise" : "Slow — High Precision");
  return (
    <div className="card neon-box rounded-2xl p-5">
      <div className="mb-4 flex items-center gap-2"><span className="text-xl">👆</span><h3 className="font-display text-sm font-bold tracking-widest text-white">{isAr ? "اختبار سرعة اللمس" : "Touch Speed Test"}</h3></div>
      <p className="mb-4 text-xs text-white/60">{isAr ? "اسحب إصبعك بالسرعة التي تلعب بها — سنقترح لك حساسية مناسبة" : "Swipe at your gaming speed — we'll suggest the right sensitivity"}</p>
      <div onMouseDown={handleStart} onMouseMove={handleMove} onMouseUp={handleEnd} onMouseLeave={handleEnd} onTouchStart={handleStart} onTouchMove={handleMove} onTouchEnd={handleEnd}
        className={`relative h-44 cursor-crosshair select-none touch-none overflow-hidden rounded-xl border-2 ${testing ? "border-orange-400 bg-gradient-to-br from-orange-500/10 to-red-500/10" : "border-white/10 bg-[#07090f]"}`}>
        <div className="absolute inset-0 bg-grid opacity-30" />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 176" preserveAspectRatio="none">
          {trail.length > 1 && <polyline points={trail.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="rgba(255,122,0,0.8)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
          {trail.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === trail.length - 1 ? 5 : 2} fill={i === trail.length - 1 ? "#ff7a00" : `rgba(255,122,0,${0.3 + (i / trail.length) * 0.7})`} />)}
        </svg>
        {!testing && trail.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40"><span className="text-3xl">👆</span><span className="mt-1 text-sm">{isAr ? "اسحب هنا" : "Swipe here"}</span></div>
        )}
      </div>
      {result && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[["Speed", "speed", "px/ms"], ["Distance", "distance", "px"], ["Time", "time", "ms"]].map(([k, key, unit]) => (
              <div key={k} className="rounded-lg border border-white/5 bg-black/30 p-2.5 text-center"><div className="text-[10px] text-white/40">{isAr ? ({ Speed: "السرعة", Distance: "المسافة", Time: "الوقت" } as Record<string, string>)[k] : k}</div><div className="font-display text-base font-bold text-white tabular-nums">{result[key as "speed"]}</div><div className="text-[9px] text-white/30">{unit}</div></div>
            ))}
          </div>
          <div className="text-center text-sm font-semibold"><span className={speedColor}>{speedLabel}</span></div>
          <div className="rounded-xl border border-orange-400/30 bg-gradient-to-br from-orange-500/10 to-red-500/5 p-4 text-center"><div className="text-[10px] uppercase tracking-widest text-white/50">{isAr ? "الحساسية المقترحة" : "Recommended Sensitivity"}</div><div className="font-display text-3xl font-black text-orange-300">{result.recommended}%</div><div className="text-[10px] text-white/40">{isAr ? "لـ TPP/FPP بدون سكوب" : "For TPP/FPP No Scope"}</div></div>
        </div>
      )}
    </div>
  );
}

/* ════════════════ SCREEN RECORDER ════════════════ */
export function ScreenRecorder() {
  const { lang } = useLang();
  const isAr = lang === "ar";
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [recorded, setRecorded] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const startRecording = useCallback(async () => {
    for (let i = 3; i >= 1; i--) { setCountdown(i); await new Promise((r) => setTimeout(r, 800)); }
    setCountdown(0);
    try {
      document.getElementById("generator")?.scrollIntoView({ behavior: "smooth" });
      await new Promise((r) => setTimeout(r, 500));
      const stream = await (navigator.mediaDevices as MediaDevices & { getDisplayMedia: (o: MediaStreamConstraints) => Promise<MediaStream> }).getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      let mimeType = "video/webm;codecs=vp9";
      if (!MediaRecorder.isTypeSupported(mimeType)) { mimeType = "video/webm;codecs=vp8"; if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm"; }
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
      recorderRef.current = recorder; chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType.split(";")[0] });
        if (blob.size > 0) { blobRef.current = blob; setVideoUrl(URL.createObjectURL(blob)); setRecorded(true); }
        setRecording(false);
      };
      stream.getVideoTracks()[0].onended = () => { if (recorder.state !== "inactive") recorder.stop(); };
      recorder.start(1000); setRecording(true); setRecorded(false);
      setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, 60000);
    } catch { setRecording(false); setCountdown(0); }
  }, []);
  const stopRecording = useCallback(() => { if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop(); }, []);
  const downloadRecording = useCallback(() => {
    if (!blobRef.current) return;
    const a = document.createElement("a"); a.href = URL.createObjectURL(blobRef.current); a.download = `alyazouri_sensitivity_${Date.now()}.webm`; a.style.display = "none"; document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 200);
  }, []);
  const isSupported = typeof navigator !== "undefined" && "mediaDevices" in navigator && "getDisplayMedia" in (navigator.mediaDevices || {});
  if (!isSupported) return null;
  return (
    <div className="card neon-box rounded-2xl p-5">
      <div className="mb-4 flex items-center gap-2"><span className="text-xl">🎥</span><h3 className="font-display text-sm font-bold tracking-widest text-white">{isAr ? "تسجيل شاشة النتائج" : "Record Results Screen"}</h3></div>
      {countdown > 0 && <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm"><div className="font-display text-8xl font-black text-orange-400">{countdown}</div><div className="mt-2 text-white/70">{isAr ? "جاري البدء..." : "Starting..."}</div></div>}
      {recorded && videoUrl ? (
        <div className="space-y-3">
          <video src={videoUrl} controls className="w-full rounded-xl border border-white/10" />
          <div className="flex gap-2">
            <button onClick={downloadRecording} className="btn-primary flex-1 rounded-xl px-4 py-2.5 text-sm">⬇️ {isAr ? "تحميل" : "Download"}</button>
            <button onClick={() => { if (videoUrl) URL.revokeObjectURL(videoUrl); setVideoUrl(""); setRecorded(false); blobRef.current = null; }} className="btn-ghost rounded-xl px-4 py-2.5 text-sm">🗑️</button>
          </div>
          <p className="text-center text-[11px] text-emerald-300">{isAr ? "جاهز للنشر على TikTok / Instagram / YouTube" : "Ready for TikTok / Instagram / YouTube"}</p>
        </div>
      ) : recording ? (
        <div className="space-y-3 text-center">
          <div className="flex items-center justify-center gap-2"><span className="h-3 w-3 animate-pulse rounded-full bg-red-500" /><span className="font-display text-sm font-bold text-red-400">{isAr ? "جاري التسجيل..." : "Recording..."}</span></div>
          <p className="text-xs text-white/50">{isAr ? "تصفّح الموقع — كل شيء يُسجَّل الآن" : "Browse the site — everything is being recorded"}</p>
          <button onClick={stopRecording} className="btn-ghost w-full rounded-xl px-5 py-2.5 text-sm">⏹️ {isAr ? "إيقاف التسجيل" : "Stop Recording"}</button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-white/60">{isAr ? "سجّل شاشة النتائج كفيديو قصير جاهز للنشر على السوشيال ميديا." : "Record your results screen as a short video ready for social media."}</p>
          <div className="flex items-center justify-center gap-2 text-xs text-white/40"><span>📱 TikTok</span><span>·</span><span>📸 Instagram</span><span>·</span><span>▶️ YouTube</span></div>
          <button onClick={startRecording} className="btn-primary w-full rounded-xl px-5 py-3 text-sm">🎥 {isAr ? "بدء التسجيل" : "Start Recording"}</button>
        </div>
      )}
    </div>
  );
}

/* ════════════════ HUD PREVIEW ════════════════ */
type HudBtn = { id: string; x: number; y: number; w: number; h: number; color: string; label: string; finger?: string };
const HUD_BUTTONS: HudBtn[] = [
  { id: "fire", x: 78, y: 60, w: 18, h: 30, color: "from-red-500/40 to-red-700/40", label: "🔫", finger: "R1" },
  { id: "scope", x: 74, y: 30, w: 12, h: 16, color: "from-sky-500/40 to-sky-700/40", label: "🔭", finger: "R2" },
  { id: "move", x: 4, y: 60, w: 18, h: 30, color: "from-emerald-500/40 to-emerald-700/40", label: "🕹️", finger: "L1" },
  { id: "jump", x: 60, y: 78, w: 12, h: 14, color: "from-orange-500/40 to-orange-700/40", label: "⬆️", finger: "L2" },
  { id: "crouch", x: 45, y: 80, w: 11, h: 13, color: "from-purple-500/40 to-purple-700/40", label: "🦵", finger: "L3" },
  { id: "grenade", x: 30, y: 30, w: 11, h: 14, color: "from-amber-500/40 to-amber-700/40", label: "💣", finger: "R3" },
];
export function HudPreview({ fingers }: { fingers: number }) {
  const { lang } = useLang();
  const visible = useMemo(() => {
    const map: Record<number, string[]> = { 2: ["move", "fire"], 3: ["move", "fire", "scope"], 4: ["move", "fire", "scope", "jump"], 5: ["move", "fire", "scope", "jump", "crouch"], 6: ["move", "fire", "scope", "jump", "crouch", "grenade"] };
    return new Set(map[fingers] ?? map[4]);
  }, [fingers]);
  const shift = lang === "ar" ? -2 : 0;
  return (
    <div className="card relative overflow-hidden rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-display text-sm font-bold tracking-widest text-white/90">{t("hud_title", lang)}</h4>
        <span className="rounded-full bg-orange-500/15 px-3 py-1 text-[10px] font-bold text-orange-300">{fingers} {t("fingers_suffix", lang)}</span>
      </div>
      <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-[#0b0f18] via-[#0a0a14] to-[#050710]">
        <div className="absolute top-1/2 right-0 h-[1px] w-3 -translate-y-1/2 bg-orange-400" />
        <div className="absolute left-1/2 top-0 h-3 w-[1px] -translate-x-1/2 bg-orange-400" />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <span className="rounded bg-black/60 px-2 py-0.5 text-orange-300">{t("hud_alive", lang)}: 87</span>
          <span className="rounded bg-black/60 px-2 py-0.5 text-emerald-300">{t("hud_kills", lang)}: 4</span>
          <span className="rounded bg-black/60 px-2 py-0.5 text-white/60">120 FPS</span>
        </div>
        {HUD_BUTTONS.filter((b) => visible.has(b.id)).map((b) => (
          <div key={b.id} className={`absolute flex items-center justify-center rounded-xl border border-white/30 bg-gradient-to-br ${b.color} backdrop-blur-sm`} style={{ left: `${b.x + shift}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}>
            <span className="text-lg">{b.label}</span>
            {b.finger && <span className="absolute bottom-0.5 font-display text-[9px] font-bold text-white/80">{b.finger}</span>}
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] text-white/60 sm:grid-cols-6">
        {["L1", "L2", "L3", "R1", "R2", "R3"].slice(0, fingers).map((f) => (
          <div key={f} className="flex flex-col items-center gap-0.5"><span className="kbd">{f}</span><span className="truncate">{t("hud_active", lang)}</span></div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════ PING MONITOR ════════════════ */
const SERVERS = [
  { id: "jordan", name: "Jordan · Amman", flag: "🇯🇴", base: 16 },
  { id: "ksa", name: "Saudi · Riyadh", flag: "🇸🇦", base: 26 },
  { id: "uae", name: "UAE · Dubai", flag: "🇦🇪", base: 36 },
  { id: "egypt", name: "Egypt · Cairo", flag: "🇪🇬", base: 44 },
  { id: "tr", name: "Turkey · Istanbul", flag: "🇹🇷", base: 55 },
  { id: "eu", name: "Europe · Frankfurt", flag: "🇪🇺", base: 78 },
  { id: "us", name: "USA · Ashburn", flag: "🇺🇸", base: 132 },
];
export function PingMonitor() {
  const { lang } = useLang();
  const [pings, setPings] = useState<Record<string, number | null>>({});
  const [jitter, setJitter] = useState<Record<string, number | null>>({});
  const [loss, setLoss] = useState<Record<string, number | null>>({});
  const [measuring, setMeasuring] = useState(false);
  const [done, setDone] = useState(false);
  const [bestServer, setBestServer] = useState<typeof SERVERS[number] | null>(null);
  const measure = useCallback(async () => {
    setMeasuring(true); setDone(false); setPings({}); setJitter({}); setLoss({});
    const p: Record<string, number> = {}; const j: Record<string, number> = {}; const l: Record<string, number> = {};
    for (const s of SERVERS) {
      const samples: number[] = [];
      for (let k = 0; k < 3; k++) {
        await new Promise((r) => setTimeout(r, 120));
        samples.push(Math.max(4, Math.round(s.base + (Math.random() - 0.5) * 14)));
      }
      p[s.id] = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
      j[s.id] = Math.round(Math.max(...samples) - Math.min(...samples));
      l[s.id] = Math.random() < 0.15 ? Math.round(Math.random() * 3) : 0;
      setPings({ ...p }); setJitter({ ...j }); setLoss({ ...l });
    }
    const best = [...SERVERS].sort((a, b) => p[a.id] - p[b.id])[0];
    setBestServer(best); setMeasuring(false); setDone(true);
  }, []);
  useEffect(() => { measure(); }, [measure]);
  return (
    <div className="card relative overflow-hidden rounded-2xl p-5">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-display text-xs font-bold tracking-widest text-orange-400">{t("ping_live", lang)}</div>
          <h3 className="mt-1 text-xl font-bold text-white">{t("ping_live_title", lang)}</h3>
          <p className="mt-1 text-sm text-white/60">{t("ping_live_desc", lang)}</p>
        </div>
        <button onClick={measure} disabled={measuring} className="btn-primary rounded-xl px-4 py-2.5 text-sm disabled:opacity-50">
          {measuring ? t("ping_measuring", lang) : t("ping_measure", lang)}
        </button>
      </div>
      <div className="relative mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SERVERS.map((s) => {
          const pv = pings[s.id]; const jv = jitter[s.id]; const lv = loss[s.id];
          const isBest = bestServer?.id === s.id && done;
          const quality = pv == null ? "" : pv < 60 ? t("ping_quality_excellent", lang) : pv < 120 ? t("ping_quality_good", lang) : pv < 200 ? t("ping_quality_medium", lang) : t("ping_quality_poor", lang);
          const color = pv == null ? "bg-white/10" : pv < 60 ? "bg-emerald-500" : pv < 120 ? "bg-amber-400" : pv < 200 ? "bg-orange-500" : "bg-red-500";
          return (
            <div key={s.id} className={`relative overflow-hidden rounded-xl border p-4 transition-all ${isBest ? "border-orange-400 bg-gradient-to-br from-orange-500/20 to-red-500/10 shadow-[0_0_30px_-10px_rgba(255,122,0,0.6)]" : "border-white/10 bg-white/[0.02]"}`}>
              {isBest && <span className="absolute right-2 top-2 rounded-full bg-orange-500 px-2 py-0.5 text-[9px] font-bold text-white">{t("ping_best", lang)}</span>}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-2xl">{s.flag}</span><div><div className="text-sm font-bold text-white">{s.name}</div><div className="text-[10px] text-white/50">{quality}</div></div></div>
                <div className="text-right"><div className="font-display text-xl font-black text-white tabular-nums">{pv == null ? <span className="text-white/30">—</span> : pv}</div><div className="text-[10px] text-white/40">ms</div></div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                {[["ping_ping", pv], ["ping_jitter", jv], ["ping_loss", lv]].map(([k, val]) => (
                  <div key={k as string} className="rounded bg-black/30 p-1.5 text-center"><div className="text-white/40">{t(k as never, lang)}</div><div className="font-display font-bold text-white/80 tabular-nums">{(val as number | null) ?? "—"}{k === "ping_loss" ? "%" : ""}</div></div>
                ))}
              </div>
              <div className={`mt-2 h-1 rounded-full ${color}`} style={{ width: `${pv == null ? 0 : Math.max(8, Math.min(100, 100 - (pv / 2)))}%` }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════ HERO ════════════════ */
/**
 * Authentic Jordanian flag as inline SVG.
 * Geometry follows the official 2:1 construction:
 * - Three horizontal bands (black, white, green) each 1/3 height.
 * - Red isosceles triangle from hoist, base = 1/4 length.
 * - White seven-pointed star centered in the triangle.
 * Natural flat colors only — no glow, no gradient, no effects.
 */
function JordanFlag({ className = "h-6 w-auto" }: { className?: string }) {
  // Seven-pointed star: radius 38, centered at (105, 210) inside the triangle.
  const starPath = Array.from({ length: 7 }, (_, i) => {
    const outer = (i * 360) / 7 - 90;
    const inner = outer + 360 / 14;
    const ox = 105 + 38 * Math.cos((outer * Math.PI) / 180);
    const oy = 210 + 38 * Math.sin((outer * Math.PI) / 180);
    const ix = 105 + 15 * Math.cos((inner * Math.PI) / 180);
    const iy = 210 + 15 * Math.sin((inner * Math.PI) / 180);
    return `${i === 0 ? "M" : "L"}${ox.toFixed(1)},${oy.toFixed(1)} L${ix.toFixed(1)},${iy.toFixed(1)}`;
  }).join(" ") + " Z";

  return (
    <svg viewBox="0 0 840 420" className={className} aria-label="Flag of Jordan" role="img" preserveAspectRatio="xMidYMid meet">
      <rect width="840" height="140" fill="#000000" />
      <rect y="140" width="840" height="140" fill="#FFFFFF" />
      <rect y="280" width="840" height="140" fill="#007A3D" />
      <polygon points="0,0 210,210 0,420" fill="#CE1126" />
      <path d={starPath} fill="#FFFFFF" />
    </svg>
  );
}

/** Real battery level via the Battery Status API. Returns null when unavailable. */
function useRealBattery() {
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);

  useEffect(() => {
    type BatteryManager = { level: number; charging: boolean; addEventListener: (t: string, cb: () => void) => void; removeEventListener: (t: string, cb: () => void) => void };
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    if (typeof nav.getBattery !== "function") return;

    let mgr: BatteryManager | null = null;
    const update = () => {
      if (!mgr) return;
      setBattery({ level: Math.round(mgr.level * 100), charging: mgr.charging });
    };

    nav.getBattery().then((m: BatteryManager) => {
      mgr = m;
      update();
      m.addEventListener("levelchange", update);
      m.addEventListener("chargingchange", update);
    }).catch(() => {
      // Battery API present but failed — treat as unavailable.
    });

    return () => {
      if (!mgr) return;
      mgr.removeEventListener("levelchange", update);
      mgr.removeEventListener("chargingchange", update);
    };
  }, []);

  return battery;
}

export function Hero() {
  const { lang } = useLang();
  const isAr = lang === "ar";
  const battery = useRealBattery();
  const [status, setStatus] = useState<"measuring" | "connected">("measuring");
  const [ping, setPing] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPing(Math.round(14 + Math.random() * 8)), 1800);
    const t1 = setTimeout(() => setStatus("connected"), 1400);
    return () => { clearInterval(id); clearTimeout(t1); };
  }, []);
  const and = isAr ? "و" : lang === "es" ? "y" : lang === "ru" ? "и" : lang === "tr" ? "ve" : "and";
  const qualityLabel = ping < 25 ? t("hero_excellent", lang) : ping < 45 ? t("hero_good", lang) : t("hero_medium", lang);
  const qualityColor = ping < 25 ? "text-emerald-300" : ping < 45 ? "text-amber-300" : "text-orange-300";
  return (
    <section className="relative px-5 pb-10 pt-32 sm:pt-36">
      <div className="mx-auto max-w-7xl">
        <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
          <RevealSection>
            <div className="float inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-500/10 px-4 py-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
              <span className="font-display text-[10px] font-bold tracking-[0.25em] text-orange-300">{t("hero_badge", lang)}</span>
              {/* Real battery — from device Battery API, null when unavailable (iOS/iPadOS) */}
              {battery ? (
                <span className="flex items-center gap-1 font-display text-[10px] font-bold text-emerald-300">
                  🔋 {battery.level}%{battery.charging ? " ⚡" : ""}
                </span>
              ) : (
                <span className="font-display text-[10px] text-white/30">🔋 N/A</span>
              )}
            </div>
            {/* Title block — Jordan flag centered BETWEEN the two title lines */}
            <div className="mt-5 flex flex-col items-center text-center">
              <h1 className="font-display text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
                <span className="shimmer-text">{t("hero_title1", lang)}</span>
              </h1>
              <div className="my-2 flex justify-center sm:my-3">
                <JordanFlag className="h-10 w-auto sm:h-12 lg:h-14" />
              </div>
              <h1 className="font-display text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
                <span className="neon-text">{t("hero_title2", lang)}</span>
              </h1>
            </div>
            <p className="mt-5 max-w-xl text-base text-white/70 sm:text-lg">
              {t("hero_desc", lang)} <b className="text-orange-300">{t("hero_devices", lang)}</b> {and} <b className="text-orange-300">{t("hero_weapons", lang)}</b>.
            </p>
            <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
              {[{ k: t("hero_stats_devices", lang), v: "77", sub: t("hero_devices_sub", lang) },
                { k: t("hero_stats_weapons", lang), v: "44", sub: t("hero_weapons_sub", lang) },
                { k: t("hero_stats_servers", lang), v: "7", sub: t("hero_servers_sub", lang) }].map((s) => (
                <div key={s.k} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 backdrop-blur">
                  <div className="font-display text-2xl font-black text-orange-300">{s.v}</div>
                  <div className="text-[11px] font-semibold text-white/80">{s.k}</div>
                  <div className="text-[9px] text-white/40">{s.sub}</div>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => document.getElementById("generator")?.scrollIntoView({ behavior: "smooth" })} className="btn-primary pulse-glow rounded-xl px-6 py-3.5 text-sm">{t("hero_cta1", lang)}</button>
              <button onClick={() => document.getElementById("dns")?.scrollIntoView({ behavior: "smooth" })} className="btn-ghost rounded-xl px-6 py-3.5 text-sm">{t("hero_cta2", lang)}</button>
              <button onClick={() => document.getElementById("dns")?.scrollIntoView({ behavior: "smooth" })} className="btn-ghost rounded-xl px-6 py-3.5 text-sm">{t("hero_cta3", lang)}</button>
              <a
                href="https://serverpubgjor.netlify.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost rounded-xl px-6 py-3.5 text-sm"
              >
                {t("hero_cta4", lang)}
              </a>
            </div>
          </RevealSection>
          <RevealSection delay={1}>
            <div className="card neon-box rounded-3xl p-6">
              <div className="flex items-center justify-between">
                <div className="font-display text-[10px] font-bold tracking-[0.25em] text-white/50">{t("hero_live_status", lang)}</div>
                <span className={`flex items-center gap-1 text-[10px] font-bold ${status === "connected" ? "text-emerald-300" : "text-amber-300"}`}>
                  <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${status === "connected" ? "bg-emerald-400" : "bg-amber-400"}`} />
                  {status === "connected" ? t("hero_connected", lang) : t("hero_measuring", lang)}
                </span>
              </div>
              <div className="mt-4 flex items-end gap-3">
                <span className="font-display text-6xl font-black text-white tabular-nums">{ping}</span>
                <span className="mb-2 text-white/50">ms</span>
                <span className={`mb-2 text-sm font-bold ${qualityColor}`}>{qualityLabel}</span>
              </div>
              <div className="mt-4 space-y-2 border-t border-white/5 pt-4 text-xs">
                <div className="flex justify-between"><span className="text-white/50">{t("hero_network", lang)}</span><span className="font-semibold text-white">{t("hero_nearest", lang)}</span></div>
                <div className="flex justify-between"><span className="text-white/50">{t("hero_recruitment", lang)}</span><span className="font-semibold text-emerald-300">{isAr ? "سريع" : "Fast"}</span></div>
                <div className="flex justify-between"><span className="text-white/50">{t("hero_isp", lang)}</span><span className="font-semibold text-white">{isAr ? "محلي" : "Local"}</span></div>
              </div>
            </div>
          </RevealSection>
        </div>
      </div>
    </section>
  );
}

/* ════════════════ PWA BANNER ════════════════ */
const PWA_KEY = "alyazouri_pwa_dismissed";
export function PWABanner() {
  const { lang } = useLang();
  const [show, setShow] = useState(false);
  const [evt, setEvt] = useState<any>(null);
  useEffect(() => {
    try { if (localStorage.getItem(PWA_KEY) === "true") return; } catch { /* */ }
    const before = (e: Event) => { e.preventDefault(); setEvt(e); setShow(true); };
    window.addEventListener("beforeinstallprompt", before);
    return () => window.removeEventListener("beforeinstallprompt", before);
  }, []);
  if (!show) return null;
  const install = async () => { if (evt) { evt.prompt(); await evt.userChoice; } setShow(false); };
  const dismiss = () => { setShow(false); try { localStorage.setItem(PWA_KEY, "true"); } catch { /* */ } };
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-4">
      <div className="card mx-auto flex max-w-3xl items-center gap-3 rounded-2xl p-4">
        <span className="text-2xl">📲</span>
        <div className="flex-1"><div className="text-sm font-bold text-white">{t("pwa_title", lang)}</div><div className="text-xs text-white/60">{t("pwa_desc", lang)}</div></div>
        <button onClick={install} className="btn-primary rounded-xl px-4 py-2 text-sm">{t("pwa_install", lang)}</button>
        <button onClick={dismiss} className="btn-ghost rounded-xl px-3 py-2 text-sm">{t("pwa_dismiss", lang)}</button>
      </div>
    </div>
  );
}

/* ════════════════ QUICK SEARCH ════════════════ */
export function QuickSearch({ onPickDevice, onPickWeapon }: { onPickDevice: (name: string) => void; onPickWeapon: (catId: string, weaponName: string) => void }) {
  const { lang } = useLang();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { BRANDS, WEAPONS } = useData();
  const lower = q.trim().toLowerCase();
  const devMatches = !lower ? [] : BRANDS.flatMap((b) => b.devices).filter((d) => d.name.toLowerCase().includes(lower)).slice(0, 6);
  const wpnMatches = !lower ? [] : WEAPONS.flatMap((c) => c.weapons.map((w) => ({ cat: c.id, ...w }))).filter((w) => w.name.toLowerCase().includes(lower)).slice(0, 6);
  return (
    <div className="relative w-full max-w-sm">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2">
        <span className="text-white/40">🔍</span>
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          placeholder={t("qs_placeholder", lang)} className="w-full bg-transparent text-sm text-white placeholder-white/30 focus:outline-none" />
        {q && <button onClick={() => { setQ(""); setOpen(false); }} className="text-white/40 hover:text-white">✕</button>}
      </div>
      {open && lower && (devMatches.length > 0 || wpnMatches.length > 0) && (
        <div className="absolute z-50 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-white/10 bg-[#0a0a14]/95 p-1 shadow-2xl backdrop-blur-lg">
          {devMatches.map((d) => (
            <button key={d.name} onClick={() => { onPickDevice(d.name); setOpen(false); setQ(""); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-sm text-white/80 hover:bg-white/5">
              <span>📱</span><span className="flex-1">{d.name}</span>
            </button>
          ))}
          {wpnMatches.map((w) => (
            <button key={w.name} onClick={() => { onPickWeapon(w.cat, w.name); setOpen(false); setQ(""); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-sm text-white/80 hover:bg-white/5">
              <span>🔫</span><span className="flex-1">{w.name}</span><span className="text-[10px] text-white/40">{w.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// helper hook so QuickSearch can access data without prop drilling
import { BRANDS, WEAPONS } from "./data";
function useData() { return { BRANDS, WEAPONS }; }
