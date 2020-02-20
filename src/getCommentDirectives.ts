import * as graphql from 'graphql'
import getGraphQLComments from './getGraphQLComments'
import getConfigDirectives, { ConfigDirectives } from './getConfigDirectives'

export default function getCommentDirectives(
  node: graphql.ASTNode
): ConfigDirectives {
  function* lines(): Iterable<string> {
    for (const { value } of getGraphQLComments(node)) {
      if (typeof value === 'string') yield value
    }
  }
  return getConfigDirectives(lines())
}
