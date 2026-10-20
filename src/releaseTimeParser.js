/**
 * src/releaseTimeParser.js
 * Core release-date and time-zone parsing and formatting engine for NuvioTV.
 *
 * Designed with explicit string parsing (no fragile regexes) so it is easy to
 * read, debug, and immune to copy-paste whitespace issues.
 */

const DEFAULT_VIEWER_TIME_ZONE = "Africa/Nairobi";
const DEFAULT_DISPLAY_MODE = "original";

/**
 * Checks whether a string consists strictly of ASCII digits (0-9).
 */
function isDigitsOnly(str) {
  if (typeof str !== "string" || str.length === 0) {
    return false;
  }
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 48 || code > 57) {
      return false;
    }
  }
  return true;
}

/**
 * Validates that a year, month (1-12), and day (1-31) form a real calendar date
 * (e.g., rejects 2026-02-30).
 */
function isValidCalendarDate(year, month, day) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * Validates that hour (0-23), minute (0-59), and second (0-59) are valid clock values.
 */
function isValidClockTime(hour, minute, second = 0) {
  return (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    Number.isInteger(second) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59
  );
}

/**
 * Checks whether a named IANA time zone (e.g., "America/New_York", "Africa/Nairobi")
 * is recognized by Node.js's built-in Intl database.
 */
function isValidTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== "string") {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timeZone.trim() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a strict 10-character "YYYY-MM-DD" string into { year, month, day, dateString }
 * or returns null if invalid.
 */
function parseStrictDatePart(dateStr) {
  if (typeof dateStr !== "string" || dateStr.length !== 10) {
    return null;
  }
  if (dateStr[4] !== "-" || dateStr[7] !== "-") {
    return null;
  }
  const yStr = dateStr.slice(0, 4);
  const mStr = dateStr.slice(5, 7);
  const dStr = dateStr.slice(8, 10);

  if (!isDigitsOnly(yStr) || !isDigitsOnly(mStr) || !isDigitsOnly(dStr)) {
    return null;
  }

  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);

  if (!isValidCalendarDate(year, month, day)) {
    return null;
  }

  return {
    year,
    month,
    day,
    dateString: `${yStr}-${mStr}-${dStr}`
  };
}

/**
 * Parses a clock time string ("HH:MM", "HH:MM:SS", or "HH:MM:SS.sss")
 * into { hour, minute, second, ms, hhmm } or returns null if invalid.
 */
function parseStrictTimePart(timeStr) {
  if (typeof timeStr !== "string" || timeStr.length < 5) {
    return null;
  }
  if (timeStr[2] !== ":") {
    return null;
  }

  const hStr = timeStr.slice(0, 2);
  const mStr = timeStr.slice(3, 5);
  if (!isDigitsOnly(hStr) || !isDigitsOnly(mStr)) {
    return null;
  }

  let second = 0;
  let ms = 0;

  if (timeStr.length > 5) {
    if (timeStr[5] !== ":") {
      return null;
    }
    const rest = timeStr.slice(6);
    const dotIndex = rest.indexOf(".");
    const sStr = dotIndex === -1 ? rest : rest.slice(0, dotIndex);
    const msStr = dotIndex === -1 ? "0" : rest.slice(dotIndex + 1);

    if (
      sStr.length !== 2 ||
      !isDigitsOnly(sStr) ||
      !isDigitsOnly(msStr) ||
      msStr.length > 3
    ) {
      return null;
    }
    second = Number(sStr);
    ms = Number(msStr.padEnd(3, "0"));
  }

  const hour = Number(hStr);
  const minute = Number(mStr);

  if (!isValidClockTime(hour, minute, second)) {
    return null;
  }

  return {
    hour,
    minute,
    second,
    ms,
    hhmm: `${hStr}:${mStr}`
  };
}

/**
 * Extracts structured calendar & clock parts for a given UTC epoch millisecond instant
 * in a specific named IANA timeZone.
 */
