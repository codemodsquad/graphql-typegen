import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const query = gql\`
query Test($id: ID!) {
  human(id: $id) {
    id
    name
    appearsIn
    # @graphql-typegen external as import blah
    birthday
  }
}
\`
`

export const options = {
  addTypename: false,
  schemaFile: path.resolve(__dirname, '../../../starwars.graphql'),
}

export const expectedRejection = `invalid import declaration: import blah (Unexpected token, expected "from" (1:11))`
