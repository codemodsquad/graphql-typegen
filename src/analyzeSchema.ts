#! /usr/bin/env babel-node --extensions .js,.ts
/* eslint-disable @typescript-eslint/no-use-before-define */

import gql from 'graphql-tag'
import * as graphql from 'graphql'
import superagent from 'superagent'
import getConfigDirectives, { ConfigDirectives } from './getConfigDirectives'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import flatted from 'flatted'

const typesQuery = gql`
  fragment typeInfo on __Type {
    name
    kind
    # Fetch really deep just in case someone is doing something like [[[Float!]!]!]!...
    # Haven't devised a plan to deal with arbitrarily deep types yet
    ofType {
      name
      kind
      ofType {
        name
        kind
        ofType {
          name
          kind
          ofType {
            name
            kind
            ofType {
              name
              kind
              ofType {
                name
                kind
                ofType {
                  name
                  kind
                  ofType {
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  query getTypes {
    __schema {
      types {
        kind
        name
        description
        enumValues {
          name
          description
        }
        interfaces {
          name
          description
        }
        possibleTypes {
          ...typeInfo
        }
        fields {
          name
          description
          args {
            name
            description
            type {
              ...typeInfo
            }
          }
          type {
            ...typeInfo
          }
        }
        inputFields {
          name
          description
          type {
            ...typeInfo
          }
        }
      }
    }
  }
`

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
  description: string
}

export type AnalyzedArg = {
  name: string
  type: AnalyzedType
  description: string
  config?: ConfigDirectives
}

export type IntrospectionField = {
  name: string
  args: IntrospectionArg[]
  type: IntrospectionType
  description: string
}

export type AnalyzedField = {
  name: string
  args: Record<string, AnalyzedArg>
  type: AnalyzedType
  description: string
  parent?: AnalyzedType
  config?: ConfigDirectives
}

export type IntrospectionInputField = {
  name: string
  type: IntrospectionType
  description: string
}

export type AnalyzedInputField = {
  name: string
  type: AnalyzedType
  description: string
  parent?: AnalyzedType
  config?: ConfigDirectives
}

export type EnumValue = {
  name: string
  description: string
}

export type IntrospectionType = {
  kind: TypeKind
  name: string
  description: string
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
  description: string
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
  introspectionTypes: Array<IntrospectionType>,
  {
    cwd,
  }: {
    cwd: string
  }
): Record<string, AnalyzedType> {
  function getDescriptionDirectives(
    description: string | undefined
  ): ConfigDirectives {
    return getConfigDirectives(
      description ? description.split(/\n/gm) : [],
      cwd
    )
  }

  function convertIntrospectionArgs(
    args: IntrospectionArg[]
  ): Record<string, AnalyzedArg> {
    const AnalyzedArgs: Record<string, AnalyzedArg> = {}
    for (const { name, type, description } of args) {
      AnalyzedArgs[name] = {
        name,
        type: convertIntrospectionType(type),
        description,
        config: getDescriptionDirectives(description),
      }
    }
    return AnalyzedArgs
  }

  function convertIntrospectionField({
    name,
    args,
    type,
    description,
  }: IntrospectionField): AnalyzedField {
    return {
      name,
      type: convertIntrospectionType(type),
      args: convertIntrospectionArgs(args),
      description,
      config: getDescriptionDirectives(description),
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

  function convertIntrospectionInputField({
    name,
    type,
    description,
  }: IntrospectionInputField): AnalyzedInputField {
    return {
      name,
      type: convertIntrospectionType(type),
      description,
      config: getDescriptionDirectives(description),
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

  function convertIntrospectionType({
    name,
    description,
    kind,
    ofType,
    fields,
    inputFields,
    enumValues,
    interfaces,
    possibleTypes,
  }: IntrospectionType): AnalyzedType {
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
      config: getDescriptionDirectives(description),
      interfaces: interfaces
        ? interfaces.map(iface => convertIntrospectionType(iface))
        : null,
      possibleTypes: possibleTypes
        ? possibleTypes.map(type => convertIntrospectionType(type))
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
      type.interfaces = interfaces.map(type => resolveType(type))
    }
    if (possibleTypes) {
      type.possibleTypes = possibleTypes.map(type => resolveType(type))
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

export default async function analyzeSchema({
  schema,
  schemaFile,
  server,
}: {
  schemaFile?: string
  schema?: graphql.GraphQLSchema
  server?: string
}): Promise<AnalyzedSchema> {
  let result: graphql.ExecutionResult<{
    __schema: { types: IntrospectionType[] }
  }>
  if (schemaFile)
    schema = graphql.buildSchema(fs.readFileSync(schemaFile, 'utf8'))
  if (schema) result = await graphql.execute(schema, typesQuery)
  else if (server) {
    result = (
      await superagent
        .post(server)
        .type('json')
        .accept('json')
        .send({
          query: typesQuery,
        })
    ).body
  } else {
    throw new Error('schema or server must be provided')
  }
  const { data } = result
  if (!data) throw new Error('failed to get introspection query data')
  const {
    __schema: { types },
  } = data
  const cwd = schemaFile ? path.dirname(schemaFile) : process.cwd()
  return analyzeTypes(types, { cwd })
}

const schemaFileTimestamps: Map<string, Date> = new Map()
const schemaCache: Map<string, AnalyzedSchema> = new Map()

/**
 * Uses execFileSync to run analyzeSchema synchronously,
 * since jscodeshift transforms unfortunately have to be sync right now
 */
export function analyzeSchemaSync(options: {
  schemaFile?: string
  server?: string
}): AnalyzedSchema {
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

  const schema = flatted.parse(
    execFileSync(__filename, [JSON.stringify(options)], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    })
  )
  if (file) {
    const latest = fs.statSync(file).mtime
    schemaFileTimestamps.set(file, latest)
    schemaCache.set(file, schema)
  }
  return schema
}

if (!module.parent) {
  analyzeSchema(JSON.parse(process.argv[2])).then(
    (result: any) => {
      process.stdout.write(flatted.stringify(result), () => process.exit(0))
    },
    (error: Error) => {
      console.error(error.stack) // eslint-disable-line no-console
      process.exit(1)
    }
  )
}
