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
}

export function applyConfigDefaults(config: Config): DefaultedConfig {
  const tagName = config.tagName || 'gql'
  const addTypename = config.addTypename ?? true
  const useReadOnlyTypes = config.useReadOnlyTypes ?? false
  const objectType = config.objectType || 'ambiguous'

  return { tagName, addTypename, useReadOnlyTypes, objectType }
}
