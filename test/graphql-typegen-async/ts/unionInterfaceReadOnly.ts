import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const query = gql\`
query Test($text: String!) {
  search(text: $text) {
    ... on Character {
      id
      name
      ... on Human {
        mass
      }
    }
    ... on Droid {
      primaryFunction
    }
  }
}
\`
`

export const options = {
  useReadOnlyTypes: true,
  schemaFile: path.resolve(__dirname, '../../../starwars.graphql'),
}

export const expected = `
${input}
// @graphql-typegen auto-generated
type TestQueryVariables = Readonly<{
  text: string
}>

// @graphql-typegen auto-generated
type TestQueryData = Readonly<{
  __typename: 'Query',
  search: ReadonlyArray<
    | Readonly<{
      __typename: 'Human',
      id: string,
      name: string,
      mass: number | null,
    }>
    | Readonly<{
      __typename: 'Droid',
      id: string,
      name: string,
      primaryFunction: string | null,
    }>
    | Readonly<{
      __typename: 'Starship'
    }>
    | null
  > | null,
}>
`
