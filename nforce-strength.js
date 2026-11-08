/** N-FORCE opponent-adjusted attack/defence rating.
 * Regularised weighted Poisson model. Only completed league matches available
 * STRICTLY before the target kickoff should be passed in. No external news.
 * Ratings are constrained and blended with the previous conservative engine;
 * neither this model nor a high probability implies a proven hit rate.
 */
const DAY = 86400000;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function fitOpponentRatings(prior, cutoff, baseHome, baseAway, {
  ridge = 5, iterations = 24, halfLife = 165 * Math.LN2, maxEffect = 0.75
} = {}) {
  if (!Number.isFinite(cutoff) || !Number.isFinite(baseHome) || !Number.isFinite(baseAway) || baseHome <= 0 || baseAway <= 0)
    return null;
  const names = new Map(), rows = [];
  const indexOf = name => {
    if (!names.has(name)) names.set(name, names.size);
    return names.get(name);
  };
  for (const m of prior || []) {
    const home = String(m.home || ''), away = String(m.away || '');
    const raw = String(m.kickoff || '').trim().replace(' ', 'T');
    const time = m.kickoff instanceof Date ? m.kickoff.getTime() : raw
      ? Date.parse(/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(raw) ? raw : raw + 'Z')
      : NaN;
    // No unknown kickoff and no target/future result is allowed in the rating fit.
    if (!home || !away || home === away || !Number.isFinite(time) || time >= cutoff ||
      !Number.isInteger(Number(m.home_goals)) || !Number.isInteger(Number(m.away_goals)) ||
      Number(m.home_goals) < 0 || Number(m.away_goals) < 0) continue;
    const age = Math.max(0, (cutoff - time) / DAY);
    rows.push({h: indexOf(home), a: indexOf(away), hg: Number(m.home_goals), ag: Number(m.away_goals),
      w: Math.exp(-age * Math.LN2 / halfLife)});
  }
  if (rows.length < 36) return null;
  const n = names.size, atk = Array(n).fill(0), def = Array(n).fill(0), samples = Array(n).fill(0);
  for (const m of rows) { samples[m.h] += m.w; samples[m.a] += m.w; }
  for (let iteration = 0; iteration < iterations; iteration++) {
    const ga = Array(n).fill(0), gd = Array(n).fill(0), ha = Array(n).fill(ridge), hd = Array(n).fill(ridge);
    for (const m of rows) {
      const muH = baseHome * Math.exp(atk[m.h] + def[m.a]);
      const muA = baseAway * Math.exp(atk[m.a] + def[m.h]);
      const hErr = m.w * (m.hg - muH), aErr = m.w * (m.ag - muA);
      ga[m.h] += hErr; gd[m.a] += hErr; ha[m.h] += m.w * muH; hd[m.a] += m.w * muH;
      ga[m.a] += aErr; gd[m.h] += aErr; ha[m.a] += m.w * muA; hd[m.h] += m.w * muA;
    }
    for (let t = 0; t < n; t++) {
      atk[t] = clamp(atk[t] + clamp((ga[t] - ridge * atk[t]) / ha[t], -0.16, 0.16) * 0.55, -maxEffect, maxEffect);
      def[t] = clamp(def[t] + clamp((gd[t] - ridge * def[t]) / hd[t], -0.16, 0.16) * 0.55, -maxEffect, maxEffect);
    }
  }
  const rating = team => {
    const id = names.get(team);
    return id === undefined ? {attack:0,concede:0,weight:0} : {attack:atk[id],concede:def[id],weight:samples[id]};
  };
  return {rating,trainedMatches:rows.length,clubs:n};
}

export function opponentAdjustedGoals(ratings, home, away, baseHome, baseAway, legacy) {
  if (!ratings || !Array.isArray(legacy) || legacy.length !== 2) return null;
  const h = ratings.rating(home), a = ratings.rating(away);
  if (Math.min(h.weight, a.weight) < 3) return null;
  // Team strength is regularised by ridge and further dampened by data support.
  const mix = clamp(0.25 + 0.35 * Math.min(1, Math.min(h.weight, a.weight) / 12), 0.25, 0.60);
  const adjustedH = clamp(baseHome * Math.exp(h.attack + a.concede), 0.3, 3.6);
  const adjustedA = clamp(baseAway * Math.exp(a.attack + h.concede), 0.3, 3.6);
  return {home:clamp(Math.exp((1-mix)*Math.log(legacy[0]) + mix*Math.log(adjustedH)),0.3,3.6),
    away:clamp(Math.exp((1-mix)*Math.log(legacy[1]) + mix*Math.log(adjustedA)),0.3,3.6),
    mix,trainedMatches:ratings.trainedMatches,
    opponentSamples:{home:Number(h.weight.toFixed(1)),away:Number(a.weight.toFixed(1))}};
}
