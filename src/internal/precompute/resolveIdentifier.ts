import { ASTPath } from 'jscodeshift'
import precomputeError from './precomputeError'

export default function resolveIdentifier(path: ASTPath<any>): ASTPath<any> {
  // istanbul ignore next
  if (!path.node || path.node.type !== 'Identifier') {
    precomputeError(path)
  }

  const scope = path.scope.lookup(path.node.name)
  if (!scope) precomputeError(path)
  const binding = scope.getBindings()[path.node.name][0]

  if (
    !binding.parent ||
    !binding.parent.node ||
    binding.parent.node.type !== 'VariableDeclarator'
  ) {
    precomputeError(path)
  }

  return binding.parent.get('init')
}
