// ALYAZOURI GG Supreme sensitivity orchestrator.
// Deterministic pipeline: normalize → calibrate → search → measure → validate.
import { getWeaponProfile } from "../weaponProfiles";
import { MODEL_VERSION } from "./calibration";
import { ENGINES, SCOPES } from "./types";
import {
  attribution, computeScores, confidence, freeLookFromProfile, optimize,
  validationIssues,
} from "./optimizer";
import type {
  ApexInput, DeviceProfile, ExplanationItem, OptimizationResult,
  ScopeSens, SensitivityProfile, WeaponIntel,
} from "./types";

const cache = new Map<string, OptimizationResult>();

export function buildDeviceProfile(input: {
  name: string;
  fps: number;
  refreshRate?: number;
  touchRate: number;
  screenSize: number;
  resolution: string;
  gyroQuality: "excellent" | "good" | "average";
}): DeviceProfile {
  const match = input.resolution.match(/(\d+)[×x](\d+)/);
  const width = match ? Number(match[1]) : 2400;
  const height = match ? Number(match[2]) : 1080;
  const refreshRate = input.refreshRate ?? input.fps;
  return {
    ...input,
    refreshRate,
    touchLatencyMs: 1000 / input.touchRate,
    ppi: Math.sqrt(width ** 2 + height ** 2) / input.screenSize,
    aspectRatio: width / height,
  };
}

export function buildWeaponIntel(
  name: string,
  recoil: number,
  range: number,
  type: string,
): WeaponIntel {
  const profile = getWeaponProfile(name, recoil, range, type);
  return {
    name,
    type,
    recoil,
    range,
    fireRate: profile.fireRate,
    verticalRecoil: profile.verticalRecoil,
    horizontalRecoil: profile.horizontalRecoil,
    adsSpeed: profile.adsSpeed,
  };
}

export function fingerprint(input: ApexInput): string {
  return [
    MODEL_VERSION,
    input.device.name,
    input.device.fps,
    input.device.refreshRate,
    input.device.touchRate,
    input.device.screenSize,
    input.device.resolution,
    input.device.gyroQuality,
    input.weapon.name,
    input.weapon.verticalRecoil,
    input.weapon.horizontalRecoil,
    input.weapon.fireRate,
    input.fingers,
    input.gyroMode,
    input.mode,
    input.targetStyle,
    input.range,
    input.aimPriority,
    input.playStyle,
  ].join("|");
}

export function clearApexCache(): void {
  cache.clear();
}

export function apexCacheSize(): number {
  return cache.size;
}

function explanations(
  input: ApexInput,
  result: OptimizationResult,
): ExplanationItem[] {
  const context = result.gProfile;
  const average = (values: number[]): number =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const gyroAverage = average(Object.values(context.gyroCam));
  const adsGyroAverage = average(Object.values(context.gyroAds));
  const topFactor = [...result.attribution].sort((a, b) => b.deltaPct - a.deltaPct)[0];
  return [
    {
      label: "Device response",
      detail: `${input.device.name} · ${input.device.screenSize.toFixed(1)}\" · ${input.device.ppi.toFixed(0)} PPI · ${input.device.fps} FPS · ${input.device.touchRate} Hz → ${result.inputLagMs.toFixed(1)} ms modelled input interval`,
      impact: result.inputLagMs <= 14 ? "boost" : "stabilize",
    },
    {
      label: "Weapon model",
      detail: `${input.weapon.name} (${input.weapon.type}) · vertical ${input.weapon.verticalRecoil} · horizontal ${input.weapon.horizontalRecoil} · ${input.weapon.fireRate} RPM; every one of its 32 calibrated seed dimensions was transferred independently`,
      impact: "tune",
    },
    {
      label: "Gyroscope separation",
      detail: `Gyroscope average multiplier ${gyroAverage.toFixed(3)} · ADS Gyroscope ${adsGyroAverage.toFixed(3)}; both channels were optimized independently`,
      impact: adsGyroAverage > gyroAverage ? "boost" : "stabilize",
    },
    {
      label: "Aim-error search",
      detail: `${result.candidatesEvaluated} deterministic candidates evaluated across 32 dimensions; tracking, recoil, micro-shake, drift, overshoot and undershoot were measured before selection`,
      impact: "stabilize",
    },
    topFactor ? {
      label: "Largest adjustment",
      detail: `${topFactor.label}: ${topFactor.direction} by about ${topFactor.deltaPct}%`,
      impact: topFactor.direction === "up" ? "boost" : topFactor.direction === "down" ? "reduce" : "tune",
    } : {
      label: "Calibration",
      detail: "The reference calibration was retained without an unnecessary shift.",
      impact: "tune",
    },
  ];
}

export function runApex(input: ApexInput): OptimizationResult {
  const key = fingerprint(input);
  const cached = cache.get(key);
  if (cached) return cached;

  const optimized = optimize(input);
  const issues = validationIssues(optimized.profile);
  const scores = computeScores(input, optimized.errors);
  const averageDevice = ENGINES.reduce(
    (sum, engine) => sum + optimized.ctx.device.engineGain[engine],
    0,
  ) / ENGINES.length;
  const averageCalibration = ENGINES.reduce(
    (engineSum, engine) => engineSum + SCOPES.reduce(
      (scopeSum, scope) => scopeSum + optimized.gProfile[engine][scope],
      0,
    ),
    0,
  ) / (ENGINES.length * SCOPES.length);
  const result: OptimizationResult = {
    id: "alyazouri-gg",
    engine: "ALYAZOURI_GG_APEX_ENGINE",
    tier: "SUPREME",
    game: "PUBG MOBILE GLOBAL",
    profile: optimized.profile,
    scores,
    scopePerformance: optimized.scopePerformance,
    engineScope: optimized.engineScope,
    explanations: [],
    fingerprint: key,
    totalAimError: optimized.totalError,
    valid: issues.length === 0,
    candidatesEvaluated: optimized.candidates,
    recoilCompFactor: optimized.recoilCompFactor,
    headLevelOptimized:
      input.mode === "head" || input.mode === "precision" || input.mode === "competitive" ||
      input.aimPriority === "head" || input.aimPriority === "precision",
    inputLagMs: optimized.ctx.device.inputLatencyMs,
    microShakeIndex: scores.micro,
    headLevelStability: scores.head,
    trackingStability: scores.tracking,
    scopeStability: scores.stability,
    errors: optimized.errors,
    attribution: attribution(input, optimized),
    confidence: confidence(input, optimized.avgMargin),
    freeLook: freeLookFromProfile(input, optimized.profile),
    // No fake learning: true only when real feedback exists. No feedback UI is present.
    learned: false,
    gProfile: optimized.gProfile,
    modelVersion: MODEL_VERSION,
    validationIssues: issues,
    modelFactors: {
      device: averageDevice,
      fingers: optimized.ctx.fingerControl,
      calibration: averageCalibration,
      recoil: optimized.recoilCompFactor,
    },
  };
  result.explanations = explanations(input, result);
  cache.set(key, result);
  return result;
}

export function apexToScopeSens(profile: SensitivityProfile): {
  cam: ScopeSens;
  ads: ScopeSens;
  gyroCam: ScopeSens;
  gyroAds: ScopeSens;
} {
  return {
    cam: profile.cam,
    ads: profile.ads,
    gyroCam: profile.gyroCam,
    gyroAds: profile.gyroAds,
  };
}
