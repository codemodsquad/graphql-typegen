import resolveIdentifier from './precompute/resolveIdentifier'
import precomputeExpression from './precompute/precomputeExpression'
import j, {
  TypeAnnotation,
  TypeCastExpression,
  ASTPath,
  Comment,
  VariableDeclarator,
  JSXOpeningElement,
  TaggedTemplateExpression,
  TypeAlias,
  FileInfo,
  API,
  Options,
  TypeParameterInstantiation,
  QualifiedTypeIdentifier,
  GenericTypeAnnotation,
  TSTypeReference,
  TSAsExpression,
  TSTypeAnnotation,
  TSTypeParameterInstantiation,
  TSQualifiedName,
  TSTypeAliasDeclaration,
  CallExpression,
} from 'jscodeshift'
import findImports from 'jscodeshift-find-imports'
import addImports from 'jscodeshift-add-imports'
import generateFlowTypesFromDocument from './generateFlowTypesFromDocument'
import generateTSTypesFromDocument from './generateTSTypesFromDocument'
import * as graphql from 'graphql'
import once from 'lodash/once'
import {
  ExpressionKind,
  FlowTypeKind,
  IdentifierKind,
  PatternKind,
  TSTypeKind,
} from 'ast-types/gen/kinds'
import { Collection } from 'jscodeshift/src/Collection'
import pkgConf from 'pkg-conf'
import { applyConfigDefaults } from './config'
import { AnalyzedSchema } from './analyzeSchema'
import * as path from 'path'
import precomputeError from './precompute/precomputeError'
import { validationRules } from './validationRules'

const PRAGMA = '@graphql-typegen'
const AUTO_GENERATED_COMMENT = ` ${PRAGMA} auto-generated`

