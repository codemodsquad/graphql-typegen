export type ObjectType = 'ambiguous' | 'exact' | 'inexact'

export type Config = {
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
  /**
   * Map from GraphQL type name to JS type name or named import statement
   */
  externalTypes?: Record<string, string>
}

export type DefaultedConfig = {
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
  /**
   * Map from GraphQL type name to JS type name or named import statement
   */
  externalTypes: Record<string, string>
}

export function applyConfigDefaults(config: Config): DefaultedConfig {
  const tagName = config.tagName || 'gql'
  const addTypename = config.addTypename ?? false
  const useReadOnlyTypes = config.useReadOnlyTypes ?? false
  const objectType = config.objectType || 'ambiguous'
  const externalTypes = config.externalTypes || {}

  return { tagName, addTypename, useReadOnlyTypes, objectType, externalTypes }
}
