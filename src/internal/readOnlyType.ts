import j from 'jscodeshift'
import { FlowTypeKind } from 'ast-types/gen/kinds'
import { GenericTypeAnnotation } from 'jscodeshift'
import isReadOnlyType from './isReadOnlyType'

export default function readOnlyType(type: FlowTypeKind): FlowTypeKind {
  if (isReadOnlyType(type)) return type as GenericTypeAnnotation
  if (type.type === 'NullableTypeAnnotation')
    return j.nullableTypeAnnotation(readOnlyType(type.typeAnnotation))
  return j.genericTypeAnnotation(
    j.identifier('$ReadOnly'),
    j.typeParameterInstantiation([type])
  )
}
