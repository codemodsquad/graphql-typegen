import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const query = gql\`
query Test($id: ID!) {
  character(id: $id) {
    id
    name
    # @graphql-to-flow extract
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
type TestQueryVariables = { id: string }

// @graphql-to-flow auto-generated
type TestQueryData = {
  character: ?{
    id: string,
    name: string,
    appearsIn: Array<?Episode>,
  }
}

// @graphql-to-flow auto-generated
type Episode = 'NEWHOPE' | 'EMPIRE' | 'JEDI'
`
