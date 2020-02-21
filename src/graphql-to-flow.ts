import resolveIdentifier from './precompute/resolveIdentifier'
import FAIL from './precompute/FAIL'
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
} from 'jscodeshift'
import findImports from 'jscodeshift-find-imports'
import addImports from 'jscodeshift-add-imports'
import generateFlowTypesFromDocument from './generateFlowTypesFromDocument'
import * as graphql from 'graphql'
import once from 'lodash/once'
import { ExpressionKind, FlowTypeKind } from 'ast-types/gen/kinds'
import chooseJSCodeshiftParser from 'jscodeshift-choose-parser'
import { Collection } from 'jscodeshift/src/Collection'
import pkgConf from 'pkg-conf'
import { applyConfigDefaults } from './config'
import { analyzeSchemaSync } from './analyzeSchema'
import * as path from 'path'

const { statement } = j.template

const PRAGMA = '@graphql-to-flow'
const AUTO_GENERATED_COMMENT = ` ${PRAGMA} auto-generated`

function regex(
  s: string,
  rx: RegExp,
  callback: (match: RegExpExecArray) => any
): void {
  const match = rx.exec(s)
  if (match) callback(match)
}

function typeCast(
  node: ExpressionKind,
  typeAnnotation: TypeAnnotation
): TypeCastExpression {
  if (node.type === 'TypeCastExpression') {
    node.typeAnnotation = typeAnnotation
    return node
  }
  return j.typeCastExpression(node, typeAnnotation)
}

