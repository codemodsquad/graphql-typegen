import resolveIdentifier from './resolveIdentifier'

import { ASTPath } from 'jscodeshift'
import precomputeError from './precomputeError'

export default function precomputeExpression(
  path: ASTPath<any>
): string | number | boolean | null | undefined {
  // istanbul ignore next
  if (!path.node || !path.node.type) {
    precomputeError(path)
  }

  switch (path.node.type) {
    case 'NullLiteral':
      return null

    case 'Literal':
    case 'NumericLiteral':
    case 'StringLiteral':
      return path.node.value

    case 'TemplateLiteral':
      return precomputeTemplateLiteral(path)

    case 'Identifier':
      return precomputeExpression(resolveIdentifier(path))
  }

  precomputeError(path)
}

function precomputeTemplateLiteral(
  path: ASTPath<any>
): string | number | boolean | null | undefined {
  const quasis = path.node.quasis
  if (quasis.length === 1) return quasis[0].value.cooked
  const parts = []
  let i = 0

  while (i < quasis.length - 1) {
    parts.push(quasis[i].value.cooked)
    const expr = precomputeExpression(path.get('expressions', i))
    parts.push(expr)
    i++
  }

  parts.push(quasis[i].value.cooked)
  return parts.join('')
}
