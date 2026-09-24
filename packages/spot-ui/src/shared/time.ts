export enum TimeUnit {
  Minutes = 60 * 1000,
  Hours = Minutes * 60,
  Weeks = 7 * 24 * Hours,
  Days = Hours * 24,
  Months = 30 * Days,
  Years = 365 * Days,
}

export type TimeDuration = { unit: TimeUnit; value: number };

export function findTimeUnit(millis: number): TimeUnit {
  const units = [
    TimeUnit.Years,
    TimeUnit.Months,
    TimeUnit.Weeks,
    TimeUnit.Days,
    TimeUnit.Hours,
    TimeUnit.Minutes,
  ];
  return units.find((unit) => unit <= millis) || TimeUnit.Minutes;
}

export const getTimeDurationMillis = (duration?: TimeDuration) => {
  if (!duration) return 0;
  return duration.value * duration.unit;
};