export default function graphqlTypegenCore(
  { path: file, source: code }: FileInfo,
  { j }: API,
  options: Options,
  {
    analyzedSchema: schema,
    schema: introspectionSchema,
  }: { analyzedSchema: AnalyzedSchema; schema: graphql.GraphQLSchema }
): string {
  const cwd = path.dirname(file)
  const packageConf = pkgConf.sync('graphql-typegen', {
    cwd,
  })
  if (packageConf?.schemaFile) {
    const packageDir = path.dirname(pkgConf.filepath(packageConf) as any)
    packageConf.schemaFile = path.resolve(
      packageDir,
      packageConf.schemaFile as any
    )
  }
  const config = applyConfigDefaults(Object.assign(packageConf, options))
  const { tagName = 'gql', useFunctionTypeArguments } = config

  const isTS = file.endsWith('.ts') || file.endsWith('.tsx')
  if (file.endsWith('.ts')) j = j.withParser('ts')
  else if (file.endsWith('.tsx')) j = j.withParser('tsx')

  const emptyObjectType = () =>
    isTS ? j.tsTypeLiteral([]) : j.objectTypeAnnotation([])

  const root = j(code)
  const { statement } = j.template

  function precomputeExpressionInGQLTemplateLiteral(
    path: ASTPath<any>
  ): string | number | boolean | null | undefined {
    const { node } = path
    // istanbul ignore next
    if (!node || !node.type) {
      precomputeError(path)
    }
    switch (node.type) {
      case 'TaggedTemplateExpression':
        if (node.tag.type === 'Identifier' && node.tag.name === tagName)
          return precomputeGQLTemplateLiteral(path)
        precomputeError(path)
        break
      case 'Identifier':
        return precomputeExpressionInGQLTemplateLiteral(resolveIdentifier(path))
    }
    return precomputeExpression(path)
  }

  function precomputeGQLTemplateLiteral(
    path: ASTPath<TaggedTemplateExpression>
  ): string {
    const { quasis } = path.node.quasi
    if (quasis.length === 1) return quasis[0].value.cooked

    const parts = []
    let i = 0
    while (i < quasis.length - 1) {
      parts.push(quasis[i].value.cooked)
      const expr = precomputeExpressionInGQLTemplateLiteral(
        path.get('quasi', 'expressions', i)
      )
      parts.push(expr)
      i++
    }
    parts.push(quasis[i].value.cooked)

    return parts.join('')
  }

  const typeAnnotation = (typeAnnotation: FlowTypeKind | TSTypeKind) =>
    isTS
      ? j.tsTypeAnnotation(typeAnnotation as any)
      : j.typeAnnotation(typeAnnotation as any)

  const typeReference = (
    id: IdentifierKind | QualifiedTypeIdentifier | TSQualifiedName,
    typeParameters:
      | TypeParameterInstantiation
      | TSTypeParameterInstantiation
      | null
  ): GenericTypeAnnotation | TSTypeReference => {
    if (
      id.type !== 'TSQualifiedName' &&
      (typeParameters?.type === 'TypeParameterInstantiation' ||
        (typeParameters == null && !isTS))
    ) {
      return j.genericTypeAnnotation(id, typeParameters)
    }
    if (
      id.type !== 'QualifiedTypeIdentifier' &&
      typeParameters?.type !== 'TypeParameterInstantiation'
    ) {
      return j.tsTypeReference(id, typeParameters)
    }
    throw new Error('invalid id or type parameters')
  }

  const typeParameterInstantiation = (
    params: FlowTypeKind[] | TSTypeKind[] | (FlowTypeKind | TSTypeKind)[]
  ) =>
    isTS
      ? j.tsTypeParameterInstantiation(params as any)
      : j.typeParameterInstantiation(params as any)

  function typeCast(
    node: ExpressionKind,
    typeAnnotation: TypeAnnotation | TSTypeAnnotation
  ): TypeCastExpression | TSAsExpression {
    if (typeAnnotation.type === 'TypeAnnotation') {
      if (node.type === 'TypeCastExpression') {
        node.typeAnnotation = typeAnnotation
        return node
      }
      return j.typeCastExpression(node, typeAnnotation)
    } else if (typeAnnotation.type === 'TSTypeAnnotation') {
      const type = typeAnnotation.typeAnnotation
      if (type.type === 'TSTypeAnnotation' || type.type === 'TSTypePredicate')
        throw new Error(`invalid type cast`)
      if (node.type === 'TSAsExpression') {
        node.typeAnnotation = type
        return node
      }
      return j.tsAsExpression.from({ expression: node, typeAnnotation: type })
    }
    throw new Error('invalid typeAnnotation')
  }

  function makeFunctionTypeParameterInstantiation(
    data: TypeAlias | TSTypeAliasDeclaration,
    variables?: TypeAlias | TSTypeAliasDeclaration | null | undefined
  ): TypeParameterInstantiation | TSTypeParameterInstantiation {
    const params: (FlowTypeKind | TSTypeKind)[] = [
      typeReference(j.identifier(data.id.name), null),
    ]
    params.push(
      variables
        ? typeReference(j.identifier(variables.id.name), null)
        : emptyObjectType()
    )
    return typeParameterInstantiation(params)
  }

  const queryRenderPropsAnnotation = (
    data: TypeAlias | TSTypeAliasDeclaration,
    variables?: TypeAlias | TSTypeAliasDeclaration | null | undefined
  ): TypeAnnotation | TSTypeAnnotation => {
    const parameters = [typeReference(j.identifier(data.id.name), null)]
    if (variables) {
      parameters.push(typeReference(j.identifier(variables.id.name), null))
    }
    return typeAnnotation(
      typeReference(
        j.identifier(addQueryRenderProps()),
        typeParameterInstantiation(parameters)
      )
    )
  }

  const queryResultAnnotation = (
    data: TypeAlias | TSTypeAliasDeclaration,
    variables?: TypeAlias | TSTypeAliasDeclaration | null | undefined
  ): TypeAnnotation | TSTypeAnnotation =>
    typeAnnotation(
      typeReference(
        j.identifier(addQueryResult()),
        typeParameterInstantiation([
          typeReference(j.identifier(data.id.name), null),
          variables
            ? typeReference(j.identifier(variables.id.name), null)
            : emptyObjectType(),
        ])
      )
    )

  const mutationResultAnnotation = (
    data: TypeAlias | TSTypeAliasDeclaration
  ): TypeAnnotation | TSTypeAnnotation =>
    typeAnnotation(
      typeReference(
        j.identifier(addMutationResult()),
        typeParameterInstantiation([
          typeReference(j.identifier(data.id.name), null),
        ])
      )
    )

  const mutationFunctionAnnotation = (
    data: TypeAlias | TSTypeAliasDeclaration,
    variables?: TypeAlias | TSTypeAliasDeclaration | null | undefined
  ): TypeAnnotation | TSTypeAnnotation =>
    typeAnnotation(
      typeReference(
        j.identifier(addMutationFunction()),
        typeParameterInstantiation([
          typeReference(j.identifier(data.id.name), null),
          variables
            ? typeReference(j.identifier(variables.id.name), null)
            : emptyObjectType(),
        ])
      )
    )

  const subscriptionResultAnnotation = (
    data: TypeAlias | TSTypeAliasDeclaration
  ): TypeAnnotation | TSTypeAnnotation =>
    typeAnnotation(
      typeReference(
        j.identifier(addSubscriptionResult()),
        typeParameterInstantiation([
          typeReference(j.identifier(data.id.name), null),
        ])
      )
    )

  const findQueryPaths = (root: Collection<any>): ASTPath<any>[] => [
    ...root
      .find(j.TaggedTemplateExpression, { tag: { name: tagName } })
      .paths(),
  ]

  const queryPaths = findQueryPaths(root)

  const addedStatements = new Set()

  const useQuery =
    findImports(root, statement`import {useQuery} from 'react-apollo'`)
      .useQuery ||
    findImports(root, statement`import {useQuery} from '@apollo/react-hooks'`)
      .useQuery

  const useMutation =
    findImports(root, statement`import {useMutation} from 'react-apollo'`)
      .useMutation ||
    findImports(
      root,
      statement`import {useMutation} from '@apollo/react-hooks'`
    ).useMutation

  const useSubscription =
    findImports(root, statement`import {useSubscription} from 'react-apollo'`)
      .useSubscription ||
    findImports(
      root,
      statement`import {useSubscription} from '@apollo/react-hooks'`
    ).useSubscription

  const apolloPkg = [
    '@apollo/react-hooks',
    '@apollo/react-components',
    'react-apollo',
  ].find((pkg) =>
    root.find(j.ImportDeclaration, { source: { value: pkg } }).size()
  )

  const addQueryRenderProps = once(
    () =>
      addImports(
        root,
        statement([`import {type QueryRenderProps} from '${apolloPkg}'`])
      ).QueryRenderProps
  )
  const addQueryResult = once(
    () =>
      addImports(
        root,
        statement([`import {type QueryResult} from '${apolloPkg}'`])
      ).QueryResult
  )
  const addMutationFunction = once(
    () =>
      addImports(
        root,
        statement([`import {type MutationFunction} from '${apolloPkg}'`])
      ).MutationFunction
  )
  const addMutationResult = once(
    () =>
      addImports(
        root,
        statement([`import {type MutationResult} from '${apolloPkg}'`])
      ).MutationResult
  )
  const addSubscriptionResult = once(
    () =>
      addImports(
        root,
        statement([`import {type SubscriptionResult} from '${apolloPkg}'`])
      ).SubscriptionResult
  )
  const generatedTypesForQuery = new Map()

  for (const path of queryPaths) {
    const declarator = j(path).closest(j.VariableDeclarator).nodes()[0]
    const declaratorId = declarator.id
    if (declaratorId.type !== 'Identifier') {
      throw new Error(
        `query must be assigned to an Identifier, but was assigned to a ${declaratorId.type} instead`
      )
    }
    const query = precomputeGQLTemplateLiteral(path)
    if (typeof query === 'symbol') {
      throw new Error(`failed to compute query`)
    }
    const document: graphql.DocumentNode =
      typeof query === 'string' ? graphql.parse(query) : query
    const queryNames = []
    const mutationNames = []
    const subscriptionNames = []
    graphql.visit(document, {
      [graphql.Kind.OPERATION_DEFINITION]({ operation, name }) {
        switch (operation) {
          case 'query':
            if (name) queryNames.push(name.value)
            break
          case 'mutation':
            if (name) mutationNames.push(name.value)
            break
          case 'subscription':
            if (name) subscriptionNames.push(name.value)
            break
        }
      },
    })

    if (config.validate) {
      const errors = graphql.validate(
        introspectionSchema,
        document,
        validationRules
      )
      if (errors.length) {
        throw new Error(errors.map((error) => error.message).join('\n'))
      }
    }

    const {
      statements: types,
      generatedTypes,
      imports,
    } = isTS
      ? generateTSTypesFromDocument({
          file,
          document,
          types: schema,
          getMutationFunction: addMutationFunction,
          config,
          j,
        })
      : (generateFlowTypesFromDocument({
          file,
          document,
          types: schema,
          getMutationFunction: addMutationFunction,
          config,
          j,
        }) as any as ReturnType<typeof generateTSTypesFromDocument>)
    generatedTypesForQuery.set(declaratorId.name, generatedTypes)

    if (imports.length) addImports(root, imports)

    for (const type of types) {
      if (!type.comments) type.comments = []
      type.comments.push(j.commentLine(AUTO_GENERATED_COMMENT))
      const {
        id: { name },
      } = type
      const existing = isTS
        ? root.find(j.TSTypeAliasDeclaration, { id: { name } }).at(0)
        : root.find(j.TypeAlias, { id: { name } }).at(0)
      const parent = j(path).closest(j.ExportNamedDeclaration)
      if (existing.size() > 0) {
        existing.replaceWith(type)
        addedStatements.add(type)
        const parentExport = existing
          .closest(j.ExportNamedDeclaration)
          .nodes()[0]
        if (parentExport) {
          // without this, output is "export type type ..."
          delete (parentExport as any).exportKind
          addedStatements.add(parentExport)
          parentExport.comments = type.comments
          type.comments = []
        }
      } else if (parent.size()) {
        const exportDecl = j.exportNamedDeclaration(type, [], null)
        exportDecl.comments = type.comments
        type.comments = []
        parent.at(0).insertAfter(exportDecl)
        addedStatements.add(type)
        addedStatements.add(exportDecl)
      } else {
        j(path).closest(j.Statement).at(0).insertAfter(type)
        addedStatements.add(type)
      }
    }

    ///////////////////////////////////////////////
    // Add types to <Query> element child functions

    if (queryNames.length) {
      const Query =
        findImports(root, statement`import {Query} from 'react-apollo'`)
          .Query ||
        findImports(
          root,
          statement`import {Query} from '@apollo/react-components'`
        ).Query

      root
        .find(j.JSXOpeningElement, { name: { name: Query } })
        .forEach((path: ASTPath<JSXOpeningElement>): void => {
          const queryAttr = j(path)
            .find(j.JSXAttribute, {
              name: { name: 'query' },
              value: { expression: { name: declaratorId.name } },
            })
            .at(0)
          if (!queryAttr.size()) return

          const variablesAttr = j(path)
            .find(j.JSXAttribute, { name: { name: 'variables' } })
            .at(0)
          if (variablesAttr.size()) {
            const variablesValue = variablesAttr
              .find(j.JSXExpressionContainer)
              .get('expression')
            const { variables } = onlyValue(generatedTypes.query) || {}
            if (variables && variablesValue.value.type === 'ObjectExpression') {
              variablesValue.replace(
                typeCast(
                  variablesValue.value,
                  typeAnnotation(
                    typeReference(j.identifier(variables.id.name), null)
                  )
                )
              )
            }
          }

          const elementPath = path.parentPath
          const childFunction = getChildFunction(elementPath)
          if (childFunction) {
            const firstParam: ASTPath<PatternKind> = childFunction.get(
              'params',
              0
            )
            const { data, variables } = onlyValue(generatedTypes.query) || {}
            if (!data) return
            if (
              firstParam.node &&
              (firstParam.node.type === 'Identifier' ||
                firstParam.node.type === 'ObjectPattern')
            ) {
              firstParam.node.typeAnnotation = queryRenderPropsAnnotation(
                data,
                variables
              )
            }
          }
        })
    }

    //////////////////////////////////////////////////
    // Add types to <Mutation> element child functions

    if (mutationNames.length) {
      const Mutation =
        findImports(root, statement`import {Mutation} from 'react-apollo'`)
          .Mutation ||
        findImports(
          root,
          statement`import {Mutation} from '@apollo/react-components'`
        ).Mutation
      root
        .find(j.JSXOpeningElement, { name: { name: Mutation } })
        .forEach((path: ASTPath<JSXOpeningElement>): void => {
          const mutationAttr = j(path)
            .find(j.JSXAttribute, {
              name: { name: 'mutation' },
              value: { expression: { name: declaratorId.name } },
            })
            .at(0)
          if (!mutationAttr.size()) return

          const elementPath = path.parentPath
          const childFunction = getChildFunction(elementPath)
          if (childFunction) {
            const firstParam = childFunction.get('params', 0)
            const { data, variables, mutationFunction } =
              onlyValue(generatedTypes.mutation) || {}
            if (!data) return
            if (firstParam && firstParam.node.type === 'Identifier') {
              firstParam.node.typeAnnotation = mutationFunction
                ? typeAnnotation(
                    typeReference(j.identifier(mutationFunction.id.name), null)
                  )
                : mutationFunctionAnnotation(data, variables)
            }
          }
        })
    }

    const setTypeParameters = (
      node: CallExpression,
      params: TypeParameterInstantiation | TSTypeParameterInstantiation
    ) => {
      if (isTS) (node as any).typeParameters = params
      else (node as any).typeArguments = params
    }

    //////////////////////////////////////////////////
    // Add types to useQuery hooks

    if (useQuery && queryNames.length) {
      root
        .find(j.VariableDeclarator, {
          init: {
            type: 'CallExpression',
            callee: {
              type: 'Identifier',
              name: useQuery,
            },
            arguments: [{ type: 'Identifier', name: declaratorId.name }],
          },
        })
        .forEach((path: ASTPath<VariableDeclarator>): void => {
          const { data, variables } = onlyValue(generatedTypes.query) || {}
          if (!data || path.node.init?.type !== 'CallExpression') return
          if (useFunctionTypeArguments) {
            setTypeParameters(
              path.node.init,
              makeFunctionTypeParameterInstantiation(data, variables)
            )
          } else {
            if (
              path.node.id.type === 'Identifier' ||
              path.node.id.type === 'ObjectPattern'
            ) {
              path.node.id.typeAnnotation = queryResultAnnotation(
                data,
                variables
              )
            }
            const options = path.node.init.arguments[1]
            if (variables && options && options.type === 'ObjectExpression') {
              const variablesProp = options.properties.find(
                (p) =>
                  p.type !== 'SpreadProperty' &&
                  p.type !== 'SpreadElement' &&
                  p.key.type === 'Identifier' &&
                  p.key.name === 'variables'
              )
              if (
                variablesProp &&
                variablesProp.type !== 'ObjectMethod' &&
                variablesProp.type !== 'SpreadElement' &&
                variablesProp.type !== 'SpreadProperty'
              ) {
                variablesProp.value = typeCast(
                  variablesProp.value as ExpressionKind,
                  typeAnnotation(
                    typeReference(j.identifier(variables.id.name), null)
                  )
                )
              }
            }
          }
        })
    }

    //////////////////////////////////////////////////
    // Add types to useMutation hooks

    if (useMutation && mutationNames.length) {
      root
        .find(j.VariableDeclarator, {
          init: {
            type: 'CallExpression',
            callee: {
              type: 'Identifier',
              name: useMutation,
            },
            arguments: [{ type: 'Identifier', name: declaratorId.name }],
          },
        })
        .forEach((path: ASTPath<VariableDeclarator>): void => {
          const { data, variables, mutationFunction } =
            onlyValue(generatedTypes.mutation) || {}
          if (!data) return
          const {
            node: { id },
          } = path
          if (
            useFunctionTypeArguments &&
            path.node.init?.type === 'CallExpression'
          ) {
            setTypeParameters(
              path.node.init,
              makeFunctionTypeParameterInstantiation(data, variables)
            )
          } else {
            if (!mutationFunction) return
            if (id.type !== 'ArrayPattern' && id.type !== 'Identifier') return
            const tupleTypes: (FlowTypeKind | TSTypeKind)[] = [
              typeReference(j.identifier(mutationFunction.id.name), null),
            ]
            if (data && id.type === 'ArrayPattern' && id.elements.length > 1) {
              const resultType = mutationResultAnnotation(data).typeAnnotation
              if (
                resultType.type === 'TSTypeAnnotation' ||
                resultType.type === 'TSTypePredicate'
              ) {
                throw new Error('unsupported TSTypeAnnotation.typeAnnotation')
              }
              tupleTypes.push(resultType)
            }
            // https://github.com/benjamn/ast-types/issues/372
            ;(id as any).typeAnnotation = typeAnnotation(
              isTS
                ? j.tsTupleType(tupleTypes as any)
                : j.tupleTypeAnnotation(tupleTypes as any)
            )
          }
        })
    }

    //////////////////////////////////////////////////
    // Add types to useSubscription hooks

    if (useSubscription && subscriptionNames.length) {
      root
        .find(j.VariableDeclarator, {
          init: {
            type: 'CallExpression',
            callee: {
              type: 'Identifier',
              name: useSubscription,
            },
            arguments: [{ type: 'Identifier', name: declaratorId.name }],
          },
        })
        .forEach((path: ASTPath<VariableDeclarator>): void => {
          const { data, variables } =
            onlyValue(generatedTypes.subscription) || {}
          if (!data || path.node.init?.type !== 'CallExpression') return
          if (useFunctionTypeArguments) {
            setTypeParameters(
              path.node.init,
              makeFunctionTypeParameterInstantiation(data, variables)
            )
          } else {
            if (
              path.node.id.type === 'Identifier' ||
              path.node.id.type === 'ObjectPattern'
            ) {
              path.node.id.typeAnnotation = subscriptionResultAnnotation(data)
            }
            if (path.node.init?.type !== 'CallExpression') return
            const options = path.node.init.arguments[1]
            if (variables && options && options.type === 'ObjectExpression') {
              const variablesProp = options.properties.find(
                (p) =>
                  p.type !== 'SpreadElement' &&
                  p.type !== 'SpreadProperty' &&
                  p.key.type === 'Identifier' &&
                  p.key.name === 'variables'
              )
              if (
                variablesProp &&
                variablesProp.type !== 'SpreadElement' &&
                variablesProp.type !== 'SpreadProperty' &&
                variablesProp.type !== 'ObjectMethod'
              ) {
                variablesProp.value = typeCast(
                  variablesProp.value as ExpressionKind,
                  typeAnnotation(
                    typeReference(j.identifier(variables.id.name), null)
                  )
                )
              }
            }
          }
        })
    }
  }

  function isStale(path: ASTPath<any>): boolean {
    const { node } = path
    if (addedStatements.has(node)) return false
    if (!node.comments) return false
    return (
      node.comments.findIndex(
        (comment: Comment): boolean =>
          comment.value.trim().toLowerCase() ===
          AUTO_GENERATED_COMMENT.trim().toLowerCase()
      ) >= 0
    )
  }

  if (isTS) root.find(j.TSTypeAliasDeclaration).filter(isStale).remove()
  else root.find(j.TypeAlias).filter(isStale).remove()
  root.find(j.ExportNamedDeclaration).filter(isStale).remove()

  return root.toSource()
}

function onlyValue<V>(obj: Record<any, V>): V | undefined {
  const values = Object.values(obj)
  if (values.length !== 1) return undefined
  return values[0]
}

function getChildFunction(elementPath: ASTPath<any>): ASTPath<any> | null {
  const childFunctionContainer = j(elementPath)
    .find(j.JSXExpressionContainer)
    .filter(
      (path) =>
        path.parentPath && path.parentPath.parentPath.node === elementPath.node
    )
    .at(0)
  if (childFunctionContainer.size()) {
    if (childFunctionContainer.get('expression', 'params').value) {
      return childFunctionContainer.get('expression')
    }
    return null
  }
  return null
}
