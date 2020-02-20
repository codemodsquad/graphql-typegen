/* eslint-disable @typescript-eslint/no-use-before-define */

import graphql from 'graphql'
import map from 'lodash/map'
import upperFirst from 'lodash/upperFirst'
import { AnalyzedType, AnalyzedInputField, EnumValue } from './analyzeSchema'
import jscodeshift, {
  JSCodeshift,
  TypeAlias,
  ObjectTypeAnnotation,
  ObjectTypeProperty,
  Statement,
  GenericTypeAnnotation,
  ImportDeclaration,
} from 'jscodeshift'
import { FlowTypeKind } from 'ast-types/gen/kinds'
import { Config, applyConfigDefaults } from './config'

import getExtractComment from './getExtractComment'

type GeneratedQueryType = {
  variables?: TypeAlias
  data: TypeAlias
}

type GeneratedMutationType = {
  variables?: TypeAlias
  data: TypeAlias
  mutationFunction: TypeAlias
}

type GeneratedTypes = {
  query: Record<string, GeneratedQueryType>
  mutation: Record<string, GeneratedMutationType>
  subscription: Record<string, GeneratedQueryType>
  fragment: Record<string, TypeAlias>
}

export default function graphqlToFlow({
  jscodeshift: j,
  query,
  file,
  types,
  config,
}: {
  jscodeshift: JSCodeshift
  query: string | graphql.DocumentNode
  file: string
  types: Record<string, AnalyzedType>
  config: Config
}): {
  statements: Statement[]
  generatedTypes: GeneratedTypes
  imports: ImportDeclaration[]
} {
  const { statement } = j.template

  const {
    addTypename,
    useReadOnlyTypes,
    objectType,
    externalTypes,
  } = applyConfigDefaults(config)

  function objectTypeAnnotation(
    properties: Parameters<typeof j.objectTypeAnnotation>[0]
  ): ObjectTypeAnnotation | GenericTypeAnnotation {
    const annotation = j.objectTypeAnnotation(properties)
    annotation.exact = objectType === 'exact'
    annotation.inexact = objectType === 'inexact'
    if (useReadOnlyTypes) {
      return j.genericTypeAnnotation(
        j.identifier('$ReadOnly'),
        j.typeParameterInstantiation([annotation])
      )
    }
    return annotation
  }

  function arrayTypeAnnotation(params: FlowTypeKind[]): GenericTypeAnnotation {
    return j.genericTypeAnnotation(
      j.identifier(useReadOnlyTypes ? '$ReadOnlyArray' : 'Array'),
      j.typeParameterInstantiation(params)
    )
  }

  //   const external: Map<string, FlowTypeKind> = new Map()
  //   for (const [key, value] of _external.entries()) {
  //     const Analyzed = j(`// @flow
  // type __T = ${value};`)
  //       .find(j.TypeAlias)
  //       .nodes()[0].right
  //     external.set(key, Analyzed)
  //   }

  const strippedFileName = file
    ? require('path')
        .basename(file)
        .replace(/\..+$/, '')
    : null

  const document: graphql.DocumentNode =
    typeof query === 'string' ? (query = graphql.parse(query)) : query

  const fragments = new Map()
  const statements: Statement[] = []
  const generatedTypes: GeneratedTypes = {
    query: {},
    mutation: {},
    subscription: {},
    fragment: {},
  }
  const imports: ImportDeclaration[] = []

  function convertDefinition(def: graphql.DefinitionNode): void {
    switch (def.kind) {
      case 'OperationDefinition':
        return convertOperationDefinition(def)
      case 'FragmentDefinition':
        return convertFragmentDefinition(def)
    }
  }

  function convertFragmentDefinition(
    def: graphql.FragmentDefinitionNode
  ): void {
    if (external.has(def.name.value)) return
    const type = convertSelectionSet(
      def.selectionSet,
      types[def.typeCondition.name.value]
    )
    let extractedName = getExtractComment(def)
    if (typeof extractedName !== 'string') {
      extractedName = `${upperFirst(def.name.value)}`
    }
    const alias = addTypeAlias(extractedName, type)
    generatedTypes.fragment[def.name.value] = alias
    fragments.set(def.name.value, alias)
  }

  function convertOperationDefinition(
    def: graphql.OperationDefinitionNode
  ): void {
    const { operation, selectionSet, variableDefinitions } = def
    let name = def.name ? upperFirst(def.name.value) : `Unnamed`
    if (
      strippedFileName &&
      name.toLowerCase().startsWith(strippedFileName.toLowerCase())
    ) {
      name = name.substring(strippedFileName.length)
    }
    if (name.toLowerCase().lastIndexOf(operation) < 0) {
      name += upperFirst(operation)
    }
    const data = addTypeAlias(
      `${name}Data`,
      convertSelectionSet(selectionSet, types[upperFirst(operation)])
    )
    if (operation === 'query' || operation === 'subscription') {
      const operationTypes: GeneratedQueryType = def.name
        ? (generatedTypes[operation][def.name.value] = { data })
        : { data }
      if (variableDefinitions && variableDefinitions.length) {
        operationTypes.variables = addTypeAlias(
          `${name}Variables`,
          convertVariableDefinitions(variableDefinitions)
        )
      }
    } else if (operation === 'mutation') {
      const variables =
        variableDefinitions && variableDefinitions.length
          ? addTypeAlias(
              `${name}Variables`,
              convertVariableDefinitions(variableDefinitions)
            )
          : null
      const mutationFunction = statement([
        `type ${name}Function = ${MutationFunction}<${data.id.name}${
          variables ? `, ${variables.id.name}` : ''
        }>`,
      ])
      statements.push(mutationFunction)
      const operationTypes: GeneratedMutationType = def.name
        ? (generatedTypes.mutation[def.name.value] = { data, mutationFunction })
        : { data, mutationFunction }
      if (variables) operationTypes.variables = variables
    }
  }

  const typeAliasCounts: Record<string, number> = {}

  function addTypeAlias(name: string, type: FlowTypeKind): TypeAlias {
    let count = typeAliasCounts[name]
    if (count != null) {
      typeAliasCounts[name] = ++count
      name += count
    } else {
      typeAliasCounts[name] = 0
    }
    const alias = j.typeAlias(j.identifier(name), null, type)
    statements.push(alias)
    return alias
  }

  function convertVariableDefinitions(
    variableDefinitions: readonly graphql.VariableDefinitionNode[]
  ): FlowTypeKind {
    const props = variableDefinitions.map(def => convertVariableDefinition(def))
    return objectTypeAnnotation(props)
  }

  function convertVariableDefinition(
    def: graphql.VariableDefinitionNode
  ): ObjectTypeProperty {
    const {
      variable: { name },
      type,
    } = def
    return j.objectTypeProperty(
      j.identifier(name.value),
      convertVariableType(type),
      type.kind !== 'NonNullType'
    )
  }

  function convertVariableType(type: graphql.TypeNode): FlowTypeKind {
    if (type.kind === 'NonNullType') return innerConvertVariableType(type.type)
    return j.nullableTypeAnnotation(innerConvertVariableType(type))
  }

  function innerConvertVariableType(
    type: graphql.NamedTypeNode | graphql.ListTypeNode
  ): FlowTypeKind {
    switch (type.kind) {
      case 'NamedType':
        return convertVariableTypeName(type.name.value)
      case 'ListType':
        return arrayTypeAnnotation([convertVariableType(type.type)])
    }
  }

  function convertVariableTypeName(name: string): FlowTypeKind {
    switch (name) {
      case 'Boolean':
        return j.booleanTypeAnnotation()
      case 'Int':
      case 'Float':
        return j.numberTypeAnnotation()
      case 'ID':
      case 'String':
        return j.stringTypeAnnotation()
    }
    const type = types[name]
    const externalType = external.get(name)
    if (externalType) return externalType
    if (type && type.inputFields) return convertInputType(type)
    return j.mixedTypeAnnotation()
  }

  function convertSelectionSet(
    selectionSet: graphql.SelectionSetNode,
    type: AnalyzedType
  ): FlowTypeKind {
    const { selections } = selectionSet
    const propSelections: graphql.FieldNode[] = selections.filter(
      s => s.kind === 'Field'
    ) as graphql.FieldNode[]
    const fragmentSelections: graphql.FragmentSpreadNode[] = selections.filter(
      s => s.kind === 'FragmentSpread'
    ) as graphql.FragmentSpreadNode[]
    const intersects = []
    if (propSelections.length) {
      intersects.push(
        objectTypeAnnotation(propSelections.map(s => convertField(s, type)))
      )
    }
    fragmentSelections.forEach(spread => {
      if (external.has(spread.name.value)) {
        intersects.push(external.get(spread.name.value))
      } else {
        const alias = fragments.get(spread.name.value)
        if (!alias)
          throw new Error(
            `missing fragment definition named ${spread.name.value}`
          )
        intersects.push(j.genericTypeAnnotation(alias.id, null))
      }
    })
    return intersects.length === 1
      ? intersects[0]
      : j.intersectionTypeAnnotation(intersects)
  }

  function getInnerType(type: AnalyzedType): AnalyzedType {
    let innerType = type
    while (innerType.ofType) innerType = innerType.ofType
    return innerType
  }

  function getFieldType(
    objectType: AnalyzedType,
    fieldName: string
  ): AnalyzedType {
    const innerType = getInnerType(objectType)
    const { fields } = innerType
    if (!fields)
      throw new Error(
        `unexpected: inner type for ${objectType.name} is missing fields`
      )
    const fieldDef = fields[fieldName]
    if (!fieldDef)
      throw new Error(
        `type ${
          innerType.name
        } doesn't have a field named ${fieldName}.  Valid fields are:
  ${map(fields, f => f.name).join('\n  ')}`
      )
    return fieldDef.type
  }

  function convertField(
    field: graphql.FieldNode,
    type: AnalyzedType
  ): ObjectTypeProperty {
    const { name, alias, selectionSet, directives } = field
    let typeValue
    const fieldName = name.value
    if (fieldName === '__typename')
      typeValue = j.stringLiteralTypeAnnotation(type.name, type.name)
    else typeValue = convertType(getFieldType(type, fieldName), selectionSet)
    if (directives) {
      for (const directive of directives) {
        const {
          name: { value: name },
        } = directive
        if (name === 'include' || name === 'skip') {
          if (typeValue.type !== 'NullableTypeAnnotation') {
            typeValue = j.nullableTypeAnnotation(typeValue)
          }
          break
        }
      }
    }
    return j.objectTypeProperty(
      j.identifier((alias || name).value),
      typeValue,
      false
    )
  }

  function convertType(
    type: AnalyzedType,
    selectionSet?: graphql.SelectionSetNode
  ): FlowTypeKind {
    if (type.kind === 'NON_NULL') {
      const { ofType } = type
      if (!ofType) throw new Error('unexpected: NON_NULL type missing ofType')
      return innerConvertType(ofType, selectionSet)
    }
    return j.nullableTypeAnnotation(innerConvertType(type, selectionSet))
  }

  function innerConvertType(
    type: AnalyzedType,
    selectionSet?: graphql.SelectionSetNode
  ): FlowTypeKind {
    if (type.kind === graphql.TypeKind.LIST)
      return convertListType(type, selectionSet)
    const { name } = type
    function extractIfNecessary(result: FlowTypeKind): FlowTypeKind {
      if (extractTypes.has(name)) {
        const flowTypeName = extractTypes.get(name) || name
        const alias = addTypeAlias(flowTypeName, result)
        return j.genericTypeAnnotation(j.identifier(alias.id.name), null)
      }
      return result
    }
    if (type.kind === graphql.TypeKind.ENUM) {
      const { enumValues } = type
      if (!enumValues) {
        throw new Error('unexpected: ENUM type missing enumValues')
      }
      return extractIfNecessary(
        j.unionTypeAnnotation(
          enumValues.map((value: EnumValue) =>
            j.stringLiteralTypeAnnotation(value.name, value.name)
          )
        )
      )
    }
    switch (name) {
      case 'Boolean':
        return j.booleanTypeAnnotation()
      case 'Int':
      case 'Float':
        return j.numberTypeAnnotation()
      case 'ID':
      case 'String':
        return j.stringTypeAnnotation()
    }
    const externalType = external[name]
    if (externalType) return externalType
    function convertCustomType(
      type: AnalyzedType,
      selectionSet?: graphql.SelectionSetNode
    ): FlowTypeKind {
      if (types[name]) type = types[name]
      if (type.inputFields) return convertInputType(type)
      if (selectionSet) {
        return convertSelectionSet(selectionSet, type)
      } else {
        return j.mixedTypeAnnotation()
      }
    }
    return extractIfNecessary(convertCustomType(type, selectionSet))
  }

  function convertListType(
    type: AnalyzedType,
    selectionSet?: graphql.SelectionSetNode
  ): FlowTypeKind {
    const { ofType } = type
    if (!ofType) throw new Error('LIST type missing ofType')
    return arrayTypeAnnotation([convertType(ofType, selectionSet)])
  }

  function convertInputType(type: AnalyzedType): FlowTypeKind {
    return objectTypeAnnotation(
      map(type.inputFields, field => convertInputField(field))
    )
  }

  function convertInputField(field: AnalyzedInputField): ObjectTypeProperty {
    return j.objectTypeProperty(
      j.identifier(field.name),
      convertType(field.type),
      field.type.kind !== 'NON_NULL'
    )
  }

  // convert fragments first
  for (const def of document.definitions) {
    if (def.kind === 'FragmentDefinition') convertFragmentDefinition(def)
  }
  for (const def of document.definitions) {
    if (def.kind !== 'FragmentDefinition') convertDefinition(def)
  }

  return { statements, generatedTypes, imports }
}
