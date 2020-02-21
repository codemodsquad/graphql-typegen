import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const fragment = gql\`
fragment CharacterFields on Character {
  name
  appearsIn
}
\`

const fragment2 = gql\`
\${fragment}
# @graphql-to-flow readOnly
fragment CharacterAndFriends on Character {
  ...CharacterFields
  friends {
    ...CharacterFields
  }
}
\`

const query = gql\`
\${fragment2}
query Test($id: ID!) {
  character(id: $id) {
    id
    ...CharacterAndFriends
  }
}
\`
`

export const options = {
  addTypename: false,
  schemaFile: path.resolve(__dirname, '../../starwars.graphql'),
}

export const expected = `
import gql from 'graphql-tag'

const fragment = gql\`
fragment CharacterFields on Character {
  name
  appearsIn
}
\`

// @graphql-to-flow auto-generated
type CharacterFields = {
  name: string,
  appearsIn: Array<?('NEWHOPE' | 'EMPIRE' | 'JEDI')>,
}

const fragment2 = gql\`
\${fragment}
# @graphql-to-flow readOnly
fragment CharacterAndFriends on Character {
  ...CharacterFields
  friends {
    ...CharacterFields
  }
}
\`

// @graphql-to-flow auto-generated
type CharacterAndFriends = 
  $ReadOnly<{ friends: ?$ReadOnlyArray<?$ReadOnly<CharacterFields>> }> & $ReadOnly<CharacterFields>

const query = gql\`
\${fragment2}
query Test($id: ID!) {
  character(id: $id) {
    id
    ...CharacterAndFriends
  }
}
\`

// @graphql-to-flow auto-generated
type TestQueryVariables = { id: string }

// @graphql-to-flow auto-generated
type TestQueryData = { character: ?({ id: string, } & CharacterAndFriends) }
`
