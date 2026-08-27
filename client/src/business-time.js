export const BUSINESS_TIME_ZONE = 'Asia/Shanghai';

function parts(value, includeTime = false) {
  const options = {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime && { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  };
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', options)
    .formatToParts(new Date(value))
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value: part }) => [type, part]));
}

export function businessDateTimeParts(value) {
  return parts(value, true);
}

export function businessDateKey(value) {
  const { year, month, day } = parts(value);
  return `${year}-${month}-${day}`;
}

export function businessTimeLabel(value) {
  const { hour, minute } = parts(value, true);
  return `${hour}:${minute}`;
}

export function formatBusinessDate(value, options, locale = 'zh-CN') {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(value));
}
