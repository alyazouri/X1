// ALYAZOURI GG multi-objective search.
// Every one of the 32 dimensions runs an independent deterministic candidate
// search around a weapon/device/player calibrated baseline.
import {
  AIM_PRIORITY_MUL, FINGER_MODEL, GYRO_MODEL, MODE_REGISTRY, OPTIMIZER,
} from "./constants";
import {
  buildPhysicsContext, calibratedBaseline, evaluateCandidate,
  type DimensionErrors, type PhysicsContext,
} from "./physics";
import {
  BOUNDS, ENGINES, OBJECTIVE_KEYS, SCOPES,
  type ApexInput, type EngineId, type EngineScopeMatrix,
  type FactorAttribution, type GProfile, type MeasuredErrors,
  type OptimizationScore, type ScopeId,
  type ScopePerformance, type SensitivityProfile,
} from "./types";
import { emptyProfile } from "./calibration";

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
const round = (value: number, digits = 0): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const isGyro = (engine: EngineId): boolean => engine === "gyroCam" || engine === "gyroAds";
const maxFor = (engine: EngineId): number => isGyro(engine) ? BOUNDS.gyro.max : engine === "ads" ? BOUNDS.ads.max : BOUNDS.cam.max;

interface SearchResult {
  multiplier: number;
  errors: DimensionErrors;
  evaluated: number;
  margin: number;
}

function searchDimension(
  input: ApexInput,
  context: PhysicsContext,
  engine: EngineId,
  scope: ScopeId,
): SearchResult {
  let bestMultiplier = 1;
  let bestErrors: DimensionErrors | null = null;
  let bestTotal = Number.POSITIVE_INFINITY;
  let secondBest = Number.POSITIVE_INFINITY;
  let evaluated = 0;

  for (
    let multiplier = OPTIMIZER.minMultiplier;
    multiplier <= OPTIMIZER.maxMultiplier + 1e-9;
    multiplier += OPTIMIZER.step
  ) {
    const candidate = round(multiplier, 3);
    const errors = evaluateCandidate(input, context, engine, scope, candidate);
    evaluated += 1;
    if (errors.total < bestTotal - 1e-12) {
      secondBest = bestTotal;
      bestErrors = errors;
      bestTotal = errors.total;
      bestMultiplier = candidate;
    } else if (errors.total > bestTotal + 1e-12 && errors.total < secondBest) {
      secondBest = errors.total;
    }
  }

  const selectedErrors = bestErrors ?? evaluateCandidate(input, context, engine, scope, 1);
  const rawMargin = Number.isFinite(secondBest)
    ? (secondBest - selectedErrors.total) / Math.max(selectedErrors.total, 0.0001)
    : 0;
  return {
    multiplier: bestMultiplier,
    errors: selectedErrors,
    evaluated,
    margin: clamp(rawMargin * 8, 0, 1),
  };
}

export interface OptimizeOutput {
  profile: SensitivityProfile;
  baseline: SensitivityProfile;
  gProfile: GProfile;
  errors: MeasuredErrors;
  totalError: number;
  candidates: number;
  avgMargin: number;
  engineScope: EngineScopeMatrix;
  scopePerformance: ScopePerformance;
  ctx: PhysicsContext;
  recoilCompFactor: number;
}

const emptyMatrix = (): EngineScopeMatrix => ({
  cam: {} as ScopePerformance,
  ads: {} as ScopePerformance,
  gyroCam: {} as ScopePerformance,
  gyroAds: {} as ScopePerformance,
});

function aggregateErrors(errors: DimensionErrors[]): MeasuredErrors {
  const count = Math.max(1, errors.length);
  const sum = (key: keyof DimensionErrors): number =>
    errors.reduce((total, item) => total + item[key], 0) / count;
  return {
    tracking: round(sum("tracking"), 4),
    overshoot: round(sum("overshoot"), 4),
    undershoot: round(sum("undershoot"), 4),
    microShake: round(sum("microShake"), 4),
    aimDrift: round(sum("aimDrift"), 4),
    recoil: round(sum("recoil"), 4),
    response: round(sum("response"), 4),
    total: round(sum("total"), 4),
  };
}

