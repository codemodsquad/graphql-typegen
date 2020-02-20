import * as graphql from 'graphql'
import getGraphQLComments from './getGraphQLComments'
import { pragma } from './pragma'

import isValidIdentifier from './isValidIdentifier'

export default function getExtractComment(
  node: graphql.ASTNode
): string | true | null {
  for (const { value } of getGraphQLComments(node)) {
    if (!value) continue
    const parts = value.trim().split(/\s+/g, 4)
    if (parts[0] === pragma && parts[1] === 'extract') {
      if (parts[2]) {
        if (parts[2] == 'as') {
          if (isValidIdentifier(parts[3])) return parts[3]
          throw new Error(`invalid extract as identifier: ${parts[3]}`)
        } else {
          throw new Error(`invalid token after extract: ${parts[2]}`)
        }
      }
      return true
    }
  }
  return null
}
