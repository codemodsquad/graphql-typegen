import j, { TSPropertySignature, TSTypeLiteral } from 'jscodeshift'
import { TSTypeKind } from 'ast-types/gen/kinds'
import groupBy from 'lodash/groupBy'
import uniqBy from 'lodash/uniqBy'
import flatMap from 'lodash/flatMap'
import readOnlyTSType from './readOnlyTSType'

export default function simplifyTSIntersection(
  types: TSTypeKind[]
): TSTypeKind {
  types = flatMap(types, (type) =>
    type.type === 'TSIntersectionType' ? type.types : type
  )

  const objectTypes: ObjectInfo[] = []
  const rest: TSTypeKind[] = []
  for (const type of types) {
    const objectType = getObjectType(type)
    if (objectType) objectTypes.push(objectType)
    else rest.push(type)
  }
  if (objectTypes.length <= 1) return j.tsIntersectionType(types)
  for (const group of Object.values(groupBy(objectTypes, 'group'))) {
    rest.unshift(mergeGroup(group))
  }
  return j.tsIntersectionType(rest)
}

function mergeGroup(group: ObjectInfo[]): TSTypeKind {
  const properties: TSPropertySignature[] = flatMap(group, (g) =>
    g.properties.filter((p) => p.type === 'TSPropertySignature')
  )
  const rest = flatMap(group, (g) =>
    g.properties.filter((p) => p.type !== 'TSPropertySignature')
  )
  let uniqOther = 0
  const obj = j.tsTypeLiteral([
    ...uniqBy(properties, (p) =>
      p.key.type === 'Identifier' ? p.key.name : uniqOther++
    ),
    ...rest,
  ])
  return group[0].readOnly ? readOnlyTSType(obj) : obj
}

type ObjectInfo = {
  group: string
  readOnly: boolean
  properties: TSPropertySignature[]
}

function getObjectType(type: TSTypeKind): ObjectInfo | null {
  const makeInfo = (readOnly: boolean, type: TSTypeLiteral): ObjectInfo => {
    return {
      group: readOnly ? 'readOnly' : 'mutable',
      readOnly,
      properties: type.members.filter(
        (m): m is TSPropertySignature => m.type === 'TSPropertySignature'
      ),
    }
  }
  switch (type.type) {
    case 'TSTypeLiteral': {
      return makeInfo(false, type)
    }
    case 'TSTypeReference': {
      if (
        type.typeName.type === 'Identifier' &&
        type.typeName.name === 'Readonly' &&
        type.typeParameters?.params?.[0]?.type === 'TSTypeLiteral'
      ) {
        const obj = type.typeParameters.params[0]
        return makeInfo(true, obj)
      }
      break
    }
  }

  return null
}
