import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const query = gql\`
fragment F on Bad {
  name
  appearsIn
}

query Test($id: ID!) {
  character(id: $id) {
    id
  }
}
\`
`

export const options = {
  addTypename: false,
  schemaFile: path.resolve(__dirname, '../../starwars.graphql'),
}

export const expectedRejection = `unknown type: Bad`