function getZonedParts(epochMs, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short"
  });

  const parts = formatter.formatToParts(new Date(epochMs));
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  const hourNum = Number(map.hour === "24" ? "00" : map.hour);
  const minuteNum = Number(map.minute);
  const secondNum = Number(map.second);
  const yearNum = Number(map.year);
  const monthNum = Number(map.month);
  const dayNum = Number(map.day);

  // Compute exact numeric UTC offset (+HH:MM / -HH:MM) directly from the wall-clock difference
  const zonedWallAsUtcMs = Date.UTC(
    yearNum,
    monthNum - 1,
    dayNum,
    hourNum,
    minuteNum,
    secondNum
  );
  const roundedEpochSecMs = Math.floor(epochMs / 1000) * 1000;
  const offsetTotalMinutes = Math.round(
    (zonedWallAsUtcMs - roundedEpochSecMs) / 60000
  );

  const sign = offsetTotalMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetTotalMinutes);
  const offH = String(Math.floor(absMinutes / 60)).padStart(2, "0");
  const offM = String(absMinutes % 60).padStart(2, "0");
  const isoOffset = `${sign}${offH}:${offM}`;

  return {
    year: yearNum,
    month: monthNum,
    day: dayNum,
    weekday: map.weekday,
    hour: hourNum,
    minute: minuteNum,
    second: secondNum,
    dateString: `${map.year}-${map.month}-${map.day}`,
    timeString24: `${String(hourNum).padStart(2, "0")}:${map.minute}`,
    tzAbbreviation: map.timeZoneName || timeZone,
    isoOffset
  };
}

/**
 * Converts a local wall-clock date and time in a named IANA timeZone
 * into an exact UTC epoch millisecond instant.
 */
function zonedWallClockToEpochMs(
  year,
  month,
  day,
  hour,
  minute,
  second,
  timeZone
) {
  const targetUtcLikeMs = Date.UTC(year, month - 1, day, hour, minute, second);

  let guessMs = targetUtcLikeMs;
  for (let i = 0; i < 2; i++) {
    const parts = getZonedParts(guessMs, timeZone);
    const zonedAsUtcMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const diffMs = zonedAsUtcMs - guessMs;
    guessMs = targetUtcLikeMs - diffMs;
  }

  return guessMs;
}

/**
 * Formats a 24-hour (hour, minute) pair into a friendly 12-hour string like "9:00 PM".
 */
function format12HourTime(hour, minute) {
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const paddedMinute = String(minute).padStart(2, "0");
  return `${hour12}:${paddedMinute} ${period}`;
}

/**
 * Formats a YYYY-MM-DD calendar date into a readable label like "Wed, Oct 14, 2026"
 * without shifting across time zones.
 */
function formatCalendarDateReadable(dateString) {
  const dateParts = parseStrictDatePart(dateString);
  if (!dateParts) {
    return dateString;
  }
  const utcMidday = new Date(
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 12, 0, 0)
  );

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(utcMidday);
}

/**
 * Parses a release input (string or structured object) and classifies it.
 */
