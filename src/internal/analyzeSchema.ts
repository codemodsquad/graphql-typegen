#! /usr/bin/env babel-node --extensions .js,.ts
/* eslint-disable @typescript-eslint/no-use-before-define */

import * as graphql from 'graphql'
import superagent from 'superagent'
import getConfigDirectives, { ConfigDirectives } from './getConfigDirectives'
import { execFileSync } from 'child_process'
import { getIntrospectionQuery } from 'graphql'
import * as fs from 'fs'
import * as path from 'path'

export type TypeKind =
  | 'SCALAR'
  | 'OBJECT'
  | 'INTERFACE'
  | 'UNION'
  | 'ENUM'
  | 'INPUT_OBJECT'
  | 'LIST'
  | 'NON_NULL'

export type IntrospectionArg = {
  name: string
  type: IntrospectionType
  description?: string | null
}

export type AnalyzedArg = {
  name: string
  type: AnalyzedType
  description: string | null | undefined
  config?: ConfigDirectives
}

export type IntrospectionField = {
  name: string
  args: IntrospectionArg[]
  type: IntrospectionType
  description?: string | null
}

export type AnalyzedField = {
  name: string
  args: Record<string, AnalyzedArg>
  type: AnalyzedType
  description: string | null | undefined
  parent?: AnalyzedType
  config?: ConfigDirectives
}

export type IntrospectionInputField = {
  name: string
  type: IntrospectionType
  description: string | null
}

export type AnalyzedInputField = {
  name: string
  type: AnalyzedType
  description: string | null | undefined
  parent?: AnalyzedType
  config?: ConfigDirectives
}

export type EnumValue = {
  name: string
  description?: string | null
}

export type IntrospectionType = {
  kind: TypeKind
  name: string
  description?: string | null
  ofType?: IntrospectionType | null
  fields?: IntrospectionField[] | null
  inputFields?: IntrospectionInputField[] | null
  enumValues?: EnumValue[] | null
  interfaces?: IntrospectionType[] | null
  possibleTypes?: IntrospectionType[] | null
}

export type AnalyzedType = {
  kind: TypeKind
  name: string
  description: string | null | undefined
  ofType?: AnalyzedType | null
  fields?: Record<string, AnalyzedField> | null
  inputFields?: Record<string, AnalyzedInputField> | null
  enumValues?: EnumValue[] | null
  parents?: Array<AnalyzedField | AnalyzedInputField>
  config?: ConfigDirectives
  interfaces?: AnalyzedType[] | null
  possibleTypes?: AnalyzedType[] | null
}

function analyzeTypes(
  data: graphql.IntrospectionQuery,
  {
    cwd,
  }: {
    cwd: string
  }
): Record<string, AnalyzedType> {
  const introspectionTypes: IntrospectionType[] = data.__schema.types as any
  function getDescriptionDirectives(
    node:
      | IntrospectionField
      | IntrospectionInputField
      | IntrospectionType
      | IntrospectionArg
  ): ConfigDirectives {
    const description = (node as any).description || ''
    return getConfigDirectives(description ? description.split(/\n/gm) : [], {
      cwd,
    })
  }

  function convertIntrospectionArgs(
    args: IntrospectionArg[]
  ): Record<string, AnalyzedArg> {
    const AnalyzedArgs: Record<string, AnalyzedArg> = {}
    for (const arg of args) {
      const { name, type, description } = arg
      AnalyzedArgs[name] = {
        name,
        type: convertIntrospectionType(type),
        description,
        config: getDescriptionDirectives(arg),
      }
    }
    return AnalyzedArgs
  }

  function convertIntrospectionField(field: IntrospectionField): AnalyzedField {
    const { name, args, type, description } = field
    return {
      name,
      type: convertIntrospectionType(type),
      args: convertIntrospectionArgs(args),
      description,
      config: getDescriptionDirectives(field),
    }
  }

  function convertIntrospectionFields(
    fields: IntrospectionField[]
  ): Record<string, AnalyzedField> {
    const AnalyzedFields: Record<string, AnalyzedField> = {}
    for (const field of fields) {
      AnalyzedFields[field.name] = convertIntrospectionField(field)
    }
    return AnalyzedFields
  }

  function convertIntrospectionInputField(
    field: IntrospectionInputField
  ): AnalyzedInputField {
    const { name, type, description } = field
    return {
      name,
      type: convertIntrospectionType(type),
      description,
      config: getDescriptionDirectives(field),
    }
  }

  function convertIntrospectionInputFields(
    fields: IntrospectionInputField[]
  ): Record<string, AnalyzedInputField> {
    const AnalyzedFields: Record<string, AnalyzedInputField> = {}
    for (const field of fields) {
      AnalyzedFields[field.name] = convertIntrospectionInputField(field)
    }
    return AnalyzedFields
  }

  function convertIntrospectionType(type: IntrospectionType): AnalyzedType {
    const {
      name,
      description,
      kind,
      ofType,
      fields,
      inputFields,
      enumValues,
      interfaces,
      possibleTypes,
    } = type
    return {
      name,
      description,
      kind,
      ofType: ofType ? convertIntrospectionType(ofType) : null,
      fields: fields ? convertIntrospectionFields(fields) : null,
      inputFields: inputFields
        ? convertIntrospectionInputFields(inputFields)
        : null,
      enumValues,
      config: getDescriptionDirectives(type),
      interfaces: interfaces
        ? interfaces.map((iface) => convertIntrospectionType(iface))
        : null,
      possibleTypes: possibleTypes
        ? possibleTypes.map((type) => convertIntrospectionType(type))
        : null,
    }
  }

  const types: Record<string, AnalyzedType> = {}

  for (const introspectionType of introspectionTypes) {
    const { name } = introspectionType
    if (name) {
      types[name] = convertIntrospectionType(introspectionType)
    }
  }
  function resolveType(
    type: AnalyzedType,
    parent?: AnalyzedField | AnalyzedInputField
  ): AnalyzedType {
    const { name, ofType } = type
    if (name && types[name]) type = types[name]
    if (ofType) type.ofType = resolveType(ofType, parent)
    if (parent) {
      let { parents } = type
      if (!parents) type.parents = parents = []
      parents.push(parent)
    }
    return type
  }
  for (const name in types) {
    const type = types[name]
    const { fields, inputFields, interfaces, possibleTypes } = type
    if (interfaces) {
      type.interfaces = interfaces.map((type) => resolveType(type))
    }
    if (possibleTypes) {
      type.possibleTypes = possibleTypes.map((type) => resolveType(type))
    }
    if (fields) {
      for (const name in fields) {
        const field = fields[name]
        field.type = resolveType(field.type, field)
        for (const name in field.args) {
          const arg = field.args[name]
          arg.type = resolveType(arg.type)
        }
        field.parent = type
      }
    }
    if (inputFields) {
      for (const name in inputFields) {
        const field = inputFields[name]
        field.type = resolveType(field.type, field)
        field.parent = type
      }
    }
  }
  return types
}

