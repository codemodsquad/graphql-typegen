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
# @graphql-typegen readOnly
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
  schemaFile: path.resolve(__dirname, '../../../starwars.graphql'),
}

export const expected = `
import gql from 'graphql-tag'

const fragment = gql\`
fragment CharacterFields on Character {
  name
  appearsIn
}
\`

// @graphql-typegen auto-generated
type CharacterFields = {
  name: string,
  appearsIn: Array<'NEWHOPE' | 'EMPIRE' | 'JEDI' | null>,
}

const fragment2 = gql\`
\${fragment}
# @graphql-typegen readOnly
fragment CharacterAndFriends on Character {
  ...CharacterFields
  friends {
    ...CharacterFields
  }
}
\`

// @graphql-typegen auto-generated
type CharacterAndFriends = 
  Readonly<{ friends: (ReadonlyArray<Readonly<CharacterFields> | null> | null) }> & Readonly<CharacterFields>

const query = gql\`
\${fragment2}
query Test($id: ID!) {
  character(id: $id) {
    id
    ...CharacterAndFriends
  }
}
\`

// @graphql-typegen auto-generated
type TestQueryVariables = {
  id: string,
}

// @graphql-typegen auto-generated
type TestQueryData = {
  character: 
    | ({
        id: string,
      } & CharacterAndFriends)
    | null,
}
`
