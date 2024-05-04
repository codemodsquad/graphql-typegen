import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const query = gql\`
query Blah($id: ID!) {
  character(id: $id) {
    id
    name
    appearsIn
  }
}
\`

// @graphql-typegen auto-generated
type TestQueryVariables = {
  id: string,
}

// @graphql-typegen auto-generated
type TestQueryData = {
  character: {
    id: string,
    name: string,
    appearsIn: Array<'NEWHOPE' | 'EMPIRE' | 'JEDI' | null>,
  } | null,
}
`

export const options = {
  addTypename: false,
  schemaFile: path.resolve(__dirname, '../../../starwars.graphql'),
}

export const expected = `
import gql from 'graphql-tag'

const query = gql\`
query Blah($id: ID!) {
  character(id: $id) {
    id
    name
    appearsIn
  }
}
\`

// @graphql-typegen auto-generated
type BlahQueryVariables = {
  id: string,
}

// @graphql-typegen auto-generated
type BlahQueryData = {
  character: {
    id: string,
    name: string,
    appearsIn: Array<'NEWHOPE' | 'EMPIRE' | 'JEDI' | null>,
  } | null,
}
`
