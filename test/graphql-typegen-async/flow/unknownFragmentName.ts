import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const query = gql\`
query Test($id: ID!) {
  character(id: $id) {
    id
    ...Missing
  }
}
\`
`

export const options = {
  addTypename: false,
  validate: false,
  schemaFile: path.resolve(__dirname, '../../../starwars.graphql'),
}

export const expectedRejection = `failed to find fragment: Missing`
