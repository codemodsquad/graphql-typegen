export type ObjectType = 'ambiguous' | 'exact' | 'inexact'

export type Config = {
  /**
   * The path to the GraphQL schema file to use
   */
  schemaFile?: string
  /**
   * The GraphQL server URL to use
   */
  server?: string
  /**
   * Name of the template literal tag used to identify template literals
   * containing GraphQL queries in Javascript/Typescript code
   */
  tagName?: string
  /**
   * Whether to add __typename to output types
   */
  addTypename?: boolean
  /**
   * Whether to output readonly types
   */
  useReadOnlyTypes?: boolean
  /**
   * Which Flow object type to output
   */
  objectType?: ObjectType
}

export type DefaultedConfig = {
  /**
   * The path to the GraphQL schema file to use
   */
  schemaFile?: string
  /**
   * The GraphQL server URL to use
   */
  server?: string
  /**
   * Name of the template literal tag used to identify template literals
   * containing GraphQL queries in Javascript/Typescript code
   */
  tagName: string
  /**
   * Whether to add __typename to output types
   */
  addTypename: boolean
  /**
   * Whether to output readonly types
   */
  useReadOnlyTypes: boolean
  /**
   * Which Flow object type to output
   */
  objectType: ObjectType
}

export function applyConfigDefaults(config: Config): DefaultedConfig {
  const { schemaFile, server } = config
  const tagName = config.tagName || 'gql'
  const addTypename = config.addTypename ?? true
  const useReadOnlyTypes = config.useReadOnlyTypes ?? false
  const objectType = config.objectType || 'ambiguous'

  return {
    schemaFile,
    server,
    tagName,
    addTypename,
    useReadOnlyTypes,
    objectType,
  }
}
