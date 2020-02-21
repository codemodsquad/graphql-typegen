import * as graphql from 'graphql'
import * as fs from 'fs'

const schemaFileTimestamps: Map<string, Date> = new Map()
const schemaCache: Map<string, graphql.GraphQLSchema> = new Map()

export default function loadSchema(file: string): graphql.GraphQLSchema {
  const timestamp = schemaFileTimestamps.get(file)
  if (timestamp != null) {
    const latest = fs.statSync(file).mtime
    const cached = schemaCache.get(file)
    if (latest > timestamp) {
      schemaFileTimestamps.set(file, latest)
      schemaCache.delete(file)
    } else if (cached) {
      return cached
    }
  }
  const schema = graphql.buildSchema(fs.readFileSync(file, 'utf8'))
  schemaCache.set(file, schema)
  return schema
}
