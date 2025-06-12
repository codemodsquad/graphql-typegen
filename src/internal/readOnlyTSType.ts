import j from 'jscodeshift'
import { TSTypeKind } from 'ast-types/gen/kinds'
import {
  isNullableTSType,
  isNullishTSType,
  nonNullable,
  nullableTSType,
  nullishTSType,
} from './tsNullables'
import isReadOnlyTSType from './isReadOnlyTSType'

export default function readOnlyTSType(type: TSTypeKind): TSTypeKind {
  if (isReadOnlyTSType(type)) return type
  if (isNullishTSType(type))
    return nullishTSType(readOnlyTSType(nonNullable(type)))
  if (isNullableTSType(type))
    return nullableTSType(readOnlyTSType(nonNullable(type)))
  return j.tsTypeReference(
    j.identifier('Readonly'),
    j.tsTypeParameterInstantiation([type])
  )
}
