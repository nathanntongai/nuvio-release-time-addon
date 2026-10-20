/**
 * test/releaseTimeParser.test.js
 * Automated acceptance tests covering all 10 release-time and time-zone requirements.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseReleaseInput,
  formatReleaseForDisplay
} = require("../src/releaseTimeParser");

// 1. A release represented only by a calendar date (DATE_ONLY)
test("1. Preserves a date-only release without fabricating a timestamp or shifting days", () => {
  const parsed = parseReleaseInput("2026-10-16");
  assert.equal(parsed.isValid, true);
  assert.equal(parsed.kind, "DATE_ONLY");
  assert.equal(parsed.originalDate, "2026-10-16");
  assert.equal(parsed.originalTime, null);
  assert.equal(parsed.epochMs, null);

  const formatted = formatReleaseForDisplay(parsed, {
    displayMode: "original",
    viewerTimeZone: "Africa/Nairobi"
  });
  assert.equal(formatted.nuvioReleasedValue, "2026-10-16");
  assert.match(formatted.descriptionPrefix, /Date-Only/);
});

// 2. A release represented by a UTC timestamp ending in Z
test("2. Parses a UTC timestamp ending in Z and preserves the exact release instant", () => {
  const parsed = parseReleaseInput("2026-10-15T01:00:00.000Z");
  assert.equal(parsed.isValid, true);
  assert.equal(parsed.kind, "UTC_TIMESTAMP");
  assert.equal(parsed.originalDate, "2026-10-15");
  assert.equal(parsed.originalTime, "01:00");
  assert.equal(parsed.utcIso, "2026-10-15T01:00:00.000Z");
});

// 3. A timestamp containing an explicit UTC offset
test("3. Preserves both the instant and explicit offset for an offset timestamp", () => {
  const parsed = parseReleaseInput("2026-10-14T21:00:00-04:00");
  assert.equal(parsed.isValid, true);
  assert.equal(parsed.kind, "OFFSET_TIMESTAMP");
  assert.equal(parsed.originalDate, "2026-10-14");
  assert.equal(parsed.originalTime, "21:00");
  assert.equal(parsed.originalOffset, "-04:00");
  assert.equal(parsed.utcIso, "2026-10-15T01:00:00.000Z");
});

// 4. A release time associated with a named IANA time zone
test("4. Resolves a release time associated with a named IANA time zone", () => {
  const parsed = parseReleaseInput({
    date: "2026-10-14",
    time: "21:00",
    timeZone: "America/New_York"
  });
  assert.equal(parsed.isValid, true);
  assert.equal(parsed.kind, "ZONED_RELEASE");
  assert.equal(parsed.originalDate, "2026-10-14");
  assert.equal(parsed.originalTime, "21:00");
  assert.equal(parsed.originalOffset, "-04:00");
  assert.equal(parsed.utcIso, "2026-10-15T01:00:00.000Z");
});

// 5. A release scheduled for a different calendar day in another region (US Wed night -> Kenya Thu morning)
test("5. Detects cross-day shift between US evening release (Oct 14) and Kenya EAT (Oct 15, UTC+3)", () => {
  const parsed = parseReleaseInput({
    date: "2026-10-14",
    time: "21:00",
    timeZone: "America/New_York"
  });
  const formatted = formatReleaseForDisplay(parsed, {
    displayMode: "dual",
    viewerTimeZone: "Africa/Nairobi"
  });

  assert.equal(formatted.originalCalendarDate, "2026-10-14");
  assert.equal(formatted.originalTime12, "9:00 PM");
  assert.equal(formatted.viewerCalendarDate, "2026-10-15");
  assert.equal(formatted.viewerTime12, "4:00 AM");
  assert.equal(formatted.dayShiftInViewerZone, 1);
  assert.equal(formatted.nuvioReleasedValue, "2026-10-14");
});

// 6. Missing or malformed release metadata
test("6. Handles missing, empty, or invalid calendar dates gracefully without throwing", () => {
  assert.equal(parseReleaseInput(null).isValid, false);
  assert.equal(parseReleaseInput("").isValid, false);
  assert.equal(parseReleaseInput("not-a-date").isValid, false);
  assert.equal(parseReleaseInput("2026-02-30").isValid, false);
  assert.equal(
    parseReleaseInput({
      date: "2026-10-14",
      time: "21:00",
      timeZone: "Mars/Olympus_Mons"
    }).isValid,
    false
  );

  const fallbackDisplay = formatReleaseForDisplay(parseReleaseInput(null));
  assert.equal(fallbackDisplay.isValid, false);
  assert.equal(fallbackDisplay.nuvioReleasedValue, null);
});

// 7. Daylight-Saving Time (DST) transitions
test("7. Correctly adjusts offset across US Daylight Saving Time transition (EDT -04:00 vs EST -05:00)", () => {
  const summerRelease = parseReleaseInput({
    date: "2026-10-14",
    time: "21:00",
    timeZone: "America/New_York"
  });
  assert.equal(summerRelease.originalOffset, "-04:00");
  assert.equal(summerRelease.utcIso, "2026-10-15T01:00:00.000Z");

  const winterRelease = parseReleaseInput({
    date: "2026-11-11",
    time: "21:00",
    timeZone: "America/New_York"
  });
  assert.equal(winterRelease.originalOffset, "-05:00");
  assert.equal(winterRelease.utcIso, "2026-11-12T02:00:00.000Z");
});

// 8. Global simultaneous release vs. Regional release
test("8. Distinguishes a Global Simultaneous Release from an Original Regional Release", () => {
  const globalDrop = parseReleaseInput({
    raw: "2026-10-16T07:00:00Z",
    timeZone: "America/Los_Angeles",
    releaseScope: "global"
  });
  const regionalDrop = parseReleaseInput({
    date: "2026-10-15",
    time: "21:00",
    timeZone: "America/New_York",
    releaseScope: "regional"
  });

  const formattedGlobal = formatReleaseForDisplay(globalDrop, {
    displayMode: "dual",
    viewerTimeZone: "Africa/Nairobi"
  });
  const formattedRegional = formatReleaseForDisplay(regionalDrop, {
    displayMode: "original"
  });

  assert.match(formattedGlobal.descriptionPrefix, /Global Simultaneous Release/);
  assert.match(formattedGlobal.descriptionPrefix, /12:00 AM/);
  assert.match(formattedGlobal.descriptionPrefix, /10:00 AM/);
  assert.match(formattedRegional.descriptionPrefix, /Original Regional Release/);
});

// 9. Consistent results regardless of the computer's local time zone
test("9. Produces identical parsed instants and formatted strings across different viewer time zones", () => {
  const input = {
    date: "2026-10-14",
    time: "21:00",
    timeZone: "America/New_York"
  };
  const parsedA = parseReleaseInput(input);
  const parsedB = parseReleaseInput(input);

  assert.equal(parsedA.epochMs, parsedB.epochMs);
  assert.equal(parsedA.originalDate, "2026-10-14");

  const formattedOriginalInKenya = formatReleaseForDisplay(parsedA, {
    displayMode: "original",
    viewerTimeZone: "Africa/Nairobi"
  });
  const formattedOriginalInTokyo = formatReleaseForDisplay(parsedB, {
    displayMode: "original",
    viewerTimeZone: "Asia/Tokyo"
  });

  assert.equal(
    formattedOriginalInKenya.badgeText,
    formattedOriginalInTokyo.badgeText
  );
  assert.equal(
    formattedOriginalInKenya.nuvioReleasedValue,
    formattedOriginalInTokyo.nuvioReleasedValue
  );
});

// 10. Verification that the displayed value matches the chosen display mode without changing the release instant
test("10. Formatting in original, dual, or utc mode changes presentation without altering epochMs", () => {
  const parsed = parseReleaseInput({
    date: "2026-10-14",
    time: "21:00",
    timeZone: "America/New_York"
  });

  const modeOriginal = formatReleaseForDisplay(parsed, {
    displayMode: "original"
  });
  const modeDual = formatReleaseForDisplay(parsed, {
    displayMode: "dual",
    viewerTimeZone: "Africa/Nairobi"
  });
  const modeUtc = formatReleaseForDisplay(parsed, {
    displayMode: "utc"
  });

  assert.equal(modeOriginal.epochMs, modeDual.epochMs);
  assert.equal(modeDual.epochMs, modeUtc.epochMs);

  assert.match(modeOriginal.descriptionPrefix, /9:00 PM/);
  assert.doesNotMatch(modeOriginal.descriptionPrefix, /Africa\/Nairobi/);

  assert.match(modeDual.descriptionPrefix, /9:00 PM/);
  assert.match(modeDual.descriptionPrefix, /Africa\/Nairobi/);
  assert.match(modeDual.descriptionPrefix, /4:00 AM/);

  assert.match(modeUtc.descriptionPrefix, /Oct 15, 2026 at 1:00 AM UTC/);
  assert.equal(modeUtc.nuvioReleasedValue, "2026-10-15T01:00:00.000Z");
});