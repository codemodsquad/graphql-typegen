import { ASTNode } from 'jscodeshift'

export default function printLocation(node: ASTNode): string {
  const { loc } = node
  if (!loc) return 'unknown'
  return `line ${loc.start.line}:${loc.start.column}`
}
