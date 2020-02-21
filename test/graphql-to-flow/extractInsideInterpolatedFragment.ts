import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const fragment = gql\`
fragment CharacterFields on Character {
  name
  # @graphql-to-flow extract
  appearsIn
}
\`

const query = gql\`
\${fragment}
query Test($id: ID!) {
  character(id: $id) {
    id
    ...CharacterFields
  }
}
\`
`

export const options = {
  addTypename: false,
  schemaFile: path.resolve(__dirname, '../../starwars.graphql'),
}

export const expected = `
import gql from 'graphql-tag'

const fragment = gql\`
fragment CharacterFields on Character {
  name
  # @graphql-to-flow extract
  appearsIn
}
\`

// @graphql-to-flow auto-generated
type CharacterFields = {
  name: string,
  appearsIn: Array<?Episode>,
}

// @graphql-to-flow auto-generated
type Episode = 'NEWHOPE' | 'EMPIRE' | 'JEDI'

const query = gql\`
\${fragment}
query Test($id: ID!) {
  character(id: $id) {
    id
    ...CharacterFields
  }
}
\`

// @graphql-to-flow auto-generated
type TestQueryVariables = { id: string }

// @graphql-to-flow auto-generated
type TestQueryData = { character: ?({ id: string, } & CharacterFields) }
`
