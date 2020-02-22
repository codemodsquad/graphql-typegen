export const input = `
import gql from 'graphql-tag'

const query = gql\`
query Test($id: ID!) {
  character(id: $id) {
    id
    name
    appearsIn
  }
}
\`
`

export const options = {}

export const expectedRejection = 'schemaFile or server must be configured'
