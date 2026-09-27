import { useEffect, useMemo, useState } from "react";
import { useLang } from "./LanguageContext";
import { t } from "./i18n";

/* ════════════════════════════════════════════════════════════════
   Jordanian PUBG activity model (UTC+3, Asia/Amman).
   Honest estimate from real local gaming-activity patterns
   (low daytime, rising late afternoon, evening/nighttime peak).
   NOT live telemetry — an explainable density pattern. ═════ */
const WEEKDAY_DENSITY: number[] = [
  8, 5, 3, 3, 5, 10, 16, 22, 26, 30, 34, 40, 44, 46, 48, 54, 62, 70, 82, 94, 100, 92, 70, 38,
];
const WEEKEND_DENSITY: number[] = [
  12, 7, 4, 4, 6, 12, 20, 26, 32, 38, 44, 50, 55, 58, 60, 64, 70, 80, 90, 97, 100, 96, 80, 52,
];
const TZ = "Asia/Amman";

type Level = "peak" | "high" | "medium" | "low";
function levelOf(d: number): Level {
  if (d >= 85) return "peak";
  if (d >= 60) return "high";
  if (d >= 35) return "medium";
  return "low";
}
const LEVEL_KEY: Record<Level, string> = { peak: "jo_peak", high: "jo_high", medium: "jo_medium", low: "jo_low" };
const LEVEL_COLOR: Record<Level, string> = { peak: "text-emerald-300", high: "text-lime-300", medium: "text-amber-300", low: "text-orange-300" };
const LEVEL_BAR: Record<Level, string> = {
  peak: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300",
  high: "border-lime-400/40 bg-lime-500/10 text-lime-300",
  medium: "border-amber-400/40 bg-amber-500/10 text-amber-300",
  low: "border-orange-400/40 bg-orange-500/10 text-orange-300",
};

/** Resolve all Jordan-time fields in ONE pass (avoids 6 Intl calls per render). */
function joFields(date: Date, isAr: boolean) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday");
  let hour = parseInt(get("hour"), 10);
  if (isNaN(hour)) hour = 0;
  hour = hour % 24; // guard "24" at midnight
  const minute = parseInt(get("minute"), 10) || 0;
  const isWeekend = weekday === "Fri" || weekday === "Sat";
  const table = isWeekend ? WEEKEND_DENSITY : WEEKDAY_DENSITY;
  const density = table[hour];
  // Next hour reaching at least "high" (>=60), scanning forward up to 24h.
  let next = -1;
  for (let i = 1; i <= 24; i++) { if (table[(hour + i) % 24] >= 60) { next = i; break; } }
  const timeStr = new Intl.DateTimeFormat(isAr ? "ar-JO" : "en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true }).format(date);
  const dayName = new Intl.DateTimeFormat(isAr ? "ar-JO" : "en-US", { timeZone: TZ, weekday: "long" }).format(date);
  return { weekday, hour, minute, isWeekend, table, density, next, timeStr, dayName };
}

function fmtEta(hours: number, isAr: boolean): string {
  if (hours <= 0) return isAr ? "الآن" : "now";
  const h = hours - 1; // partial hour already elapsed → ~h hours ahead
  if (h <= 0) return isAr ? "خلال ساعة" : "within 1h";
  return isAr ? `بعد ${h} ساعة` : `in ${h}h`;
}

function Bar({ h, active, hour }: { h: number; active: boolean; hour: number }) {
  const color = h >= 85 ? "from-emerald-500 to-teal-400" : h >= 60 ? "from-lime-500 to-emerald-400" : h >= 35 ? "from-amber-500 to-orange-400" : "from-orange-600 to-red-500";
  return (
    <div className="flex flex-1 flex-col items-center justify-end gap-1" title={`${h}%`}>
      <div className={`w-full rounded-t bg-gradient-to-t ${color} transition-all ${active ? "ring-2 ring-white/70" : "opacity-70"}`} style={{ height: `${Math.max(4, h)}%` }} />
      {hour % 3 === 0 && <span className="text-[8px] text-white/30" dir="ltr">{hour}</span>}
    </div>
  );
}