function parseReleaseInput(input) {
  if (input === null || input === undefined) {
    return {
      isValid: false,
      kind: "INVALID",
      error: "Release metadata is missing"
    };
  }

  let rawString = null;
  let explicitDate = null;
  let explicitTime = null;
  let timeZone = null;
  let releaseScope = "regional";

  if (typeof input === "string") {
    rawString = input.trim();
  } else if (typeof input === "object") {
    rawString = typeof input.raw === "string" ? input.raw.trim() : null;
    explicitDate = typeof input.date === "string" ? input.date.trim() : null;
    explicitTime = typeof input.time === "string" ? input.time.trim() : null;
    timeZone =
      typeof input.timeZone === "string" ? input.timeZone.trim() : null;
    if (input.releaseScope === "global" || input.releaseScope === "regional") {
      releaseScope = input.releaseScope;
    }
  } else {
    return {
      isValid: false,
      kind: "INVALID",
      error: "Unsupported release input type"
    };
  }

  if (explicitDate && !rawString) {
    rawString = explicitTime
      ? `${explicitDate}T${explicitTime}`
      : explicitDate;
  }

  if (!rawString) {
    return {
      isValid: false,
      kind: "INVALID",
      error: "Empty release string"
    };
  }

  // 1. Check DATE_ONLY ("YYYY-MM-DD")
  if (rawString.length === 10) {
    const dateParts = parseStrictDatePart(rawString);
    if (!dateParts) {
      return {
        isValid: false,
        kind: "INVALID",
        raw: rawString,
        error: `Invalid calendar date: ${rawString}`
      };
    }

    return {
      isValid: true,
      kind: "DATE_ONLY",
      raw: rawString,
      releaseScope,
      originalDate: dateParts.dateString,
      originalTime: null,
      originalOffset: null,
      timeZone: timeZone && isValidTimeZone(timeZone) ? timeZone : null,
      epochMs: null,
      utcIso: null
    };
  }

  // All timestamped formats must begin with "YYYY-MM-DD" followed by "T" or " "
  const datePortion = rawString.slice(0, 10);
  const separator = rawString[10];
  const dateParts = parseStrictDatePart(datePortion);

  if (!dateParts || (separator !== "T" && separator !== " ")) {
    return {
      isValid: false,
      kind: "INVALID",
      raw: rawString,
      error: `Unrecognized date prefix in: ${rawString}`
    };
  }

  const remainder = rawString.slice(11);

  // 2. Check UTC_TIMESTAMP (ends with 'Z' or 'z')
  if (remainder.endsWith("Z") || remainder.endsWith("z")) {
    const timePortion = remainder.slice(0, -1);
    const timeParts = parseStrictTimePart(timePortion);
    if (!timeParts) {
      return {
        isValid: false,
        kind: "INVALID",
        raw: rawString,
        error: `Invalid UTC time in: ${rawString}`
      };
    }

    const epochMs = Date.UTC(
      dateParts.year,
      dateParts.month - 1,
      dateParts.day,
      timeParts.hour,
      timeParts.minute,
      timeParts.second,
      timeParts.ms
    );

    if (timeZone) {
      if (!isValidTimeZone(timeZone)) {
        return {
          isValid: false,
          kind: "INVALID",
          raw: rawString,
          error: `Invalid IANA time zone: ${timeZone}`
        };
      }
      const zonedParts = getZonedParts(epochMs, timeZone);
      return {
        isValid: true,
        kind: "ZONED_RELEASE",
        raw: rawString,
        releaseScope,
        originalDate: zonedParts.dateString,
        originalTime: zonedParts.timeString24,
        originalOffset: zonedParts.isoOffset,
        tzAbbreviation: zonedParts.tzAbbreviation,
        timeZone,
        epochMs,
        utcIso: new Date(epochMs).toISOString()
      };
    }

    return {
      isValid: true,
      kind: "UTC_TIMESTAMP",
      raw: rawString,
      releaseScope,
      originalDate: dateParts.dateString,
      originalTime: timeParts.hhmm,
      originalOffset: "+00:00",
      tzAbbreviation: "UTC",
      timeZone: "UTC",
      epochMs,
      utcIso: new Date(epochMs).toISOString()
    };
  }

  // 3. Check OFFSET_TIMESTAMP (ends with +HH:MM or -HH:MM)
  const plusIndex = remainder.lastIndexOf("+");
  const minusIndex = remainder.lastIndexOf("-");
  const offsetSignIndex = Math.max(plusIndex, minusIndex);

  if (offsetSignIndex > 0) {
    const timePortion = remainder.slice(0, offsetSignIndex);
    const offsetStr = remainder.slice(offsetSignIndex);

    if (
      offsetStr.length !== 6 ||
      offsetStr[3] !== ":" ||
      !isDigitsOnly(offsetStr.slice(1, 3)) ||
      !isDigitsOnly(offsetStr.slice(4, 6))
    ) {
      return {
        isValid: false,
        kind: "INVALID",
        raw: rawString,
        error: `Malformed UTC offset in: ${rawString}`
      };
    }

    const offsetHours = Number(offsetStr.slice(1, 3));
    const offsetMinutes = Number(offsetStr.slice(4, 6));
    const timeParts = parseStrictTimePart(timePortion);

    if (!timeParts || offsetHours > 14 || offsetMinutes > 59) {
      return {
        isValid: false,
        kind: "INVALID",
        raw: rawString,
        error: `Invalid time or offset components in: ${rawString}`
      };
    }

    const epochMs = Date.parse(rawString);

    if (timeZone && isValidTimeZone(timeZone)) {
      const zonedParts = getZonedParts(epochMs, timeZone);
      return {
        isValid: true,
        kind: "ZONED_RELEASE",
        raw: rawString,
        releaseScope,
        originalDate: dateParts.dateString,
        originalTime: timeParts.hhmm,
        originalOffset: offsetStr,
        tzAbbreviation: zonedParts.tzAbbreviation,
        timeZone,
        epochMs,
        utcIso: new Date(epochMs).toISOString()
      };
    }

    return {
      isValid: true,
      kind: "OFFSET_TIMESTAMP",
      raw: rawString,
      releaseScope,
      originalDate: dateParts.dateString,
      originalTime: timeParts.hhmm,
      originalOffset: offsetStr,
      tzAbbreviation: `UTC${offsetStr}`,
      timeZone: null,
      epochMs,
      utcIso: new Date(epochMs).toISOString()
    };
  }

  // 4. Local wall-clock datetime with a named IANA timeZone
  const timeParts = parseStrictTimePart(remainder);
  if (timeParts && timeZone) {
    if (!isValidTimeZone(timeZone)) {
      return {
        isValid: false,
        kind: "INVALID",
        raw: rawString,
        error: `Invalid IANA time zone: ${timeZone}`
      };
    }

    const epochMs = zonedWallClockToEpochMs(
      dateParts.year,
      dateParts.month,
      dateParts.day,
      timeParts.hour,
      timeParts.minute,
      timeParts.second,
      timeZone
    );
    const zonedParts = getZonedParts(epochMs, timeZone);

    return {
      isValid: true,
      kind: "ZONED_RELEASE",
      raw: rawString,
      releaseScope,
      originalDate: dateParts.dateString,
      originalTime: timeParts.hhmm,
      originalOffset: zonedParts.isoOffset,
      tzAbbreviation: zonedParts.tzAbbreviation,
      timeZone,
      epochMs,
      utcIso: new Date(epochMs).toISOString()
    };
  }

  return {
    isValid: false,
    kind: "INVALID",
    raw: rawString,
    error: `Unrecognized or malformed release format: ${rawString}`
  };
}

