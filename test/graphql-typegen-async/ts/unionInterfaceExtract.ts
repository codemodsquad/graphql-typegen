import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const query = gql\`
fragment HumanFields on Human {
  mass
}

fragment CharacterFields on Character {
  id
  name
  ...HumanFields
}

query Test($text: String!) {
  search(text: $text) {
    ...CharacterFields
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
type TestQueryVariables = {
  text: string,
}

// @graphql-typegen auto-generated
type TestQueryData = {
  __typename: 'Query',
  search: Array<
    | CharacterFields
    | (CharacterFields & {
      __typename: 'Droid',
      primaryFunction: string | null,
    })
    | {
      __typename: 'Starship',
    }
    | null
  > | null,
}

// @graphql-typegen auto-generated
type CharacterFields = (
  | ({
    id: string,
    name: string,
  } & HumanFields)
  | {
    __typename: 'Droid',
    id: string,
    name: string,
  }
)

// @graphql-typegen auto-generated
type HumanFields = {
  __typename: 'Human',
  mass: number | null,
}

`
