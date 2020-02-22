import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const foo = {bar: 'baz'}

const query = gql\`
\${JSON.stringify(foo)}
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

export const expectedRejection = `Failed to determine value of expression (line 7:2).
It may be possible, but graphql-typegen doesn't have logic to handle this case.`
