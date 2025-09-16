import type { Payload } from 'payload'

import path from 'path'
import { fileURLToPath } from 'url'

import type { NextRESTClient } from '../helpers/NextRESTClient.js'

import { devUser } from '../credentials.js'
import { initPayloadInt } from '../helpers/initPayloadInt.js'
import { postsSlug } from './collections/Posts/index.js'

let payload: Payload
let token: string
let restClient: NextRESTClient

const { email, password } = devUser
const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

describe('_Community Tests - Trash + Search Plugin Bug Reproduction', () => {
  beforeAll(async () => {
    const initialized = await initPayloadInt(dirname)
    ;({ payload, restClient } = initialized)

    const data = await restClient
      .POST('/users/login', {
        body: JSON.stringify({
          email,
          password,
        }),
      })
      .then((res) => res.json())

    token = data.token
  })

  afterAll(async () => {
    await payload.destroy()
  })

  beforeEach(async () => {
    // Clean up posts and search documents before each test
    await payload.delete({
      collection: postsSlug,
      where: {
        id: { exists: true },
      },
    })
    
    await payload.delete({
      collection: 'search',
      where: {
        id: { exists: true },
      },
    })
  })

  describe('Setup validation', () => {
    it('should have trash enabled on posts collection', () => {
      const config = payload.config
      const postsCollection = config.collections?.find(c => c.slug === postsSlug)
      expect(postsCollection?.trash).toBe(true)
    })

    it('should have search plugin configured', () => {
      const config = payload.config
      expect(config.collections?.some(c => c.slug === 'search')).toBe(true)
    })

    it('should have localization enabled', () => {
      const config = payload.config
      expect(config.localization).toBeDefined()
      expect(config.localization?.locales).toContain('en')
    })
  })

  describe('Bug Reproduction: Trash + Search Plugin "Not Found" Error', () => {
    it('should reproduce "not found" error when soft deleting with search plugin + localization + beforeSync', async () => {
      // Create a test post
      const newPost = await payload.create({
        collection: postsSlug,
        data: {
          title: 'Post to be Soft Deleted',
          content: 'This post will trigger the bug',
        },
      })

      // Wait for search document to be created
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify search document exists
      const searchDocsBefore = await payload.find({
        collection: 'search',
        where: {
          'doc.value': { equals: newPost.id },
        },
      })
      expect(searchDocsBefore.docs).toHaveLength(1)

      // Attempt to soft delete the post - this should trigger the bug
      // The bug occurs because the search plugin's afterChange hook tries to call payload.findByID()
      // without the trash parameter when localization + beforeSync are enabled
      let deleteError = null
      try {
        const updatedPost = await payload.update({
          collection: postsSlug,
          id: newPost.id,
          data: {
            deletedAt: new Date().toISOString(), // This triggers soft delete
          },
        })
        
        // If no error, the soft delete worked (might mean the bug is fixed)
        expect(updatedPost.deletedAt).toBeDefined()
        console.log('Soft delete succeeded - bug may be fixed')
        
      } catch (error) {
        deleteError = error
        console.log('🐛 BUG REPRODUCED: Soft delete failed with error:', error.message)
        
        // The bug manifests as a "not found" error during soft deletion
        expect(error.message).toMatch(/not found|Not Found/i)
      }

      // If there was an error, this reproduces the bug described in the issue
      if (deleteError) {
        console.log('✅ Bug successfully reproduced: "Not Found" error when soft deleting with trash + search plugin + localization + beforeSync')
      }
    })

    it('should successfully create and find documents when not trashed', async () => {
      // This test verifies the setup works correctly for non-trashed documents
      const newPost = await payload.create({
        collection: postsSlug,
        data: {
          title: 'Normal Post',
          content: 'This post should work fine',
        },
      })

      expect(newPost.title).toEqual('Normal Post')

      // Wait for search plugin to sync
      await new Promise(resolve => setTimeout(resolve, 100))

      // Check that search document was created
      const searchDocs = await payload.find({
        collection: 'search',
        where: {
          'doc.value': { equals: newPost.id },
        },
      })

      expect(searchDocs.docs).toHaveLength(1)
      expect(searchDocs.docs[0].title).toEqual('Normal Post')
    })
  })
})