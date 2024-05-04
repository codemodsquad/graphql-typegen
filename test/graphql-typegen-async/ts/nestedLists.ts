import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const query = gql\`
query Test($id: ID!) {
  starship(id: $id) {
    id
    name
    coordinates
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
  starship: {
    id: string,
    name: string,
    coordinates: Array<Array<number>> | null,
  } | null,
}
`
