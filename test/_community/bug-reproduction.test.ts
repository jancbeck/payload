/**
 * Unit test to demonstrate the trash + search plugin bug
 * This test shows that without the fix, the search plugin fails when trying to sync trashed documents
 */

import { syncDocAsSearchIndex } from '../../../packages/plugin-search/src/utilities/syncDocAsSearchIndex.js'

// Mock payload and req objects to simulate the bug scenario
const mockPayload = {
  config: {
    localization: true, // This triggers the findByID call that causes the bug
  },
  findByID: jest.fn(),
  logger: {
    error: jest.fn(),
  },
}

const mockReq = {
  locale: 'en',
  context: {},
}

const mockDoc = {
  id: 'test-doc-id',
  title: 'Test Document',
  deletedAt: '2023-10-01T10:00:00.000Z', // This makes it a trashed document
  _status: 'published',
}

const mockPluginConfig = {
  beforeSync: jest.fn().mockResolvedValue({ title: 'Test Document' }),
  searchOverrides: { slug: 'search' },
}

describe('Trash + Search Plugin Bug Reproduction', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('should fail WITHOUT fix when syncing trashed document with localization', async () => {
    // Mock findByID to throw "not found" error (simulating the bug)
    mockPayload.findByID.mockRejectedValue(new Error('Document not found'))

    // This should fail with the current code WITHOUT the fix
    await expect(
      syncDocAsSearchIndex({
        collection: 'posts',
        doc: mockDoc,
        locale: 'en',
        operation: 'update',
        pluginConfig: mockPluginConfig,
        req: { payload: mockPayload, ...mockReq },
      })
    ).rejects.toThrow('Document not found')

    // Verify that findByID was called without trash: true parameter (the bug)
    expect(mockPayload.findByID).toHaveBeenCalledWith({
      id: 'test-doc-id',
      collection: 'posts',
      locale: 'en',
      req: { payload: mockPayload, ...mockReq },
      // NOTE: Without the fix, trash parameter is missing here!
    })
  })

  test('should succeed WITH fix when syncing trashed document with localization', async () => {
    // Mock findByID to succeed when trash: true is passed
    mockPayload.findByID.mockImplementation(({ trash }) => {
      if (trash) {
        return Promise.resolve(mockDoc)
      }
      return Promise.reject(new Error('Document not found'))
    })

    // This should succeed with the fix
    const result = await syncDocAsSearchIndex({
      collection: 'posts',
      doc: mockDoc,
      locale: 'en',
      operation: 'update',
      pluginConfig: mockPluginConfig,
      req: { payload: mockPayload, ...mockReq },
    })

    expect(result).toBe(mockDoc)

    // Verify that findByID was called with trash: true parameter (the fix)
    expect(mockPayload.findByID).toHaveBeenCalledWith({
      id: 'test-doc-id',
      collection: 'posts',
      locale: 'en',
      req: { payload: mockPayload, ...mockReq },
      trash: true, // This is the fix!
    })
  })
})