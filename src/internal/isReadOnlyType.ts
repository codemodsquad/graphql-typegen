import { FlowTypeKind } from 'ast-types/gen/kinds'

export default function isReadOnlyType(type: FlowTypeKind): boolean {
  switch (type.type) {
    case 'NullableTypeAnnotation':
      return isReadOnlyType(type.typeAnnotation)
    case 'VoidTypeAnnotation':
    case 'MixedTypeAnnotation':
    case 'NullLiteralTypeAnnotation':
    case 'StringTypeAnnotation':
    case 'StringLiteralTypeAnnotation':
    case 'NumberTypeAnnotation':
    case 'NumberLiteralTypeAnnotation':
    case 'BooleanTypeAnnotation':
    case 'BooleanLiteralTypeAnnotation':
      return true
    case 'GenericTypeAnnotation':
      if (type.id.type !== 'Identifier') return false
      return type.id.name === '$ReadOnly' || type.id.name === '$ReadOnlyArray'
    case 'UnionTypeAnnotation':
    case 'IntersectionTypeAnnotation':
      return type.types.every(isReadOnlyType)
    default:
      return false
  }
}