/**
 * Formats a parsed release object according to the chosen display mode
 * ("original", "dual", or "utc") and computes the safe `nuvioReleasedValue`
 * for NuvioTV's VideoDto.released field.
 */
function formatReleaseForDisplay(parsedResult, options = {}) {
  const displayMode = options.displayMode || DEFAULT_DISPLAY_MODE;
  const viewerTimeZone = isValidTimeZone(options.viewerTimeZone)
    ? options.viewerTimeZone
    : DEFAULT_VIEWER_TIME_ZONE;

  if (!parsedResult || !parsedResult.isValid) {
    return {
      isValid: false,
      displayMode,
      nuvioReleasedValue: null,
      badgeText: "Release date unknown",
      descriptionPrefix: "[Release Schedule: Unknown or TBA]"
    };
  }

  // 1. Handle DATE_ONLY without fabricating any time of day
  if (parsedResult.kind === "DATE_ONLY") {
    const readableDate = formatCalendarDateReadable(parsedResult.originalDate);
    return {
      isValid: true,
      kind: "DATE_ONLY",
      displayMode,
      nuvioReleasedValue: parsedResult.originalDate,
      originalCalendarDate: parsedResult.originalDate,
      viewerCalendarDate: parsedResult.originalDate,
      dayShiftInViewerZone: 0,
      badgeText: `${readableDate} (Date-Only)`,
      descriptionPrefix: `[Original Release Date: ${readableDate} (Date-Only — No exact airtime specified)]`
    };
  }

  // 2. Timestamped releases (ZONED_RELEASE, OFFSET_TIMESTAMP, UTC_TIMESTAMP)
  const [origHour, origMinute] = parsedResult.originalTime
    .split(":")
    .map(Number);
  const origReadableDate = formatCalendarDateReadable(parsedResult.originalDate);
  const origReadableTime = format12HourTime(origHour, origMinute);

  const tzLabel = parsedResult.timeZone
    ? `${parsedResult.tzAbbreviation} (${parsedResult.timeZone})`
    : parsedResult.tzAbbreviation || `UTC${parsedResult.originalOffset}`;

  const viewerParts = getZonedParts(parsedResult.epochMs, viewerTimeZone);
  const viewerReadableDate = formatCalendarDateReadable(viewerParts.dateString);
  const viewerReadableTime = format12HourTime(
    viewerParts.hour,
    viewerParts.minute
  );

  const utcParts = getZonedParts(parsedResult.epochMs, "UTC");
  const utcReadableDate = formatCalendarDateReadable(utcParts.dateString);
  const utcReadableTime = format12HourTime(utcParts.hour, utcParts.minute);

  const origMidnightMs = Date.parse(`${parsedResult.originalDate}T00:00:00Z`);
  const viewerMidnightMs = Date.parse(`${viewerParts.dateString}T00:00:00Z`);
  const dayShiftInViewerZone = Math.round(
    (viewerMidnightMs - origMidnightMs) / 86_400_000
  );

  const scopeLabel =
    parsedResult.releaseScope === "global"
      ? "Global Simultaneous Release"
      : "Original Regional Release";

  let badgeText;
  let descriptionPrefix;
  let nuvioReleasedValue;

  if (displayMode === "utc") {
    badgeText = `${utcReadableDate} at ${utcReadableTime} UTC`;
    descriptionPrefix = `[${scopeLabel} (UTC): ${utcReadableDate} at ${utcReadableTime} UTC]`;
    nuvioReleasedValue = parsedResult.utcIso;
  } else if (displayMode === "dual") {
    const dayShiftNote =
      dayShiftInViewerZone > 0
        ? ` (+${dayShiftInViewerZone} day in ${viewerTimeZone})`
        : dayShiftInViewerZone < 0
          ? ` (${dayShiftInViewerZone} day in ${viewerTimeZone})`
          : "";
    badgeText = `${origReadableDate} at ${origReadableTime} ${parsedResult.tzAbbreviation} | Local: ${viewerReadableDate} at ${viewerReadableTime} (${viewerTimeZone})`;
    descriptionPrefix = `[${scopeLabel}: ${origReadableDate} at ${origReadableTime} ${tzLabel} | Local (${viewerTimeZone}): ${viewerReadableDate} at ${viewerReadableTime} UTC${viewerParts.isoOffset}${dayShiftNote}]`;
    nuvioReleasedValue = parsedResult.originalDate;
  } else {
    badgeText = `${origReadableDate} at ${origReadableTime} ${tzLabel}`;
    descriptionPrefix = `[${scopeLabel}: ${origReadableDate} at ${origReadableTime} ${tzLabel}]`;
    nuvioReleasedValue = parsedResult.originalDate;
  }

  return {
    isValid: true,
    kind: parsedResult.kind,
    releaseScope: parsedResult.releaseScope,
    displayMode,
    epochMs: parsedResult.epochMs,
    utcIso: parsedResult.utcIso,
    nuvioReleasedValue,
    originalCalendarDate: parsedResult.originalDate,
    originalTime12: origReadableTime,
    viewerCalendarDate: viewerParts.dateString,
    viewerTime12: viewerReadableTime,
    dayShiftInViewerZone,
    badgeText,
    descriptionPrefix
  };
}

module.exports = {
  parseReleaseInput,
  formatReleaseForDisplay,
  isValidCalendarDate,
  isValidTimeZone,
  formatCalendarDateReadable,
  format12HourTime
};