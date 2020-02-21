import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const query = gql\`
# @graphql-to-flow readOnly
query Test($id: ID!) {
  # @graphql-to-flow extract
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
  schemaFile: path.resolve(__dirname, '../../starwars.graphql'),
}

export const expected = `
${input}
// @graphql-to-flow auto-generated
type TestQueryVariables = $ReadOnly<{ id: string }>

// @graphql-to-flow auto-generated
type TestQueryData = $ReadOnly<{ character: ?Character }>

// @graphql-to-flow auto-generated
type Character = $ReadOnly<{
  id: string,
  name: string,
  appearsIn: $ReadOnlyArray<?('NEWHOPE' | 'EMPIRE' | 'JEDI')>,
}>
`
