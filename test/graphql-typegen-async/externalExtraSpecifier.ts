import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const query = gql\`
query Test($id: ID!) {
  human(id: $id) {
    id
    name
    appearsIn
    # @graphql-typegen external as import { type DateISOString, bar } from 'date-iso-string'
    birthday
  }
}
\`
`

export const options = {
  addTypename: false,
  schemaFile: path.resolve(__dirname, '../../starwars.graphql'),
}

export const expectedRejection = `import declaration must have only one specifier: import { type DateISOString, bar } from 'date-iso-string'`