export function optimize(input: ApexInput): OptimizeOutput {
  const context = buildPhysicsContext(input);
  const profile = emptyProfile();
  const baseline = emptyProfile();
  const gProfile = emptyProfile() as GProfile;
  const engineScope = emptyMatrix();
  const chosenErrors: DimensionErrors[] = [];
  let candidates = 0;
  let marginTotal = 0;
  let recoilRatioTotal = 0;
  let recoilRatioCount = 0;

  for (const engine of ENGINES) {
    for (const scope of SCOPES) {
      const baseValue = calibratedBaseline(input, context, engine, scope);
      const search = searchDimension(input, context, engine, scope);
      const value = Math.round(clamp(
        baseValue * search.multiplier,
        BOUNDS.cam.min,
        maxFor(engine),
      ));
      baseline[engine][scope] = Math.round(clamp(baseValue, BOUNDS.cam.min, maxFor(engine)));
      profile[engine][scope] = value;
      gProfile[engine][scope] = search.multiplier;
      chosenErrors.push(search.errors);
      candidates += search.evaluated;
      marginTotal += search.margin;
      engineScope[engine][scope] = Math.round(
        100 * Math.exp(-search.errors.total * OPTIMIZER.errorScoreDecay),
      );

      if ((engine === "gyroCam" || engine === "gyroAds") &&
          (scope === "red" || scope === "scope2" || scope === "scope3" || scope === "scope4")) {
        recoilRatioTotal += value / Math.max(1, baseline[engine][scope]);
        recoilRatioCount += 1;
      }
    }
  }

  const scopePerformance = {} as ScopePerformance;
  for (const scope of SCOPES) {
    const activeEngines = input.gyroMode === "off"
      ? (["cam", "ads"] as EngineId[])
      : ENGINES;
    scopePerformance[scope] = Math.round(
      activeEngines.reduce((sum, engine) => sum + engineScope[engine][scope], 0) /
      activeEngines.length,
    );
  }
  const errors = aggregateErrors(chosenErrors);

  return {
    profile,
    baseline,
    gProfile,
    errors,
    totalError: errors.total,
    candidates,
    avgMargin: marginTotal / (ENGINES.length * SCOPES.length),
    engineScope,
    scopePerformance,
    ctx: context,
    recoilCompFactor: round(recoilRatioTotal / Math.max(1, recoilRatioCount), 2),
  };
}

const scoreFromError = (error: number, decay: number): number =>
  Math.round(clamp(100 * Math.exp(-error * decay), 0, 100));

/** Scores are derived from measured optimum errors, not hardware marketing labels. */
export function computeScores(input: ApexInput, errors: MeasuredErrors): OptimizationScore {
  const tracking = scoreFromError(errors.tracking + errors.undershoot * 0.35, 80);
  const recoil = scoreFromError(errors.recoil, 95);
  const micro = scoreFromError(errors.microShake + errors.overshoot * 0.35, 95);
  const stability = scoreFromError(errors.aimDrift + errors.microShake * 0.45 + errors.overshoot * 0.35, 75);
  const rotation = scoreFromError(errors.response + errors.undershoot * 0.45, 70);
  const targetSwitch = scoreFromError(errors.tracking * 0.6 + errors.response * 0.4, 80);
  const precision = scoreFromError(errors.microShake * 0.55 + errors.overshoot * 0.3 + errors.aimDrift * 0.15, 90);
  const head = Math.round(tracking * 0.27 + recoil * 0.29 + micro * 0.25 + stability * 0.19);
  const adhesion = Math.round(tracking * 0.45 + stability * 0.25 + micro * 0.2 + targetSwitch * 0.1);
  const scores: OptimizationScore = {
    head, tracking, adhesion, recoil, micro, stability,
    rotation, targetSwitch, precision, supreme: 0,
  };
  const modeWeights = MODE_REGISTRY[input.mode].weights;
  const priority = AIM_PRIORITY_MUL[input.aimPriority];
  let weighted = 0;
  let weightTotal = 0;
  for (const key of OBJECTIVE_KEYS) {
    const weight = modeWeights[key] * (priority[key] ?? 1);
    weighted += scores[key] * weight;
    weightTotal += weight;
  }
  scores.supreme = Math.round(weighted / weightTotal);
  return scores;
}

