import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const query = gql\`
# @graphql-typegen addTypename
query Test($id: ID!) {
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
type TestQueryVariables = {
  id: string,
}

// @graphql-typegen auto-generated
type TestQueryData = {
  __typename: 'Query',
  character: {
    __typename: 'Human' | 'Droid',
    id: string,
    name: string,
    appearsIn: Array<'NEWHOPE' | 'EMPIRE' | 'JEDI' | null>,
  } | null,
}
`