export function JordanMatchmaking() {
  const { lang } = useLang();
  const isAr = lang === "ar";
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(id);
  }, []);

  const f = useMemo(() => joFields(now, isAr), [now, isAr]);
  const level = levelOf(f.density);
  const good = level === "peak" || level === "high";

  return (
    <div className="card relative overflow-hidden rounded-2xl p-5">
      <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute inset-0 bg-grid opacity-10" />
      <div className="relative">
        {/* Live JO clock + status */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 p-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🇯🇴</span>
            <div>
              <div className="font-display text-2xl font-black text-white tabular-nums">{f.timeStr}</div>
              <div className="text-[11px] text-white/50">{f.dayName} · {isAr ? "توقيت الأردن" : "Jordan time"}{f.isWeekend && <span className="text-emerald-300"> · {isAr ? "عطلة" : "Weekend"}</span>}</div>
            </div>
          </div>
          <div className="text-right">
            <div className={`font-display text-sm font-bold ${LEVEL_COLOR[level]}`}>{t(LEVEL_KEY[level] as never, lang)}</div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-[10px] text-white/40">{isAr ? "كثافة الآن" : "Density now"}</span>
              <span className="font-display text-lg font-black text-white tabular-nums">{f.density}%</span>
            </div>
          </div>
        </div>

        {/* Play-now indicator + next peak ETA */}
        <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs font-bold ${LEVEL_BAR[level]}`}>
          <span className="flex items-center gap-2"><span className="text-lg">{good ? "✅" : "⏳"}</span>{good ? t("jo_play_now", lang) : t("jo_wait", lang)}</span>
          {!good && f.next > 0 && (
            <span className="rounded-full bg-black/30 px-2.5 py-1 text-[10px]">
              {isAr ? "أقرب ذروة" : "Next peak"} ⏱️ {fmtEta(f.next, isAr)}
            </span>
          )}
        </div>

        {/* 24h density chart */}
        <div className="mt-4">
          <div className="mb-2 font-display text-[10px] font-bold tracking-widest text-white/60">📈 {t("jo_density", lang)}</div>
          <div className="flex h-28 items-end gap-0.5 rounded-lg border border-white/5 bg-black/30 p-2">
            {f.table.map((h, hr) => <Bar key={hr} h={h} active={hr === f.hour} hour={hr} />)}
          </div>
        </div>

        {/* Best windows */}
        <div className="mt-4">
          <div className="mb-2 font-display text-[10px] font-bold tracking-widest text-white/60">⏰ {t("jo_best_windows", lang)}</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <WindowCard icon="🌆" title={t("jo_wd_evening", lang)} time={isAr ? "8:00م – 11:00م" : "8:00PM – 11:00PM"} pct="94–100%" color="from-emerald-500/10 to-teal-500/5 border-emerald-400/20" />
            <WindowCard icon="🌙" title={t("jo_we_night", lang)} time={isAr ? "9:00م – 2:00ص" : "9:00PM – 2:00AM"} pct="96–100%" color="from-lime-500/10 to-emerald-500/5 border-lime-400/20" />
            <WindowCard icon="🌇" title={t("jo_early", lang)} time={isAr ? "5:00م – 8:00م" : "5:00PM – 8:00PM"} pct="62–82%" color="from-amber-500/10 to-orange-500/5 border-amber-400/20" />
          </div>
        </div>

        {/* Server + routing */}
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-sky-400/20 bg-sky-500/5 p-3">
            <div className="font-display text-[10px] font-bold text-sky-300">🛰️ {t("jo_server", lang)}</div>
            <div className="mt-1 text-sm font-bold text-white">{t("jo_me_server", lang)}</div>
            <p className="mt-1 text-[10px] leading-relaxed text-white/55">{t("jo_server_desc", lang)}</p>
          </div>
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-3">
            <div className="font-display text-[10px] font-bold text-amber-300">🧭 {t("jo_routing", lang)}</div>
            <p className="mt-1 text-[10px] leading-relaxed text-white/55">{t("jo_routing_desc", lang)}</p>
            <button onClick={() => document.getElementById("dns")?.scrollIntoView({ behavior: "smooth" })} className="btn-ghost mt-2 w-full rounded-lg py-1.5 text-[10px]">🛡️ {isAr ? "محلّل البروكسي" : "Proxy Analyzer"}</button>
            <button onClick={() => document.getElementById("dns")?.scrollIntoView({ behavior: "smooth" })} className="btn-ghost mt-1.5 w-full rounded-lg py-1.5 text-[10px]">🛰️ DNS Analyzer</button>
          </div>
        </div>

        {/* Tips */}
        <div className="mt-4">
          <div className="mb-2 font-display text-[10px] font-bold tracking-widest text-white/60">💡 {t("jo_tips", lang)}</div>
          <div className="space-y-1.5">
            {(["jo_tip1", "jo_tip2", "jo_tip3", "jo_tip4"] as const).map((k, i) => (
              <div key={k} className="flex items-start gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-[11px] text-white/75">
                <span className="shrink-0 font-bold text-emerald-300">{i + 1}</span><span>{t(k, lang)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-[10px] leading-relaxed text-amber-200/80">⚠️ {t("jo_disclaimer", lang)}</p>
      </div>
    </div>
  );
}

function WindowCard({ icon, title, time, pct, color }: { icon: string; title: string; time: string; pct: string; color: string }) {
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-3 ${color}`}>
      <div className="flex items-center gap-2"><span className="text-lg">{icon}</span><span className="text-[11px] font-bold text-white">{title}</span></div>
      <div className="mt-1.5 font-display text-xs font-bold text-white tabular-nums" dir="ltr">{time}</div>
      <div className="mt-0.5 text-[10px] text-emerald-300/80">{pct}</div>
    </div>
  );
}
