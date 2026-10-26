/**
 * Axis scale with "nice" round tick values, e.g. a maximum of 980 gives an
 * axis from 0 to 1000 in steps of 250.
 */
export function niceScale(max: number, tickCount = 4): { max: number; step: number; ticks: number[] } {
  if (!Number.isFinite(max) || max <= 0) {
    return { max: 100, step: 25, ticks: [0, 25, 50, 75, 100] };
  }
  const rough = max / tickCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const fraction = rough / magnitude;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  const step = nice * magnitude;
  const axisMax = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= axisMax + step / 1000; value += step) ticks.push(value);
  return { max: axisMax, step, ticks };
}
