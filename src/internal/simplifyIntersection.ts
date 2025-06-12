import j, {
  ObjectTypeSpreadProperty,
  ObjectTypeProperty,
  ObjectTypeAnnotation,
  IntersectionTypeAnnotation,
} from 'jscodeshift'
import { FlowTypeKind } from 'ast-types/gen/kinds'
import groupBy from 'lodash/groupBy'
import uniqBy from 'lodash/uniqBy'
import flatMap from 'lodash/flatMap'
import { ObjectType } from './config'
import readOnlyType from './readOnlyType'

export default function simplifyIntersection(
  types: FlowTypeKind[]
): IntersectionTypeAnnotation {
  types = flatMap(types, (type) =>
    type.type === 'IntersectionTypeAnnotation' ? type.types : type
  )

  const objectTypes: ObjectInfo[] = []
  const rest: FlowTypeKind[] = []
  for (const type of types) {
    const objectType = getObjectType(type)
    if (objectType) objectTypes.push(objectType)
    else rest.push(type)
  }
  if (objectTypes.length <= 1) return j.intersectionTypeAnnotation(types)
  for (const group of Object.values(groupBy(objectTypes, 'group'))) {
    rest.unshift(mergeGroup(group))
  }
  return j.intersectionTypeAnnotation(rest)
}

function mergeGroup(group: ObjectInfo[]): FlowTypeKind {
  const properties: ObjectTypeProperty[] = flatMap(group, (g) =>
    g.properties.filter((p) => p.type === 'ObjectTypeProperty')
  )
  const rest = flatMap(group, (g) =>
    g.properties.filter((p) => p.type !== 'ObjectTypeProperty')
  )
  let uniqOther = 0
  const obj = j.objectTypeAnnotation([
    ...uniqBy(properties, (p) =>
      p.key.type === 'Identifier' ? p.key.name : uniqOther++
    ),
    ...rest,
  ])
  obj.exact = group[0].objectType === 'exact'
  obj.inexact = group[0].objectType === 'inexact'
  return group[0].readOnly ? readOnlyType(obj) : obj
}

type ObjectInfo = {
  group: string
  readOnly: boolean
  objectType: ObjectType
  properties: (ObjectTypeProperty | ObjectTypeSpreadProperty)[]
}

function getObjectType(type: FlowTypeKind): ObjectInfo | null {
  const makeInfo = (
    readOnly: boolean,
    type: ObjectTypeAnnotation
  ): ObjectInfo => {
    const objectType =
      type.exact ? 'exact'
      : type.inexact ? 'inexact'
      : 'ambiguous'
    return {
      group: `${readOnly ? 'readOnly' : 'mutable'}-${objectType}`,
      readOnly,
      objectType,
      properties: type.properties,
    }
  }
  switch (type.type) {
    case 'ObjectTypeAnnotation': {
      return makeInfo(false, type)
    }
    case 'GenericTypeAnnotation': {
      if (
        type.id.type === 'Identifier' &&
        type.id.name === '$ReadOnly' &&
        type.typeParameters?.params?.[0]?.type === 'ObjectTypeAnnotation'
      ) {
        const obj = type.typeParameters.params[0]
        return makeInfo(true, obj)
      }
      break
    }
  }

  return null
}
