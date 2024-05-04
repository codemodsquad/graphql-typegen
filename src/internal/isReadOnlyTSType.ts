import { TSTypeKind } from 'ast-types/gen/kinds'
import { isNullableTSType, isNullishTSType, nonNullable } from './tsNullables'

export default function isReadOnlyTSType(type: TSTypeKind): boolean {
  switch (type.type) {
    case 'TSVoidKeyword':
    case 'TSUnknownKeyword':
    case 'TSNullKeyword':
    case 'TSStringKeyword':
    case 'TSNumberKeyword':
    case 'TSBooleanKeyword':
    case 'TSLiteralType':
      return true
    case 'TSTypeReference':
      if (type.typeName.type !== 'Identifier') return false
      return (
        type.typeName.name === 'Readonly' ||
        type.typeName.name === 'ReadonlyArray'
      )
    case 'TSUnionType':
    case 'TSIntersectionType':
      return type.types.every(isReadOnlyTSType)
    default:
      return false
  }
}