module.exports = function graphqlToFlow(
  { path: file, source: code }: FileInfo,
  { j }: API,
  options: Options
): string {
  const packageConf = pkgConf.sync('graphql-to-flow', {
    cwd: path.dirname(file),
  })
  if (packageConf?.schemaFile) {
    const packageDir = path.dirname(pkgConf.filepath(packageConf) as any)
    packageConf.schemaFile = path.resolve(
      packageDir,
      packageConf.schemaFile as any
    )
  }
  const config = applyConfigDefaults(Object.assign(packageConf, options))
  const { schemaFile, server } = config
  const analyzedSchema = analyzeSchemaSync({ schemaFile, server })

  const parser = chooseJSCodeshiftParser(file)
  if (parser) j = j.withParser(parser)
  const root = j(code)
  const gql =
    findImports(root, statement`import gql from 'graphql-tag'`).gql || 'gql'

  function precomputeExpressionInGQLTemplateLiteral(
    path: ASTPath<any> | typeof FAIL
  ): string | number | boolean | null | undefined | typeof FAIL {
    if (typeof path === 'symbol') {
      if (path === FAIL) return FAIL
      throw new Error(`invalid path: ${String(path)}`)
    }
    const { node } = path
    if (!node || !node.type) {
      return FAIL
    }
    switch (node.type) {
      case 'TaggedTemplateExpression':
        return node.tag.type === 'Identifier' && node.tag.name === gql
          ? precomputeGQLTemplateLiteral(path)
          : FAIL
      case 'Identifier':
        return precomputeExpressionInGQLTemplateLiteral(resolveIdentifier(path))
    }
    return precomputeExpression(path)
  }

  function precomputeGQLTemplateLiteral(
    path: ASTPath<TaggedTemplateExpression>
  ): string | typeof FAIL {
    const { quasis } = path.node.quasi
    if (quasis.length === 1) return quasis[0].value.cooked

    const parts = []
    let i = 0
    while (i < quasis.length - 1) {
      parts.push(quasis[i].value.cooked)
      const expr = precomputeExpressionInGQLTemplateLiteral(
        path.get('quasi', 'expressions', i)
      )
      if (expr === FAIL) return FAIL
      parts.push(expr)
      i++
    }
    parts.push(quasis[i].value.cooked)

    return parts.join('')
  }

  const addQueryRenderProps = once(
    () =>
      addImports(
        root,
        statement`import {type QueryRenderProps} from 'react-apollo'`
      ).QueryRenderProps
  )
  const addMutationFunction = once(
    () =>
      addImports(
        root,
        statement`import {type MutationFunction} from 'react-apollo'`
      ).MutationFunction
  )
  const addMutationResult = once(
    () =>
      addImports(
        root,
        statement`import {type MutationResult} from 'react-apollo'`
      ).MutationResult
  )
  const addSubscriptionResult = once(
    () =>
      addImports(
        root,
        statement`import {type SubscriptionResult} from 'react-apollo'`
      ).SubscriptionResult
  )

  const queryRenderPropsAnnotation = (
    data: TypeAlias,
    variables?: TypeAlias | null | undefined
  ): TypeAnnotation => {
    const parameters = [
      j.genericTypeAnnotation(j.identifier(data.id.name), null),
    ]
    if (variables) {
      parameters.push(
        j.genericTypeAnnotation(j.identifier(variables.id.name), null)
      )
    }
    return j.typeAnnotation(
      j.genericTypeAnnotation(
        j.identifier(addQueryRenderProps()),
        j.typeParameterInstantiation(parameters)
      )
    )
  }

  const mutationResultAnnotation = (data: TypeAlias): TypeAnnotation =>
    j.typeAnnotation(
      j.genericTypeAnnotation(
        j.identifier(addMutationResult()),
        j.typeParameterInstantiation([
          j.genericTypeAnnotation(j.identifier(data.id.name), null),
        ])
      )
    )

  const subscriptionResultAnnotation = (
    data: TypeAlias,
    variables?: TypeAlias | null | undefined
  ): TypeAnnotation => {
    const parameters = [
      j.genericTypeAnnotation(j.identifier(data.id.name), null),
    ]
    if (variables) {
      parameters.push(
        j.genericTypeAnnotation(j.identifier(variables.id.name), null)
      )
    }
    return j.typeAnnotation(
      j.genericTypeAnnotation(
        j.identifier(addSubscriptionResult()),
        j.typeParameterInstantiation(parameters)
      )
    )
  }

  const findQueryPaths = (root: Collection<any>): ASTPath<any>[] => [
    ...root
      .find(j.TaggedTemplateExpression, { tag: { name: gql } })
      .paths()
      .filter((path: ASTPath<TaggedTemplateExpression>): boolean => {
        for (const pragma of getPragmas(path)) {
          if (pragma.trim() === 'ignore') return false
        }
        return true
      }),
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

  const generatedTypesForQuery = new Map()

  for (const path of queryPaths) {
    const declarator = j(path)
      .closest(j.VariableDeclarator)
      .nodes()[0]
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
    const queryAST = typeof query === 'string' ? graphql.parse(query) : query
    const queryNames = []
    const mutationNames = []
    const subscriptionNames = []
    graphql.visit(queryAST, {
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
    const ignore = new Set()
    for (const pragma of getPragmas(path)) {
      regex(pragma, /ignore:\s*(.*)/m, m =>
        m[1].split(/\s*,\s*/g).forEach(t => ignore.add(t))
      )
    }
    const {
      statements: types,
      generatedTypes,
      imports,
    } = generateFlowTypesFromDocument({
      file,
      query,
      types: analyzedSchema,
      getMutationFunction: addMutationFunction,
      config,
    })
    generatedTypesForQuery.set(declaratorId.name, generatedTypes)

    if (imports.length) addImports(root, imports)

    for (const type of types) {
      if (ignore.has(type.id.name)) continue
      if (!type.comments) type.comments = []
      type.comments.push(j.commentLine(AUTO_GENERATED_COMMENT))
      const {
        id: { name },
      } = type
      const existing = root.find(j.TypeAlias, { id: { name } })
      const parent = j(path).closest(j.ExportNamedDeclaration)
      if (existing.size() > 0) {
        existing.at(0).replaceWith(type)
        addedStatements.add(type)
      } else if (parent.size()) {
        const exportDecl = j.exportNamedDeclaration(type, [], null)
        exportDecl.comments = type.comments
        type.comments = []
        parent.at(0).insertAfter(exportDecl)
        addedStatements.add(exportDecl)
      } else {
        j(path)
          .closest(j.Statement)
          .at(0)
          .insertAfter(type)
        addedStatements.add(type)
      }
    }

    ///////////////////////////////////////////////
    // Add types to <Query> element child functions

    if (queryNames.length) {
      const { Query } = findImports(
        root,
        statement`import {Query} from 'react-apollo'`
      )
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
                  j.typeAnnotation(
                    j.genericTypeAnnotation(
                      j.identifier(variables.id.name),
                      null
                    )
                  )
                )
              )
            }
          }

          const elementPath = path.parentPath
          const childFunction = getChildFunction(elementPath)
          if (childFunction) {
            const firstParam = childFunction.get('params', 0)
            const { data, variables } = onlyValue(generatedTypes.query) || {}
            if (!data) return
            if (firstParam && firstParam.node.type === 'Identifier') {
              const newIdentifier = j.identifier(firstParam.node.name)
              newIdentifier.typeAnnotation = queryRenderPropsAnnotation(
                data,
                variables
              )
              firstParam.replace(newIdentifier)
            }
          }
        })
    }

    //////////////////////////////////////////////////
    // Add types to <Mutation> element child functions

    if (mutationNames.length) {
      const { Mutation } = findImports(
        root,
        statement`import {Mutation} from 'react-apollo'`
      )
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
            const { mutationFunction } =
              onlyValue(generatedTypes.mutation) || {}
            if (!mutationFunction) return
            if (firstParam && firstParam.node.type === 'Identifier') {
              const newIdentifier = j.identifier(firstParam.node.name)
              newIdentifier.typeAnnotation = j.typeAnnotation(
                j.genericTypeAnnotation(
                  j.identifier(mutationFunction.id.name),
                  null
                )
              )
              firstParam.replace(newIdentifier)
            }
          }
        })
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
          if (!data) return
          if (
            path.node.id.type === 'Identifier' ||
            path.node.id.type === 'ObjectPattern'
          ) {
            path.node.id.typeAnnotation = queryRenderPropsAnnotation(
              data,
              variables
            )
          }
          if (path.node.init?.type !== 'CallExpression') return
          const options = path.node.init.arguments[1]
          if (variables && options && options.type === 'ObjectExpression') {
            const variablesProp = options.properties.find(
              p =>
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
                j.typeAnnotation(
                  j.genericTypeAnnotation(j.identifier(variables.id.name), null)
                )
              )
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
          const { data, mutationFunction } =
            onlyValue(generatedTypes.mutation) || {}
          if (!mutationFunction) return
          const {
            node: { id },
          } = path
          if (id.type !== 'ArrayPattern' && id.type !== 'Identifier') return
          const tupleTypes: FlowTypeKind[] = [
            j.genericTypeAnnotation(
              j.identifier(mutationFunction.id.name),
              null
            ),
          ]
          if (data && id.type === 'ArrayPattern' && id.elements.length > 1)
            tupleTypes.push(mutationResultAnnotation(data).typeAnnotation)
            // https://github.com/benjamn/ast-types/issues/372
          ;(id as any).typeAnnotation = j.typeAnnotation(
            j.tupleTypeAnnotation(tupleTypes)
          )
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
          if (!data) return
          if (
            path.node.id.type === 'Identifier' ||
            path.node.id.type === 'ObjectPattern'
          ) {
            path.node.id.typeAnnotation = subscriptionResultAnnotation(
              data,
              variables
            )
          }
          if (path.node.init?.type !== 'CallExpression') return
          const options = path.node.init.arguments[1]
          if (variables && options && options.type === 'ObjectExpression') {
            const variablesProp = options.properties.find(
              p =>
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
                j.typeAnnotation(
                  j.genericTypeAnnotation(j.identifier(variables.id.name), null)
                )
              )
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

  root
    .find(j.TypeAlias)
    .filter(isStale)
    .remove()
  root
    .find(j.ExportNamedDeclaration)
    .filter(isStale)
    .remove()

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
      path =>
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

function* getPragmas(path: ASTPath<any> | null | undefined): Iterable<string> {
  while (path && path.value && path.value.type !== 'Program') {
    const { comments } = path.value
    if (comments) {
      for (const comment of comments) {
        const PRAGMA_REGEX = new RegExp(`^\\s*${PRAGMA}\\s+(.+)`, 'mg')
        const match = PRAGMA_REGEX.exec(comment.value)
        if (match) yield match[1]
      }
    }
    path = path.parent
  }
}
