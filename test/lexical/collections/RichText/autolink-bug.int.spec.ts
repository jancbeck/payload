import type { Page } from '@playwright/test'

import { expect, test } from '@playwright/test'
import path from 'path'
import { wait } from 'payload/shared'
import { fileURLToPath } from 'url'

import {
  ensureCompilationIsDone,
  initPageConsoleErrorCatch,
  saveDocAndAssert,
} from '../../../helpers.js'
import { AdminUrlUtil } from '../../../helpers/adminUrlUtil.js'
import { initPayloadE2ENoConfig } from '../../../helpers/initPayloadE2ENoConfig.js'
import { reInitializeDB } from '../../../helpers/reInitializeDB.js'
import { POLL_TOPASS_TIMEOUT, TEST_TIMEOUT_LONG } from '../../../playwright.config.js'

const filename = fileURLToPath(import.meta.url)
const currentFolder = path.dirname(filename)
const dirname = path.resolve(currentFolder, '../../')

const { beforeAll, beforeEach, describe } = test

let page: Page
let serverURL: string

describe('Autolink Bug with Custom Fields', () => {
  beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(TEST_TIMEOUT_LONG)
    process.env.SEED_IN_CONFIG_ONINIT = 'false'
    ;({ serverURL } = await initPayloadE2ENoConfig({
      dirname,
    }))

    const context = await browser.newContext()
    page = await context.newPage()
    initPageConsoleErrorCatch(page)

    await ensureCompilationIsDone({ page, serverURL })
  })

  beforeEach(async () => {
    await reInitializeDB({
      serverURL,
      snapshotKey: 'lexicalTest',
      uploadsDir: [path.resolve(dirname, './collections/Upload/uploads')],
    })

    await ensureCompilationIsDone({ page, serverURL })
  })

  test('should create and save autolink with custom link fields', async () => {
    const url: AdminUrlUtil = new AdminUrlUtil(serverURL, 'rich-text-fields')

    // Navigate to create new document
    await page.goto(url.create)
    await wait(1000)

    // Fill in the title
    await page.locator('#field-title').fill('Autolink Test Document')
    await wait(500)

    // Click into the lexicalCustomFields editor (which has custom link fields)
    const lexicalEditor = page
      .locator('#field-lexicalCustomFields')
      .locator('.ContentEditable__root')
      .first()
    await lexicalEditor.click()
    await wait(500)

    // Type text with an email address (which should trigger autolink)
    await page.keyboard.type('Contact me at test@example.com')
    await wait(1500) // Wait for autolink to be created

    // Try to save the document
    await saveDocAndAssert(page)
  })
})
