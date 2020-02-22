import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const query = gql\`
\${foo}
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
  schemaFile: path.resolve(__dirname, '../../starwars.graphql'),
}

export const expectedRejection = `Failed to determine value of expression (line 5:2).
It may be possible, but graphql-typegen doesn't have logic to handle this case.`
