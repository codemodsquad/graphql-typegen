import resolveIdentifier from './resolveIdentifier'

import FAIL from './FAIL'
import { ASTPath } from 'jscodeshift'

export default function precomputeExpression(
  path: ASTPath<any> | typeof FAIL
): string | number | boolean | null | undefined | typeof FAIL {
  if (typeof path === 'symbol') {
    if (path === FAIL) return FAIL
    throw new Error(`invalid path: ${String(path)}`)
  }
  if (!path.node || !path.node.type) {
    return FAIL
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

  return FAIL
}

function precomputeTemplateLiteral(
  path: ASTPath<any>
): string | number | boolean | null | undefined | typeof FAIL {
  const quasis = path.node.quasis
  if (quasis.length === 1) return quasis[0].value.cooked
  const parts = []
  let i = 0

  while (i < quasis.length - 1) {
    parts.push(quasis[i].value.cooked)
    const expr = precomputeExpression(path.get('expressions', i))
    if (expr === FAIL) return FAIL
    parts.push(expr)
    i++
  }

  parts.push(quasis[i].value.cooked)
  return parts.join('')
}
