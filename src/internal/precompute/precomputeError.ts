import { ASTPath } from 'jscodeshift'
import printLocation from '../printLocation'

export default function precomputeError(path: ASTPath<any>): void {
  const { node } = path
  // istanbul ignore next
  if (!node) {
    throw new Error(
      `unknown error attempting to determine value of an expression in a GraphQL tagged template literal`
    )
  }
  throw new Error(
    `Failed to determine value of expression (${printLocation(node)}).
It may be possible, but graphql-typegen doesn't have logic to handle this case.`
  )
}
