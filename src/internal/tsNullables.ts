import { TSTypeKind } from 'ast-types/gen/kinds'
import j, { TSUnionType } from 'jscodeshift'

export function isNullableTSType(type: TSTypeKind): boolean {
  return (
    type.type === 'TSUnionType' &&
    !type.types.some(canBeUndefined) &&
    type.types.some(canBeNull)
  )
}

export function nullableTSType(type: TSTypeKind): TSTypeKind {
  return isNullableTSType(type) ? type : (
      j.tsUnionType([type, j.tsNullKeyword()])
    )
}

export function isNullishTSType(type: TSTypeKind): boolean {
  return (
    type.type === 'TSUnionType' &&
    type.types.some(canBeUndefined) &&
    type.types.some(canBeNull)
  )
}

export function nullishTSType(type: TSTypeKind): TSTypeKind {
  if (isNullishTSType(type)) return type
  if (isNullableTSType(type)) {
    return j.tsUnionType([
      ...(type as TSUnionType).types,
      j.tsUndefinedKeyword(),
    ])
  }
  return j.tsUnionType([
    ...(type.type === 'TSUnionType' ? type.types : [type]),
    j.tsNullKeyword(),
    j.tsUndefinedKeyword(),
  ])
}

export function nonNullable(type: TSTypeKind): TSTypeKind {
  const types =
    type.type === 'TSUnionType' ?
      type.types
    : [type]
        .filter(
          (t) =>
            t.type !== 'TSNullKeyword' &&
            t.type !== 'TSUndefinedKeyword' &&
            t.type !== 'TSVoidKeyword'
        )
        .map((t) => nonNullable(t))
  return types.length === 1 ? types[0] : j.tsUnionType(types)
}

function canBeUndefined(type: TSTypeKind): boolean {
  return (
    type.type === 'TSUndefinedKeyword' ||
    type.type === 'TSVoidKeyword' ||
    (type.type === 'TSUnionType' && type.types.some(canBeUndefined))
  )
}
function canBeNull(type: TSTypeKind): boolean {
  return (
    type.type === 'TSNullKeyword' ||
    (type.type === 'TSUnionType' && type.types.some(canBeNull))
  )
}
