import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const appearsIn = 'appearsIn'

const characterFields = \`
  name
  \${appearsIn}
\`

const query = gql\`
query Test($id: ID!) {
  character(id: $id) {
    id
    \${characterFields}
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
    appearsIn: Array<?('NEWHOPE' | 'EMPIRE' | 'JEDI')>,
  },
}
`
