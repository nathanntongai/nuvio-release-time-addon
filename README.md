# Nuvio Release-Time Addon

A metadata (`meta` and `catalog`) addon for **NuvioTV** (`NuvioMedia/NuvioTV`) that accurately parses, preserves, and displays movie and TV episode release dates and times without unintended local time-zone conversions (such as shifting US/UK evening releases to the next calendar day in East Africa Time, `UTC+3`).

## Problem Solved

When standard metadata providers send an episode release timestamp in UTC (for example, `2026-10-15T01:00:00.000Z` for a show airing Wednesday, October 14 at 9:00 PM EDT in New York), NuvioTV's internal `EpisodeReleaseDateParser.kt` converts zoned timestamps into the viewer's device time zone (`ZoneId.systemDefault()`, e.g., `Africa/Nairobi`, `UTC+3`) and strips the time of day when rendering the episode card date badge (`EpisodesSection.kt`).

As a result:
1. The release date shifts from **October 14** to **October 15** for viewers in Kenya (`UTC+3`).
2. The original network airtime and time zone (`9:00 PM EDT`) are lost from the UI.

## How This Addon Works

1. **Distinguishes Release Formats:**
   - **Date-Only (`YYYY-MM-DD`):** Preserved strictly as a calendar date without inventing a timestamp or shifting across time zones.
   - **UTC Timestamps (`...Z`):** Preserves the exact UTC instant.
   - **Explicit Offset Timestamps (`...-04:00`):** Preserves both the instant and the explicit offset.
   - **Named IANA Time Zones (`America/New_York`, `Europe/London`, etc.):** Computes accurate Daylight Saving Time offsets (`EDT` vs `EST`) and preserves the original broadcaster schedule.
2. **Configurable Display Modes:**
   - `original`: Preserves the original broadcaster/distributor calendar date and prepends the exact original release time and time zone to the episode `overview` / `description`.
   - `dual`: Shows both the original network release time and East Africa Time (`EAT`, `UTC+3`).
   - `utc`: Displays release times in `UTC`.

## Architectural Boundaries in NuvioTV

- NuvioTV prioritizes `video.released` from addons (`useTmdbReleaseDates = false` in `MetaDetailsViewModel.kt`).
- NuvioTV's native episode date badge (`formatEpisodeCardDate` in `EpisodesSection.kt`) only renders a calendar date (`dMMMMy`). Therefore, this addon surfaces the exact release time and time zone at the start of the `overview` / `description` and `releaseInfo` fields.

## Getting Started

### Prerequisites
- Node.js `v20.0.0` or newer

### Running Tests
```bash
npm test