import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const fragment = gql\`
  fragment CharacterFields on Character {
    name
    appearsIn
    ... on Human {
      mass
    }
    ... on Droid {
      primaryFunction
    }
  }
\`

const fragment2 = gql\`
  \${fragment}
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
  schemaFile: path.resolve(__dirname, '../../../starwars.graphql'),
}

export const expected = `
import gql from 'graphql-tag'

const fragment = gql\`
  fragment CharacterFields on Character {
    name
    appearsIn
    ... on Human {
      mass
    }
    ... on Droid {
      primaryFunction
    }
  }
\`

// @graphql-typegen auto-generated
type CharacterFields = {
  name: string,
  appearsIn: Array<"NEWHOPE" | "EMPIRE" | "JEDI" | null>,
  __typename: "Human",
  mass: number | null,
} | {
  name: string,
  appearsIn: Array<"NEWHOPE" | "EMPIRE" | "JEDI" | null>,
  __typename: "Droid",
  primaryFunction: string | null,
};

const fragment2 = gql\`
  \${fragment}
  fragment CharacterAndFriends on Character {
    ...CharacterFields
    friends {
      ...CharacterFields
    }
  }
\`

// @graphql-typegen auto-generated
type CharacterAndFriends = {
  __typename: "Human" | "Droid",
  friends: Array<CharacterFields | null> | null,
} & CharacterFields;

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
};

// @graphql-typegen auto-generated
type TestQueryData = {
  __typename: "Query",
  character: ({
    __typename: "Human" | "Droid",
    id: string,
  } & CharacterAndFriends) | null,
};
`
