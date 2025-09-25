import { formatInTimeZone } from 'date-fns-tz';

export function nowInTimeZone(timezone: string): string {
  return formatInTimeZone(new Date(), timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
}
