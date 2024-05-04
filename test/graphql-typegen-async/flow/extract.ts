import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const query = gql\`
query Test($id: ID!) {
  # @graphql-typegen extract
  character(id: $id) {
    id
    name
    appearsIn
  }
}
\`
`

export const options = {
  addTypename: false,
  schemaFile: path.resolve(__dirname, '../../../starwars.graphql'),
}

export const expected = `
${input}
// @graphql-typegen auto-generated
type TestQueryVariables = { id: string }

// @graphql-typegen auto-generated
type TestQueryData = { character: ?Character }

// @graphql-typegen auto-generated
type Character = {
  id: string,
  name: string,
  appearsIn: Array<?('NEWHOPE' | 'EMPIRE' | 'JEDI')>,
}
`
