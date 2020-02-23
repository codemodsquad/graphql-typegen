import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const query = gql\`
query FooCharacter($id: ID!) {
  character(id: $id) {
    id
    name
    appearsIn
  }
}
\`
`

export const file = 'Foo.js'

export const options = {
  addTypename: false,
  schemaFile: path.resolve(__dirname, '../../starwars.graphql'),
}

export const expected = `
${input}
// @graphql-typegen auto-generated
type CharacterQueryVariables = { id: string }

// @graphql-typegen auto-generated
type CharacterQueryData = {
  character: ?{
    id: string,
    name: string,
    appearsIn: Array<?('NEWHOPE' | 'EMPIRE' | 'JEDI')>,
  },
}
`
