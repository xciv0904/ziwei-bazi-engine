/**
 * 民用鐘錶時間 → 地方真太陽時。
 * longitude: 東經為正；utcOffset: 出生地當時的 UTC 時差。
 * 均時差採 NOAA 常用近似式，誤差足以控制在排盤所需的分鐘尺度內。
 */
export function equationOfTimeMinutes(year, month, day, hour = 12) {
  const start = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  const dayOfYear = Math.floor((current - start) / 86400000) + 1;
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hour - 12) / 24);
  return 229.18 * (
    0.000075
    + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma)
  );
}

export function toTrueSolarTime({ year, month, day, hour, minute, longitude, utcOffset }) {
  const values = [year, month, day, hour, minute, longitude, utcOffset];
  if (values.some((value) => !Number.isFinite(Number(value)))) throw new TypeError('真太陽時輸入必須是數字');
  if (longitude < -180 || longitude > 180) throw new RangeError('經度必須介於 -180 到 180');
  if (utcOffset < -12 || utcOffset > 14) throw new RangeError('UTC 時差必須介於 -12 到 +14');
  const equation = equationOfTimeMinutes(year, month, day, hour + minute / 60);
  const longitudeCorrection = 4 * (longitude - 15 * utcOffset);
  const correctionMinutes = equation + longitudeCorrection;
  const shifted = new Date(Date.UTC(year, month - 1, day, hour, minute) + correctionMinutes * 60000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    correctionMinutes,
    equationOfTimeMinutes: equation,
    longitudeCorrectionMinutes: longitudeCorrection,
  };
}
