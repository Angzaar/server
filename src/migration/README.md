# Profile Migration Tool

This tool helps migrate user profiles from the legacy format to the new attempts-based format for quest progress tracking.

## Background

The quest system has evolved to use an "attempts" array to track user progress, but many profiles still use the legacy format without this array. This causes issues with:

1. Progress tracking and display
2. Inconsistent data formats leading to UI errors
3. Compatibility issues with newer quest features

## Migration Process

The migration script will:

1. Load all profiles from `profiles.json`
2. Identify quest progress entries that don't have an `attempts` array
3. Convert each legacy entry to include an `attempts` array with the existing data
4. Create a backup of the original data before saving
5. Save the updated profiles file

## Usage

Run the migration with:

```
npm run migrate:profiles
```

To do a dry run without saving changes:

```
npm run migrate:profiles:dry
```

## Migration Stats

After running, the migration will report:
- Total profiles processed
- Profiles with no quests
- Already migrated quest entries
- Newly migrated quest entries
- Any errors encountered

## Verification

After migration, check the logs to ensure:
1. No errors were reported
2. The correct number of entries were migrated
3. The server can start successfully
4. User progress is now displayed correctly in the UI

## Manual Fixes

If any errors occur during migration, you may need to manually fix specific user profiles. Check the logs for details about which users/quests had issues.

## Rollback

If you need to roll back the migration, a backup file is created at `profiles.json.backup-[timestamp]` before any changes are saved. You can restore this file by renaming it to `profiles.json`. 