/** Validate ranges, finiteness, scope separation, and independent gyro engines. */
export function validationIssues(profile: SensitivityProfile): string[] {
  const issues: string[] = [];
  for (const engine of ENGINES) {
    const values: number[] = [];
    for (const scope of SCOPES) {
      const value = profile[engine][scope];
      values.push(value);
      if (!Number.isFinite(value)) issues.push(`${engine}.${scope}: non-finite`);
      if (value < 1 || value > maxFor(engine)) issues.push(`${engine}.${scope}: out-of-range`);
    }
    if (new Set(values).size < 4) issues.push(`${engine}: insufficient scope separation`);
  }
  const gyroDifferences = SCOPES.filter(
    (scope) => profile.gyroCam[scope] !== profile.gyroAds[scope],
  ).length;
  if (gyroDifferences < 2) issues.push("gyroCam/gyroAds: insufficient independent separation");
  return issues;
}

export function attribution(input: ApexInput, output: OptimizeOutput): FactorAttribution[] {
  const context = output.ctx;
  const avgDevice = ENGINES.reduce(
    (sum, engine) => sum + context.device.engineGain[engine],
    0,
  ) / ENGINES.length;
  const finger = Math.abs(FINGER_MODEL[input.fingers].engineGain.gyroCam - 1) * 100;
  const gyro = Math.abs(GYRO_MODEL[input.gyroMode].engineGain.gyroCam - 1) * 100;
  const target = Math.abs(
    context.targetAngularSpeed / context.referenceAngularSpeed - 1,
  ) * 2.5;
  const mode = MODE_REGISTRY[input.mode];
  const values = [
    { factor: "device", label: "Device / screen / response", delta: (avgDevice - 1) * 100 },
    { factor: "recoil", label: "Weapon recoil + fire rate", delta: context.recoilDelta * 4.5 },
    { factor: "gyro", label: "Gyroscope mode", delta: GYRO_MODEL[input.gyroMode].engineGain.gyroCam - 1 < 0 ? -gyro : gyro },
    { factor: "target", label: "Target speed + distance", delta: target * Math.sign(context.targetAngularSpeed - context.referenceAngularSpeed) },
    { factor: "finger", label: "Finger input geometry", delta: (input.fingers < 5 ? -finger : finger) },
    { factor: "mode", label: "Advanced calibration mode", delta: (mode.speedBias + mode.recoilBias - mode.precisionBias) * 50 },
  ];
  return values.map(({ factor, label, delta }) => ({
    factor,
    label,
    deltaPct: round(Math.abs(delta), 1),
    direction: delta > 0.25 ? "up" : delta < -0.25 ? "down" : "neutral",
  }));
}

export function confidence(input: ApexInput, margin: number): {
  score: number; level: "low" | "medium" | "high";
  margin: number; richness: number; iterations: number;
} {
  const completeDevice = input.device.fps > 0 && input.device.touchRate > 0 &&
    input.device.ppi > 0 && input.device.screenSize > 0;
  const completeWeapon = input.weapon.fireRate > 0 &&
    input.weapon.verticalRecoil >= 0 && input.weapon.horizontalRecoil >= 0;
  const richness = (completeDevice ? 0.5 : 0.25) + (completeWeapon ? 0.5 : 0.25);
  const score = Math.round(clamp(62 + richness * 23 + margin * 12, 0, 97));
  return {
    score,
    level: score >= 84 ? "high" : score >= 68 ? "medium" : "low",
    margin: round(margin, 2),
    richness: round(richness, 2),
    iterations: 1,
  };
}

export function freeLookFromProfile(
  input: ApexInput,
  profile: SensitivityProfile,
): { cam: number; parashoot: number; vehicle: number } {
  const speedBias = MODE_REGISTRY[input.mode].speedBias;
  const base = (profile.cam.tpp * 0.55 + profile.cam.fpp * 0.45) * (1 + speedBias * 0.35);
  return {
    cam: Math.round(clamp(base * 0.76, 1, 300)),
    parashoot: Math.round(clamp(base * 0.72, 1, 300)),
    vehicle: Math.round(clamp(base * 0.68, 1, 300)),
  };
}
