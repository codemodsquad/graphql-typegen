import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const query = gql\`
fragment CharacterFields on Character {
  id
  name
}

fragment HumanFields on Human {
  mass
}

query Test($text: String!) {
  search(text: $text) {
    ...CharacterFields
    ...HumanFields
    ... on Droid {
      primaryFunction
    }
  }
}
\`
`

export const options = {
  schemaFile: path.resolve(__dirname, '../../../starwars.graphql'),
}

export const expected = `
${input}
// @graphql-typegen auto-generated
type TestQueryVariables = { text: string }

// @graphql-typegen auto-generated
type TestQueryData = {
  __typename: 'Query',
  search: ?Array<?(
    | (CharacterFields & HumanFields)
    | (CharacterFields & {
      __typename: 'Droid',
      primaryFunction: ?string,
    })
    | { __typename: 'Starship' }
  )>,
}

// @graphql-typegen auto-generated
type HumanFields = {
  __typename: 'Human',
  mass: ?number,
}

// @graphql-typegen auto-generated
type CharacterFields = {
  __typename: 'Human' | 'Droid',
  id: string,
  name: string,
}

`
