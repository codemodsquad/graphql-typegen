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
type TestQueryVariables = $ReadOnly<{ text: string }>

// @graphql-typegen auto-generated
type TestQueryData = $ReadOnly<{
  __typename: 'Query',
  search: ?$ReadOnlyArray<?(
    | $ReadOnly<{
      __typename: 'Human',
      id: string,
      name: string,
      mass: ?number,
    }>
    | $ReadOnly<{
      __typename: 'Droid',
      id: string,
      name: string,
      primaryFunction: ?string,
    }>
    | $ReadOnly<{ __typename: 'Starship' }>
  )>,
}>
`