export type AnalyzedSchema = Record<string, AnalyzedType>
export type AnalyzeResult = {
  analyzed: AnalyzedSchema
  schema: graphql.GraphQLSchema
}

export async function getIntrospectionData({
  schema,
  schemaFile,
  server,
}: {
  schemaFile?: string
  schema?: graphql.GraphQLSchema
  server?: string
}): Promise<graphql.IntrospectionQuery> {
  if (schemaFile)
    schema = graphql.buildSchema(fs.readFileSync(schemaFile, 'utf8'))
  const introspectionQuery = graphql.parse(getIntrospectionQuery())
  let introspection
  if (schema) introspection = await graphql.execute(schema, introspectionQuery)
  else if (server) {
    introspection = (
      await superagent.post(server).type('json').accept('json').send({
        query: introspectionQuery,
      })
    ).body
  } else {
    throw new Error('schemaFile or server must be configured')
  }
  if (introspection.errors) {
    throw new Error(
      `failed to get introspection data:\n${introspection.errors.join('\n')}`
    )
  }
  return introspection.data
}

export default async function analyzeSchema(options: {
  schemaFile?: string
  schema?: graphql.GraphQLSchema
  server?: string
}): Promise<AnalyzeResult> {
  const data = await getIntrospectionData(options)
  const { schemaFile } = options
  const schema = options.schema || graphql.buildClientSchema(data)

  const cwd = schemaFile ? path.dirname(schemaFile) : process.cwd()
  return {
    analyzed: analyzeTypes(data, { cwd }),
    schema,
  }
}

const schemaFileTimestamps: Map<string, Date> = new Map()
const schemaCache: Map<string, AnalyzeResult> = new Map()

/**
 * Uses execFileSync to analyze the schema synchronously,
 * since jscodeshift transforms unfortunately have to be sync right now
 */
export function analyzeSchemaSync(options: {
  schemaFile?: string
  server?: string
}): AnalyzeResult {
  const file = options.schemaFile
  if (file) {
    const timestamp = schemaFileTimestamps.get(file)
    if (timestamp != null) {
      const latest = fs.statSync(file).mtime
      const cached = schemaCache.get(file)
      if (latest > timestamp) {
        schemaCache.delete(file)
      } else if (cached) {
        return cached
      }
    }
  }

  const data = JSON.parse(
    execFileSync(
      require.resolve('./runSync'),
      [
        JSON.stringify({
          ...options,
          target: __filename,
          method: 'getIntrospectionData',
        }),
      ],
      {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      }
    )
  )
  const cwd = file ? path.dirname(file) : process.cwd()
  const schema = graphql.buildClientSchema(data)
  const analyzed = analyzeTypes(data, { cwd })
  const result = { analyzed, schema }
  if (file) {
    const latest = fs.statSync(file).mtime
    schemaFileTimestamps.set(file, latest)
    schemaCache.set(file, result)
  }
  return result
}
