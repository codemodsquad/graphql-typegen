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
  schemaFile: path.resolve(__dirname, '../../starwars.graphql'),
}

export const expected = `
${input}
// @graphql-typegen auto-generated
type TestQueryVariables = { text: string }

// @graphql-typegen auto-generated
type TestQueryData = {
  __typename: 'Query',
  search: ?Array<?(
    | {
      id: string,
      name: string,
      __typename: 'Human',
      mass: ?number,
    }
    | {
      __typename: 'Droid',
      id: string,
      name: string,
      primaryFunction: ?string,
    }
    | { __typename: 'Starship' }
  )>,
}
`
