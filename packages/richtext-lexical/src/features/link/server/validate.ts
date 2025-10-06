import type { Field } from 'payload'

import { fieldSchemasToFormState } from '@payloadcms/ui/forms/fieldSchemasToFormState'

import type { NodeValidation } from '../../typesServer.js'
import type { SerializedAutoLinkNode, SerializedLinkNode } from '../nodes/types.js'
import type { LinkFeatureServerProps } from './index.js'

export const linkValidation = (
  props: LinkFeatureServerProps,
  sanitizedFieldsWithoutText: Field[],
): NodeValidation<SerializedAutoLinkNode | SerializedLinkNode> => {
  return async ({
    node,
    validation: {
      options: { id, collectionSlug, data, operation, preferences, req },
    },
  }) => {
    /**
     * Run fieldSchemasToFormState as that properly validates link fields and link sub-fields
     */

    // For AutoLinkNodes, skip validation of custom fields since they are automatically created
    // and don't go through the link editor UI where users can fill in custom required fields
    const isAutoLink = node.type === 'autolink'

    const result = await fieldSchemasToFormState({
      id,
      collectionSlug,
      data: node.fields,
      documentData: data,
      fields: sanitizedFieldsWithoutText, // Sanitized in feature.server.ts
      fieldSchemaMap: undefined,
      initialBlockData: node.fields,
      operation: operation === 'create' || operation === 'update' ? operation : 'update',
      permissions: {},
      preferences,
      renderAllFields: false,
      req,
      schemaPath: '',
      skipValidation: isAutoLink, // Skip validation for autolinks
    })

    const errorPathsSet = new Set<string>()
    for (const fieldKey in result) {
      const fieldState = result[fieldKey]
      if (fieldState?.errorPaths?.length) {
        for (const errorPath of fieldState.errorPaths) {
          errorPathsSet.add(errorPath)
        }
      }
    }
    const errorPaths = Array.from(errorPathsSet)

    if (errorPaths.length) {
      return 'The following fields are invalid: ' + errorPaths.join(', ')
    }

    return true
  }
}
