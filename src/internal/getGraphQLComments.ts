import * as graphql from 'graphql'

export default function getGraphQLComments(
  node: graphql.ASTNode
): graphql.Token[] {
  const { loc } = node
  if (loc == null) return []
  const comments = []
  let token = loc.startToken.prev
  while (token && token.kind === graphql.TokenKind.COMMENT) {
    comments.push(token)
    token = token.prev
  }
  return comments.reverse()
}
