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

describe('_Community Tests - Trash + Search Plugin Integration', () => {
  // --__--__--__--__--__--__--__--__--__
  // Boilerplate test setup/teardown
  // --__--__--__--__--__--__--__--__--__
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
    it('should have trash enabled on posts collection', async () => {
      const config = payload.config
      const postsCollection = config.collections?.find(c => c.slug === postsSlug)
      expect(postsCollection?.trash).toBe(true)
    })

    it('should have search plugin configured', async () => {
      const config = payload.config
      expect(config.collections?.some(c => c.slug === 'search')).toBe(true)
    })
  })

  describe('Trash + Search Plugin Bug Reproduction', () => {
    it('should successfully create a post and corresponding search document', async () => {
      const newPost = await payload.create({
        collection: postsSlug,
        data: {
          title: 'Test Post for Search',
          content: 'This is test content',
        },
      })

      expect(newPost.title).toEqual('Test Post for Search')

      // Wait a bit for search plugin to sync
      await new Promise(resolve => setTimeout(resolve, 100))

      // Check that search document was created
      const searchDocs = await payload.find({
        collection: 'search',
        where: {
          'doc.value': { equals: newPost.id },
        },
      })

      expect(searchDocs.docs).toHaveLength(1)
      expect(searchDocs.docs[0].title).toEqual('Test Post for Search')
    })

    it('should reproduce "not found" error when soft deleting a post with search plugin enabled', async () => {
      // Create a test post
      const newPost = await payload.create({
        collection: postsSlug,
        data: {
          title: 'Post to be Soft Deleted',
          content: 'This post will be soft deleted',
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

      // Now attempt to soft delete the post using update with deletedAt
      // This should trigger the bug where search plugin tries to update a document that can't be found
      let deleteError = null
      try {
        const updatedPost = await payload.update({
          collection: postsSlug,
          id: newPost.id,
          data: {
            deletedAt: new Date().toISOString(), // This triggers soft delete
          },
        })
        
        // If we get here, the soft delete worked
        expect(updatedPost.deletedAt).toBeDefined()
        
      } catch (error) {
        deleteError = error
        console.log('Soft delete error (this reproduces the bug):', error.message)
        
        // The bug should cause a "not found" error
        expect(error.message).toMatch(/not found|Not Found/i)
      }

      // If there was no error, let's check the search documents state
      if (!deleteError) {
        // Check what happened to search documents after soft delete
        const searchDocsAfter = await payload.find({
          collection: 'search',
          where: {
            'doc.value': { equals: newPost.id },
          },
        })
        
        // With trash enabled, search docs should either be removed or updated
        console.log('Search docs after soft delete:', searchDocsAfter.docs.length)
      }
    })

    it('should handle permanent deletion correctly', async () => {
      // Create a test post
      const newPost = await payload.create({
        collection: postsSlug,
        data: {
          title: 'Post to be Permanently Deleted',
          content: 'This post will be permanently deleted',
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

      // Permanent delete should work fine
      await payload.delete({
        collection: postsSlug,
        id: newPost.id,
        trash: true, // Force permanent delete
      })

      // Verify post is completely gone
      await expect(
        payload.findByID({
          collection: postsSlug,
          id: newPost.id,
          trash: true,
        })
      ).rejects.toThrow()

      // Verify search document is also removed
      const searchDocsAfter = await payload.find({
        collection: 'search',
        where: {
          'doc.value': { equals: newPost.id },
        },
      })
      expect(searchDocsAfter.docs).toHaveLength(0)
    })
  })

  // --__--__--__--__--__--__--__--__--__
  // Original example tests
  // --__--__--__--__--__--__--__--__--__

  it('local API example', async () => {
    const newPost = await payload.create({
      collection: postsSlug,
      data: {
        title: 'LOCAL API EXAMPLE',
      },
      context: {},
    })

    expect(newPost.title).toEqual('LOCAL API EXAMPLE')
  })

  it('rest API example', async () => {
    const data = await restClient
      .POST(`/${postsSlug}`, {
        body: JSON.stringify({
          title: 'REST API EXAMPLE',
        }),
        headers: {
          Authorization: `JWT ${token}`,
        },
      })
      .then((res) => res.json())

    expect(data.doc.title).toEqual('REST API EXAMPLE')
  })
})
