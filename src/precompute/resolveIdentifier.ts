import FAIL from './FAIL'
import { ASTPath } from 'jscodeshift'

export default function resolveIdentifier(
  path: ASTPath<any> | typeof FAIL
): ASTPath<any> | typeof FAIL {
  if (typeof path === 'symbol') {
    if (path === FAIL) return FAIL
    throw new Error(`invalid path: ${String(path)}`)
  }
  if (!path.node || path.node.type !== 'Identifier') {
    return FAIL
  }

  const scope = path.scope.lookup(path.node.name)
  if (!scope) return FAIL
  const binding = scope.getBindings()[path.node.name][0]

  if (
    !binding.parent ||
    !binding.parent.node ||
    binding.parent.node.type !== 'VariableDeclarator'
  ) {
    return FAIL
  }

  return binding.parent.get('init')
}
