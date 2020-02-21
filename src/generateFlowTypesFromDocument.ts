/* eslint-disable @typescript-eslint/no-use-before-define */

import * as graphql from 'graphql'
import map from 'lodash/map'
import upperFirst from 'lodash/upperFirst'
import memoize from 'lodash/memoize'
import once from 'lodash/once'
import {
  AnalyzedType,
  AnalyzedInputField,
  EnumValue,
  AnalyzedField,
} from './analyzeSchema'
import j, {
  TypeAlias,
  ObjectTypeProperty,
  GenericTypeAnnotation,
  ImportDeclaration,
} from 'jscodeshift'
import { FlowTypeKind } from 'ast-types/gen/kinds'
import { Config, applyConfigDefaults } from './config'
import { ConfigDirectives } from './getConfigDirectives'
import getCommentDirectives from './getCommentDirectives'
import readOnlyType from './readOnlyType'

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
  query,
  file,
  types,
  config: _config,
  getMutationFunction,
}: {
  query: string | graphql.DocumentNode
  file: string
  types: Record<string, AnalyzedType>
  config: Config
  getMutationFunction: () => string
}): {
  statements: TypeAlias[]
  generatedTypes: GeneratedTypes
  imports: ImportDeclaration[]
} {
  const { statement } = j.template
  const config = applyConfigDefaults(_config)

  const MutationFunction = once(getMutationFunction)

  function getCombinedConfig(
    ...args: (Partial<ConfigDirectives> | null | undefined)[]
  ): ConfigDirectives {
    let { objectType, useReadOnlyTypes, addTypename } = config
    let external: string | undefined = undefined
    let extract: string | true | undefined = undefined
    for (const arg of args) {
      if (!arg) continue
      if (arg.objectType != null) objectType = arg.objectType
      if (arg.useReadOnlyTypes != null) useReadOnlyTypes = arg.useReadOnlyTypes
      if (arg.addTypename != null) addTypename = arg.addTypename
      if (arg.hasOwnProperty('external')) external = arg.external
      if (arg.hasOwnProperty('extract')) extract = arg.extract
    }
    return {
      objectType,
      useReadOnlyTypes,
      addTypename,
      extract,
      external,
    }
  }

  const getExternalType = memoize(
    (external: string): FlowTypeKind => {
      external = external.trim()
      if (/^import\s/.test(external)) {
        const parsed = statement([external])
        if (parsed.type !== 'ImportDeclaration') {
          throw new Error(`invalid import declaration: ${external}`)
        }
        const decl: ImportDeclaration = parsed

        if (decl.specifiers.length !== 1) {
          throw new Error(
            `import declaration must have only one specifier: ${external}`
          )
        }
        const identifier = decl.specifiers[0].local?.name
        if (!identifier) {
          throw new Error(
            `unable to determine imported identifier: ${external}`
          )
        }

        return j.genericTypeAnnotation(j.identifier(identifier), null)
      } else {
        return j(`// @flow
        type __T = ${external};`)
          .find(j.TypeAlias)
          .nodes()[0].right
      }
    }
  )

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

  function extractIfNecessary(
    type: FlowTypeKind,
    as: string | null | undefined
  ): FlowTypeKind {
    if (as) {
      const alias = addTypeAlias(as, type)
      return j.genericTypeAnnotation(j.identifier(alias.id.name), null)
    }
    return type
  }

  function objectTypeAnnotation(
    properties: Parameters<typeof j.objectTypeAnnotation>[0],
    { objectType, useReadOnlyTypes }: ConfigDirectives
  ): FlowTypeKind {
    const annotation = j.objectTypeAnnotation(properties)
    annotation.exact = objectType === 'exact'
    annotation.inexact = objectType === 'inexact'
    if (useReadOnlyTypes) {
      return readOnlyType(annotation)
    }
    return annotation
  }

  function arrayTypeAnnotation(
    elementType: FlowTypeKind,
    { useReadOnlyTypes }: ConfigDirectives
  ): GenericTypeAnnotation {
    return j.genericTypeAnnotation(
      j.identifier(useReadOnlyTypes ? '$ReadOnlyArray' : 'Array'),
      j.typeParameterInstantiation([
        useReadOnlyTypes ? readOnlyType(elementType) : elementType,
      ])
    )
  }

  const strippedFileName = file
    ? require('path')
        .basename(file)
        .replace(/\..+$/, '')
    : null

  const document: graphql.DocumentNode =
    typeof query === 'string' ? (query = graphql.parse(query)) : query

  const fragments: Map<string, TypeAlias> = new Map()
  const statements: TypeAlias[] = []
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
    const config = getCombinedConfig(
      { external: undefined, extract: undefined },
      getCommentDirectives(def)
    )
    const { external } = config
    if (external) return
    let { extract } = config

    const type = convertSelectionSet(
      def.selectionSet,
      types[def.typeCondition.name.value],
      config
    )
    if (typeof extract !== 'string') {
      extract = `${upperFirst(def.name.value)}`
    }
    const alias = addTypeAlias(extract, type)
    generatedTypes.fragment[def.name.value] = alias
    fragments.set(def.name.value, alias)
  }

  function convertOperationDefinition(
    def: graphql.OperationDefinitionNode
  ): void {
    const { operation, selectionSet, variableDefinitions } = def
    const config = getCombinedConfig(
      { external: undefined, extract: undefined },
      getCommentDirectives(def)
    )

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
      convertSelectionSet(selectionSet, types[upperFirst(operation)], config)
    )
    if (operation === 'query' || operation === 'subscription') {
      const operationTypes: GeneratedQueryType = def.name
        ? (generatedTypes[operation][def.name.value] = { data })
        : { data }
      if (variableDefinitions && variableDefinitions.length) {
        operationTypes.variables = addTypeAlias(
          `${name}Variables`,
          convertVariableDefinitions(variableDefinitions, config)
        )
      }
    } else if (operation === 'mutation') {
      const variables =
        variableDefinitions && variableDefinitions.length
          ? addTypeAlias(
              `${name}Variables`,
              convertVariableDefinitions(variableDefinitions, config)
            )
          : null
      const mutationFunction = statement([
        `type ${name}Function = ${MutationFunction()}<${data.id.name}${
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

  function convertVariableDefinitions(
    variableDefinitions: readonly graphql.VariableDefinitionNode[],
    config: ConfigDirectives
  ): FlowTypeKind {
    const props = variableDefinitions.map(def =>
      convertVariableDefinition(def, config)
    )
    return objectTypeAnnotation(props, config)
  }

  function convertVariableDefinition(
    def: graphql.VariableDefinitionNode,
    config: ConfigDirectives
  ): ObjectTypeProperty {
    config = getCombinedConfig(
      config,
      { external: undefined, extract: undefined },
      getCommentDirectives(def)
    )
    const {
      variable: { name },
      type,
    } = def
    return j.objectTypeProperty(
      j.identifier(name.value),
      convertVariableType(type, config),
      type.kind !== 'NonNullType'
    )
  }

  function convertVariableType(
    type: graphql.TypeNode,
    config: ConfigDirectives
  ): FlowTypeKind {
    if (type.kind === 'NonNullType')
      return innerConvertVariableType(type.type, config)
    return j.nullableTypeAnnotation(innerConvertVariableType(type, config))
  }

  function innerConvertVariableType(
    type: graphql.NamedTypeNode | graphql.ListTypeNode,
    config: ConfigDirectives
  ): FlowTypeKind {
    switch (type.kind) {
      case 'NamedType':
        return convertVariableTypeName(type.name.value, config)
      case 'ListType':
        return arrayTypeAnnotation(
          convertVariableType(type.type, config),
          config
        )
    }
  }

  function convertVariableTypeName(
    name: string,
    config: ConfigDirectives
  ): FlowTypeKind {
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
    config = getCombinedConfig(
      { external: undefined, extract: undefined },
      type?.config,
      config
    )
    const { external } = config
    if (external) return getExternalType(external)
    let { extract: as } = config
    if (as === true) as = name
    if (type && type.inputFields)
      return extractIfNecessary(convertInputType(type, config), as)
    return extractIfNecessary(j.mixedTypeAnnotation(), as)
  }

  function convertSelectionSet(
    selectionSet: graphql.SelectionSetNode,
    type: AnalyzedType,
    config: ConfigDirectives
  ): FlowTypeKind {
    config = getCombinedConfig(config, type.config)
    const { addTypename, useReadOnlyTypes } = config
    const { selections } = selectionSet
    const propSelections: graphql.FieldNode[] = selections.filter(
      s => s.kind === 'Field'
    ) as graphql.FieldNode[]
    const props = propSelections.map(s => convertField(s, type, config))
    if (addTypename) {
      props.unshift(
        j.objectTypeProperty(
          j.identifier('__typename'),
          j.stringLiteralTypeAnnotation(type.name, type.name),
          false
        )
      )
    }
    const fragmentSelections: graphql.FragmentSpreadNode[] = selections.filter(
      s => s.kind === 'FragmentSpread'
    ) as graphql.FragmentSpreadNode[]
    const intersects = []
    if (props.length) {
      intersects.push(objectTypeAnnotation(props, config))
    }
    fragmentSelections.forEach(spread => {
      const alias = fragments.get(spread.name.value)
      if (!alias) {
        throw new Error(
          `missing fragment definition named ${spread.name.value}`
        )
      }
      const fragmentType = j.genericTypeAnnotation(alias.id, null)
      intersects.push(
        useReadOnlyTypes ? readOnlyType(fragmentType) : fragmentType
      )
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

  function getAnalyzedField(
    objectType: AnalyzedType,
    fieldName: string
  ): AnalyzedField {
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
    return fieldDef
  }

  function convertField(
    field: graphql.FieldNode,
    type: AnalyzedType,
    config: ConfigDirectives
  ): ObjectTypeProperty {
    const { name, alias, selectionSet, directives } = field
    let typeValue
    const fieldName = name.value
    if (fieldName === '__typename') {
      typeValue = j.stringLiteralTypeAnnotation(type.name, type.name)
    } else {
      const analyzedField = getAnalyzedField(type, fieldName)
      typeValue = convertType(
        analyzedField.type,
        getCombinedConfig(
          config,
          { external: undefined, extract: undefined },
          analyzedField.config,
          getCommentDirectives(field)
        ),
        selectionSet
      )
    }
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
    config: ConfigDirectives,
    selectionSet?: graphql.SelectionSetNode
  ): FlowTypeKind {
    if (type.kind === 'NON_NULL') {
      const { ofType } = type
      if (!ofType) throw new Error('unexpected: NON_NULL type missing ofType')
      return innerConvertType(ofType, config, selectionSet)
    }
    return j.nullableTypeAnnotation(
      innerConvertType(type, config, selectionSet)
    )
  }

  function innerConvertType(
    type: AnalyzedType,
    config: ConfigDirectives,
    selectionSet?: graphql.SelectionSetNode
  ): FlowTypeKind {
    config = getCombinedConfig(type.config, config)
    if (type.kind === graphql.TypeKind.LIST)
      return convertListType(type, config, selectionSet)
    const { name } = type
    const { external } = config
    if (external) return getExternalType(external)
    let { extract: as } = config
    if (as === true) as = name
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
        ),
        as
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
    function convertCustomType(
      type: AnalyzedType,
      selectionSet?: graphql.SelectionSetNode
    ): FlowTypeKind {
      if (types[name]) type = types[name]
      if (type.inputFields) return convertInputType(type, config)
      if (selectionSet) {
        return convertSelectionSet(selectionSet, type, config)
      } else {
        return j.mixedTypeAnnotation()
      }
    }
    return extractIfNecessary(convertCustomType(type, selectionSet), as)
  }

  function convertListType(
    type: AnalyzedType,
    config: ConfigDirectives,
    selectionSet?: graphql.SelectionSetNode
  ): FlowTypeKind {
    config = getCombinedConfig(type.config, config)
    const { ofType } = type
    if (!ofType) throw new Error('LIST type missing ofType')
    return arrayTypeAnnotation(
      convertType(ofType, config, selectionSet),
      config
    )
  }

  function convertInputType(
    type: AnalyzedType,
    config: ConfigDirectives
  ): FlowTypeKind {
    config = getCombinedConfig(type.config, config)
    return objectTypeAnnotation(
      map(type.inputFields, field => convertInputField(field, config)),
      config
    )
  }

  function convertInputField(
    field: AnalyzedInputField,
    config: ConfigDirectives
  ): ObjectTypeProperty {
    config = getCombinedConfig(
      { extract: undefined, external: undefined },
      field.config,
      config
    )
    return j.objectTypeProperty(
      j.identifier(field.name),
      convertType(field.type, config),
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
