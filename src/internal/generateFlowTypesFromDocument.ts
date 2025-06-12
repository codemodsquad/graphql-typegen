import * as path from 'path'
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
import {
  TypeAlias,
  ObjectTypeProperty,
  GenericTypeAnnotation,
  ImportDeclaration,
  JSCodeshift,
  ObjectTypeSpreadProperty,
} from 'jscodeshift'
import { FlowTypeKind } from 'ast-types/gen/kinds'
import { Config, applyConfigDefaults, ObjectType } from './config'
import { ConfigDirectives, External } from './getConfigDirectives'
import getCommentDirectives from './getCommentDirectives'
import readOnlyType from './readOnlyType'
import simplifyIntersection from './simplifyIntersection'

type GeneratedQueryType = {
  variables?: TypeAlias
  data?: TypeAlias
}

type GeneratedMutationType = {
  variables?: TypeAlias
  data?: TypeAlias
  mutationFunction?: TypeAlias
}

type GeneratedTypes = {
  query: Record<string, GeneratedQueryType>
  mutation: Record<string, GeneratedMutationType>
  subscription: Record<string, GeneratedQueryType>
  fragment: Record<string, TypeAlias>
}

export default function generateFlowTypesFromDocument({
  document,
  file,
  types,
  config: _config,
  getMutationFunction,
  j,
}: {
  document: graphql.DocumentNode
  file: string
  types: { [K in string]?: AnalyzedType }
  config: Config
  getMutationFunction: () => string
  j: JSCodeshift
}): {
  statements: TypeAlias[]
  generatedTypes: GeneratedTypes
  imports: ImportDeclaration[]
} {
  const cwd = path.dirname(file)
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { statement } = j.template
  const config = applyConfigDefaults(_config)

  const MutationFunction = once(getMutationFunction)

  const getType = (name: graphql.NameNode): AnalyzedType => {
    const type = types[name.value]
    if (!type) throw new Error(`unknown type: ${name.value}`)
    return type
  }

  function getCombinedConfig(
    ...args: (
      | Partial<{
          external: External | null | undefined
          extract: string | true | null | undefined
          objectType: ObjectType | undefined
          useReadOnlyTypes: boolean | undefined
          addTypename: boolean | undefined
        }>
      | null
      | undefined
    )[]
  ): ConfigDirectives {
    let { objectType, useReadOnlyTypes, addTypename } = config
    let external: External | undefined = undefined
    let extract: string | true | undefined = undefined
    for (const arg of args) {
      if (!arg) continue
      if (arg.objectType != null) objectType = arg.objectType
      if (arg.useReadOnlyTypes != null) useReadOnlyTypes = arg.useReadOnlyTypes
      if (arg.addTypename != null) addTypename = arg.addTypename
      if (arg.external !== undefined) external = arg.external ?? undefined
      if (arg.extract !== undefined) extract = arg.extract ?? undefined
    }
    return {
      objectType,
      useReadOnlyTypes,
      addTypename,
      extract,
      external,
      ignoreData: undefined,
      ignoreVariables: undefined,
    }
  }

  const getExternalType = memoize((external: External): FlowTypeKind => {
    if (typeof external === 'string') {
      return j
        .withParser('babylon')(
          `// @flow
        type __T = ${external};`
        )
        .find(j.TypeAlias)
        .nodes()[0].right
    } else {
      let parsed
      try {
        parsed = statement([external.import])
      } catch (error: any) {
        throw new Error(
          `invalid import declaration: ${external.import} (${error.message})`
        )
      }
      if (parsed.type !== 'ImportDeclaration') {
        throw new Error(`invalid import declaration: ${external.import}`)
      }
      const decl: ImportDeclaration = parsed
      const source = decl.source.value
      if (typeof source === 'string' && /^[./]/.test(source)) {
        decl.source.value = path.relative(
          cwd,
          path.resolve(external.cwd, source)
        )
        if (!decl.source.value.startsWith('.'))
          decl.source.value = `./${decl.source.value}`
      }

      if (decl.specifiers.length !== 1) {
        throw new Error(
          `import declaration must have only one specifier: ${external.import}`
        )
      }
      const identifier = decl.specifiers[0].local?.name
      if (!identifier) {
        throw new Error(
          `unable to determine imported identifier: ${external.import}`
        )
      }
      imports.push(parsed)

      return j.genericTypeAnnotation(j.identifier(identifier), null)
    }
  })

  const typeAliasCounts: Record<string, number> = {}

  function addTypeAlias(name: string, type: FlowTypeKind): TypeAlias {
    let count = typeAliasCounts[name]
    if (count != null) {
      typeAliasCounts[name] = ++count
      name += String(count)
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

  const strippedFileName =
    file ? path.basename(file).replace(/\..+$/, '') : null

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
      { external: null, extract: null },
      getCommentDirectives(def, cwd)
    )
    let { extract } = config

    const type = convertSelectionSet(
      def.selectionSet,
      getType(def.typeCondition.name),
      config
    )
    if (typeof extract !== 'string') {
      extract = upperFirst(def.name.value)
    }
    const alias = addTypeAlias(extract, type)
    generatedTypes.fragment[def.name.value] = alias
    fragments.set(def.name.value, alias)
  }

  function convertOperationDefinition(
    def: graphql.OperationDefinitionNode
  ): void {
    const ownDirectives = getCommentDirectives(def, cwd)
    const { ignoreData, ignoreVariables } = ownDirectives
    if (ignoreData && ignoreVariables) return

    const { operation, selectionSet, variableDefinitions } = def
    const config = getCombinedConfig(
      { external: null, extract: null },
      ownDirectives
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
    if (operation === 'query' || operation === 'subscription') {
      const operationTypes: GeneratedQueryType =
        def.name ? (generatedTypes[operation][def.name.value] = {}) : {}
      if (!ignoreData) {
        const opTypeName = upperFirst(operation)
        const type = types[opTypeName]
        if (!type) {
          throw new Error(`missing ${opTypeName} type`)
        }
        operationTypes.data = addTypeAlias(
          `${name}Data`,
          convertSelectionSet(selectionSet, type, config)
        )
      }
      if (
        !ignoreVariables &&
        variableDefinitions &&
        variableDefinitions.length
      ) {
        operationTypes.variables = addTypeAlias(
          `${name}Variables`,
          convertVariableDefinitions(variableDefinitions, config)
        )
      }
    } else if (operation === 'mutation') {
      const operationTypes: GeneratedMutationType =
        def.name ? (generatedTypes[operation][def.name.value] = {}) : {}

      let data, variables

      if (!ignoreData) {
        const opTypeName = upperFirst(operation)
        const type = types[opTypeName]
        if (!type) {
          throw new Error(`missing ${opTypeName} type`)
        }
        const _data = addTypeAlias(
          `${name}Data`,
          convertSelectionSet(selectionSet, type, config)
        )
        data = _data
        operationTypes.data = _data
      }
      if (
        !ignoreVariables &&
        variableDefinitions &&
        variableDefinitions.length
      ) {
        const _variables = addTypeAlias(
          `${name}Variables`,
          convertVariableDefinitions(variableDefinitions, config)
        )
        variables = _variables
        operationTypes.variables = _variables
      }
      if (data && variables && !_config.useFunctionTypeArguments) {
        const mutationFunction = statement([
          `type ${name}Function = ${MutationFunction()}<${data.id.name}${
            variables ? `, ${variables.id.name}` : ''
          }>`,
        ])
        operationTypes.mutationFunction = mutationFunction
        statements.push(mutationFunction)
      }
    }
  }

  function convertVariableDefinitions(
    variableDefinitions: readonly graphql.VariableDefinitionNode[],
    config: ConfigDirectives
  ): FlowTypeKind {
    const props = variableDefinitions.map((def) =>
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
      { external: null, extract: null },
      getCommentDirectives(def, cwd)
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
    config = getCombinedConfig(config, getCommentDirectives(type, cwd))
    switch (type.kind) {
      case 'NamedType':
        return convertVariableTypeName(type.name, config)
      case 'ListType':
        return arrayTypeAnnotation(
          convertVariableType(type.type, config),
          config
        )
    }
  }

  function convertVariableTypeName(
    name: graphql.NameNode,
    config: ConfigDirectives
  ): FlowTypeKind {
    switch (name.value) {
      case 'Boolean':
        return j.booleanTypeAnnotation()
      case 'Int':
      case 'Float':
        return j.numberTypeAnnotation()
      case 'ID':
      case 'String':
        return j.stringTypeAnnotation()
    }
    const type = getType(name)
    config = getCombinedConfig(type.config, config)

    const { external } = config
    if (external) return getExternalType(external)
    let { extract: as } = config
    if (as === true) as = name.value

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
    config = getCombinedConfig(
      { external: null, extract: null },
      type?.config,
      config
    )
    if (type && type.inputFields)
      return extractIfNecessary(convertInputType(type, config), as)
    return extractIfNecessary(j.mixedTypeAnnotation(), as)
  }

  function getFragmentType(fragmentName: string): AnalyzedType {
    for (const def of document.definitions) {
      if (
        def.kind === 'FragmentDefinition' &&
        def.name.value === fragmentName
      ) {
        return getType(def.typeCondition.name)
      }
    }
    throw new Error(`failed to find fragment: ${fragmentName}`)
  }

  function convertUnionSelectionSet(
    selectionSet: graphql.SelectionSetNode,
    type: AnalyzedType,
    config: ConfigDirectives
  ): FlowTypeKind {
    config = getCombinedConfig(config, type.config)
    const { selections } = selectionSet

    const { possibleTypes } = type
    if (!possibleTypes) {
      throw new Error(`missing possibleTypes for union type: ${type.name}`)
    }
    const unions = []
    for (const possibleType of possibleTypes) {
      const applicableSelections = selections.filter(
        (selection: graphql.SelectionNode): boolean => {
          let selectionName: string
          switch (selection.kind) {
            case 'FragmentSpread': {
              selectionName = getFragmentType(selection.name.value).name
              break
            }
            case 'InlineFragment': {
              const { typeCondition } = selection
              if (!typeCondition) return true
              selectionName = typeCondition.name.value
              break
            }
            default:
              return false
          }
          return (
            possibleType.name === selectionName ||
            (possibleType.interfaces || []).find(
              (t) => t.name === selectionName
            ) != null
          )
        }
      )
      unions.push(
        convertSelectionSet(
          {
            kind: 'SelectionSet',
            selections: applicableSelections,
          },
          possibleType,
          config
        )
      )
    }
    return j.unionTypeAnnotation(unions)
  }

  function convertInterfaceSelectionSet(
    selectionSet: graphql.SelectionSetNode,
    type: AnalyzedType,
    config: ConfigDirectives
  ): FlowTypeKind {
    config = getCombinedConfig(config, type.config)
    const { selections } = selectionSet

    const { possibleTypes } = type
    if (!possibleTypes) {
      throw new Error(`missing possibleTypes for union type: ${type.name}`)
    }
    const foundTypes = possibleTypes.filter((possibleType) =>
      selections.find((selection: graphql.SelectionNode): boolean => {
        let selectionName: string
        switch (selection.kind) {
          case 'FragmentSpread': {
            selectionName = getFragmentType(selection.name.value).name
            break
          }
          case 'InlineFragment': {
            const { typeCondition } = selection
            if (!typeCondition) return false
            selectionName = typeCondition.name.value
            break
          }
          default:
            return false
        }
        return possibleType.name === selectionName
      })
    )
    const restTypes = new Set(possibleTypes)
    foundTypes.forEach((type) => restTypes.delete(type))

    const unions = []
    for (const possibleType of foundTypes) {
      const applicableSelections = selections.filter(
        (selection: graphql.SelectionNode): boolean => {
          let selectionName: string
          switch (selection.kind) {
            case 'Field':
              return true
            case 'FragmentSpread': {
              selectionName = getFragmentType(selection.name.value).name
              break
            }
            case 'InlineFragment': {
              const { typeCondition } = selection
              if (!typeCondition) return true
              selectionName = typeCondition.name.value
              break
            }
            default:
              return false
          }
          return possibleType.name === selectionName
        }
      )
      unions.push(
        convertSelectionSet(
          {
            kind: 'SelectionSet',
            selections: applicableSelections,
          },
          possibleType,
          config
        )
      )
    }
    if (restTypes.size) {
      const applicableSelections = selections.filter(
        (selection: graphql.SelectionNode): boolean => {
          switch (selection.kind) {
            case 'Field':
              return true
            case 'InlineFragment':
              return (
                !selection.typeCondition ||
                selection.typeCondition.name.value === type.name
              )
            case 'FragmentSpread':
              return getFragmentType(selection.name.value).name === type.name
          }
        }
      )

      unions.push(
        convertInterfaceRestSelectionSet(
          {
            kind: 'SelectionSet',
            selections: applicableSelections,
          },
          type,
          [...restTypes],
          config
        )
      )
    }
    return unions.length === 1 ? unions[0] : j.unionTypeAnnotation(unions)
  }

  const hasTypename = (type: FlowTypeKind): boolean => {
    switch (type.type) {
      case 'ObjectTypeAnnotation':
        return (
          type.properties.find(
            (p) =>
              p.type === 'ObjectTypeProperty' &&
              p.key.type === 'Identifier' &&
              p.key.name === '__typename'
          ) != null
        )
      case 'GenericTypeAnnotation':
        if (type.id.type === 'Identifier') {
          const alias = fragments.get(type.id.name)
          if (alias) return hasTypename(alias.right)
        }
        return false
      case 'IntersectionTypeAnnotation':
        return type.types.every(hasTypename)
      default:
        return false
    }
  }

  function convertInlineFragmentSelectionSet(
    inlineFragment: graphql.InlineFragmentNode,
    type: AnalyzedType,
    config: ConfigDirectives
  ): FlowTypeKind {
    config = getCombinedConfig(
      config,
      { extract: null, external: null },
      type.config,
      getCommentDirectives(inlineFragment, cwd)
    )
    let { extract: as } = config
    if (as === true) as = type.name
    return extractIfNecessary(
      convertSelectionSet(inlineFragment.selectionSet, type, config),
      as
    )
  }

  function convertInterfaceRestSelectionSet(
    selectionSet: graphql.SelectionSetNode,
    type: AnalyzedType,
    restTypes: AnalyzedType[],
    config: ConfigDirectives
  ): FlowTypeKind {
    config = getCombinedConfig(config, type.config)
    const { addTypename, useReadOnlyTypes } = config
    const { selections } = selectionSet

    const props: ObjectTypeProperty[] = []
    const intersects: FlowTypeKind[] = []

    for (const selection of selections) {
      switch (selection.kind) {
        case 'Field': {
          props.push(convertField(selection, type, config))
          break
        }
        case 'FragmentSpread': {
          const alias = fragments.get(selection.name.value)
          if (!alias) {
            throw new Error(
              `missing fragment definition named ${selection.name.value}`
            )
          }
          const fragmentType = j.genericTypeAnnotation(alias.id, null)
          intersects.push(
            useReadOnlyTypes ? readOnlyType(fragmentType) : fragmentType
          )
          break
        }
        case 'InlineFragment': {
          if (selection.typeCondition?.name?.value === type.name) {
            intersects.push(
              convertInlineFragmentSelectionSet(selection, type, config)
            )
          }
          break
        }
      }
    }
    if (addTypename && !intersects.some(hasTypename)) {
      props.unshift(
        j.objectTypeProperty(
          j.identifier('__typename'),
          j.unionTypeAnnotation(
            restTypes.map((type) =>
              j.stringLiteralTypeAnnotation(type.name, type.name)
            )
          ),
          false
        )
      )
    }
    if (props.length) {
      intersects.unshift(objectTypeAnnotation(props, config))
    }

    return intersects.length === 1 ?
        intersects[0]
      : simplifyIntersection(intersects)
  }

  function convertObjectSelectionSet(
    selectionSet: graphql.SelectionSetNode,
    type: AnalyzedType,
    config: ConfigDirectives
  ): FlowTypeKind {
    config = getCombinedConfig(config, type.config)
    const { addTypename, useReadOnlyTypes } = config
    const { selections } = selectionSet

    const props: (ObjectTypeProperty | ObjectTypeSpreadProperty)[] = []
    const intersects: FlowTypeKind[] = []

    for (const selection of selections) {
      switch (selection.kind) {
        case 'Field': {
          props.push(convertField(selection, type, config))
          break
        }
        case 'FragmentSpread': {
          const alias = fragments.get(selection.name.value)
          if (!alias) {
            throw new Error(
              `missing fragment definition named ${selection.name.value}`
            )
          }
          const fragmentType = j.genericTypeAnnotation(alias.id, null)
          intersects.push(
            useReadOnlyTypes ? readOnlyType(fragmentType) : fragmentType
          )
          break
        }
        case 'InlineFragment': {
          if (
            !selection.typeCondition ||
            selection.typeCondition.name.value === type.name ||
            (type.interfaces || []).some(
              (type) => selection.typeCondition?.name.value === type.name
            )
          ) {
            intersects.push(
              convertInlineFragmentSelectionSet(selection, type, config)
            )
          }
          break
        }
      }
    }
    if (addTypename && !intersects.some(hasTypename)) {
      props.unshift(
        j.objectTypeProperty(
          j.identifier('__typename'),
          j.stringLiteralTypeAnnotation(type.name, type.name),
          false
        )
      )
    }
    if (props.length) {
      intersects.unshift(objectTypeAnnotation(props, config))
    }

    return intersects.length === 1 ?
        intersects[0]
      : simplifyIntersection(intersects)
  }

  function convertSelectionSet(
    selectionSet: graphql.SelectionSetNode,
    type: AnalyzedType,
    config: ConfigDirectives
  ): FlowTypeKind {
    config = getCombinedConfig(config, type.config)
    const { useReadOnlyTypes } = config

    const { selections } = selectionSet

    if (selections.length === 1 && selections[0].kind === 'FragmentSpread') {
      const alias = fragments.get(selections[0].name.value)
      if (!alias) {
        throw new Error(
          `missing fragment definition named ${selections[0].name.value}`
        )
      }
      const fragmentType = j.genericTypeAnnotation(alias.id, null)
      return useReadOnlyTypes ? readOnlyType(fragmentType) : fragmentType
    }

    switch (type.kind) {
      case graphql.TypeKind.UNION:
        return convertUnionSelectionSet(selectionSet, type, config)
      case graphql.TypeKind.INTERFACE:
        return convertInterfaceSelectionSet(selectionSet, type, config)
      case graphql.TypeKind.OBJECT:
        return convertObjectSelectionSet(selectionSet, type, config)
      default:
        throw new Error(`invalid type for selection set: ${type.kind}`)
    }
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
  ${map(fields, (f) => f.name).join('\n  ')}`
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
          { external: null, extract: null },
          analyzedField.config,
          getCommentDirectives(field, cwd)
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
    const fieldConfig = { ...config, extract: undefined }
    return objectTypeAnnotation(
      map(type.inputFields, (field) => convertInputField(field, fieldConfig)),
      config
    )
  }

  function convertInputField(
    field: AnalyzedInputField,
    config: ConfigDirectives
  ): ObjectTypeProperty {
    config = getCombinedConfig(
      { extract: null, external: null },
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
    if (def.kind === 'FragmentDefinition') convertDefinition(def)
  }
  for (const def of document.definitions) {
    if (def.kind !== 'FragmentDefinition') convertDefinition(def)
  }

  return { statements, generatedTypes, imports }
}
