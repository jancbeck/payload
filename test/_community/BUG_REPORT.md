**Describe the Bug**

When both the trash feature and search plugin are enabled on the same collection with localization and a `beforeSync` callback configured, soft deleting documents in the admin UI fails with a "Not Found" error. The deletion operation does not complete successfully, leaving documents in an inconsistent state.

**Link to the code that reproduces this issue**

https://github.com/jancbeck/payload/tree/copilot/fix-67dc1d1a-a4b8-4ec2-8149-3b14fdec1de1/test/_community

**Reproduction Steps**

1. Create a collection with `trash: true` enabled
2. Configure the search plugin on the same collection with a `beforeSync` callback
3. Enable localization in the Payload config (e.g., `locales: ['en', 'es']`)
4. Create a document in the collection
5. Attempt to soft delete the document through the admin UI or via API with `deletedAt` timestamp
6. Observe the "Not Found" error during the deletion process

The bug occurs because:
- The search plugin's `afterChange` hook is triggered during soft deletion
- When localization is enabled, the plugin calls `payload.findByID()` to fetch the localized document
- The `payload.findByID()` call does not include the `trash: true` parameter
- This causes the call to fail for documents that have been soft-deleted (have a `deletedAt` timestamp)

**Which area(s) are affected?**
- plugin: search

**Environment Info**

Payload Version: 3.55.1
Node.js Version: 20.19.5
Next.js Version: 15.4.4
MongoDB Memory Server: 10.1.4

**Additional Context**

The issue specifically occurs in `packages/plugin-search/src/utilities/syncDocAsSearchIndex.ts` at lines 46-51 where `payload.findByID()` is called without considering that the document might be trashed. The bug manifests when all of these conditions are met:

1. Collection has trash feature enabled (`trash: true`)
2. Search plugin is configured with a `beforeSync` callback
3. Localization is enabled in the config
4. A document is being soft-deleted (setting `deletedAt` timestamp)

The search plugin needs to detect when documents are trashed and include the `trash: true` parameter in its `payload.findByID()` and `payload.find()` calls to handle soft-deleted documents correctly.