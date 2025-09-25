import { formatInTimeZone } from 'date-fns-tz';

export function generateRequestId(prefix: string, timezone: string): string {
  const datePart = formatInTimeZone(new Date(), timezone, 'yyyyMMdd');
  const randomPart = Math.random().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${datePart}-${randomPart}`;
}
