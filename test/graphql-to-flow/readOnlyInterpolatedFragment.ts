import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const fragment = gql\`
# @graphql-to-flow readOnly
fragment CharacterFields on Character {
  name
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
# @graphql-to-flow readOnly
fragment CharacterFields on Character {
  name
  appearsIn
}
\`

// @graphql-to-flow auto-generated
type CharacterFields = $ReadOnly<{
  name: string,
  appearsIn: $ReadOnlyArray<?('NEWHOPE' | 'EMPIRE' | 'JEDI')>,
}>

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
