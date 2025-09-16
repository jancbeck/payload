# Trash + Search Plugin Bug Reproduction

## Issue Description
When both the trash feature and search plugin are enabled on the same collection, soft deleting an item in the admin UI shows a "not found" error and the soft deletion fails.

## Root Cause
The issue occurs in `/packages/plugin-search/src/utilities/syncDocAsSearchIndex.ts`:

1. When a document is soft-deleted (trash enabled), Payload sets a `deletedAt` timestamp via an update operation
2. This triggers the search plugin's `afterChange` hook with `syncWithSearch`
3. In `syncDocAsSearchIndex`, when localization is enabled, the plugin tries to fetch the document using `payload.findByID()` to get the localized version
4. **Problem**: `payload.findByID()` by default excludes trashed documents (documents with `deletedAt` set)
5. This causes a "not found" error because the document now has `deletedAt` but the search plugin isn't looking for trashed documents

## Fix Applied
Modified `/packages/plugin-search/src/utilities/syncDocAsSearchIndex.ts` to:

1. **Line 47-56**: Check if the document being synced is trashed (has `deletedAt` field)
2. **Line 51**: Pass `trash: true` to `payload.findByID()` when the document is trashed
3. **Line 178**: Also pass `trash: true` to `payload.find()` when checking for published versions

## Test Setup
The test setup in `test/_community/` includes:
- Posts collection with `trash: true` enabled
- Search plugin configured for the posts collection
- Integration tests that reproduce the bug
- E2E tests that verify the fix works in the admin UI

## Expected Behavior After Fix
- Soft deleting documents with both trash and search plugin enabled should work correctly
- Search documents should be properly updated/removed when documents are trashed
- No "not found" errors should occur during soft deletion