# Bug Reproduction Demonstration

## Current State: WITHOUT Fix (Original Bug Present)

The original code in `packages/plugin-search/src/utilities/syncDocAsSearchIndex.ts` at lines 46-51:

```typescript
docToSyncWith = await payload.findByID({
  id,
  collection,
  locale: syncLocale,
  req,
  // MISSING: trash parameter!
})
```

**Problem**: When a document is soft-deleted (has `deletedAt` timestamp), the search plugin's `afterChange` hook tries to sync the document but fails because `payload.findByID()` excludes trashed documents by default.

## Test Scenario

1. **Collection Configuration**: Posts collection with both `trash: true` and search plugin enabled
2. **Bug Trigger**: Soft delete a document (setting `deletedAt` timestamp)
3. **Expected Failure**: Search plugin's sync fails with "not found" error

## The Fix

Add detection for trashed documents and include `trash: true` parameter:

```typescript
// Check if document is trashed (has deletedAt field)
const isTrashDocument = doc && 'deletedAt' in doc && doc.deletedAt

docToSyncWith = await payload.findByID({
  id,
  collection,
  locale: syncLocale,
  req,
  // Include trashed documents when the document being synced is trashed
  trash: isTrashDocument,
})
```

## Test Results

- ❌ **WITHOUT Fix**: `payload.findByID()` fails with "not found" for trashed documents
- ✅ **WITH Fix**: `payload.findByID()` successfully finds trashed documents when `trash: true` is passed

This demonstrates the exact issue and its resolution.