import type { Page } from '@playwright/test'

import { expect, test } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'

import type { PayloadTestSDK } from '../helpers/sdk/index.js'
import type { Config, Post } from './payload-types.js'

import { ensureCompilationIsDone, initPageConsoleErrorCatch } from '../helpers.js'
import { AdminUrlUtil } from '../helpers/adminUrlUtil.js'
import { initPayloadE2ENoConfig } from '../helpers/initPayloadE2ENoConfig.js'
import { TEST_TIMEOUT_LONG } from '../playwright.config.js'
import { postsSlug } from './collections/Posts/index.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

test.describe('Community - Trash + Search Plugin Bug Reproduction', () => {
  let page: Page
  let url: AdminUrlUtil
  let payload: PayloadTestSDK<Config>
  let serverURL: string

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(TEST_TIMEOUT_LONG)

    ;({ payload, serverURL } = await initPayloadE2ENoConfig<Config>({ dirname }))
    url = new AdminUrlUtil(serverURL, postsSlug)

    const context = await browser.newContext()
    page = await context.newPage()
    initPageConsoleErrorCatch(page)
    await ensureCompilationIsDone({ page, serverURL })
  })

  test('should show both search collection and trash tab exist', async () => {
    await page.goto(url.list)

    // Check that the posts collection exists
    const textCell = page.locator('.row-1 .cell-title')
    await expect(textCell).toHaveText('example post')

    // Check that trash tab is visible (indicating trash is enabled)
    await expect(page.locator('#trash-view-pill')).toBeVisible()

    // Check that search collection was created by plugin
    await page.goto(`${serverURL}/admin/collections/search`)
    await expect(page.locator('.collection-list')).toBeVisible()
  })

  test('should reproduce "not found" error when soft deleting with search plugin enabled', async () => {
    // Create a test post specifically for this test
    const testPost = await payload.create({
      collection: postsSlug,
      data: {
        title: 'Test Post for Deletion',
        content: 'This is a test post content',
      },
    }) as Post

    // Navigate to posts list
    await page.goto(url.list)

    // Wait for the test post to appear in the list
    await expect(page.locator('.cell-title', { hasText: 'Test Post for Deletion' })).toBeVisible()

    // Find and select the test post row
    const postRow = page.locator('.table-row').filter({ hasText: 'Test Post for Deletion' })
    await expect(postRow).toBeVisible()
    
    // Select the checkbox for the test post
    await postRow.locator('.cell-_select input').check()

    // Click the delete button
    await page.locator('.list-selection__button[aria-label="Delete"]').click()

    // Verify the delete modal appears
    await expect(page.locator('#confirm-delete-many-docs')).toBeVisible()

    // Do NOT check the "delete permanently" checkbox - this should trigger soft delete
    // await page.locator('#delete-forever').check() // commenting this out for soft delete
    
    // Click confirm to soft delete
    await page.locator('#confirm-delete-many-docs #confirm-action').click()

    // This should succeed with a success message, but the bug might cause a "not found" error
    // We'll capture what actually happens
    const toastElement = page.locator('.payload-toast-container .toast-success')
    const errorToastElement = page.locator('.payload-toast-container .toast-error')
    
    // Wait for either success or error toast
    try {
      await expect(toastElement).toHaveText('1 Post moved to trash.', { timeout: 10000 })
      console.log('SUCCESS: Soft delete worked correctly')
    } catch (error) {
      // Check if we got an error toast instead
      const hasErrorToast = await errorToastElement.count() > 0
      if (hasErrorToast) {
        const errorText = await errorToastElement.textContent()
        console.log('ERROR: Soft delete failed with error:', errorText)
        // This reproduces the bug - we expect this to fail with "not found" error
        expect(errorText).toContain('not found')
      } else {
        throw error // Re-throw if it's some other kind of failure
      }
    }

    // Clean up: permanently delete the test post if it exists
    try {
      await payload.delete({
        collection: postsSlug,
        id: testPost.id,
        trash: true, // This forces permanent deletion
      })
    } catch (cleanupError) {
      console.log('Cleanup error (expected if post was already deleted):', cleanupError)
    }
  })
})
